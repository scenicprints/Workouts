import type { Exercise, LoadLimits, Session, Unit } from '../db'

/**
 * The smallest change in load a piece of equipment allows, and where that knowledge came from.
 * Dumbbell racks move in 5 lb, most plate-loaded lifts in 5 lb, selectorised machines in 10 or
 * 15 lb, cable stacks in whatever the gym bought. The routine's `increment` is only a seed: the
 * real step is learned from the weights actually logged for the exercise, unless the user has set
 * the equipment's step, floor and ceiling on the exercise itself.
 */
export interface LoadStep {
  step: number
  /** `set` when the user typed it on the exercise; `logged` once two or more distinct weights pin the grid down; else the seed or an equipment default. */
  source: 'set' | 'logged' | 'seed' | 'equipment'
  /** A weight known to exist on this equipment; every target is a whole number of steps from it. */
  anchor: number
  /** The lightest weight the equipment goes to, when the user set one. */
  min?: number
  /** The heaviest weight the equipment goes to, when the user set one. Undefined is no limit. */
  max?: number
}

/** Step sizes that real equipment comes in, largest first. */
const CANDIDATES: Record<Unit, number[]> = {
  lb: [25, 20, 15, 12.5, 10, 7.5, 5, 2.5, 1.25],
  kg: [10, 7.5, 5, 4, 2.5, 2, 1.25, 1, 0.5],
}

/** The finest step a candidate is tested against, so float noise does not split a grid. */
const EPS = 1e-6

function onGrid(weight: number, anchor: number, step: number): boolean {
  const k = (weight - anchor) / step
  return Math.abs(k - Math.round(k)) < 1e-3
}

/** Every weight (> 0) logged on a completed work set for an exercise, newest session first. */
export function loggedWeights(sessions: Session[], exerciseId: number): number[] {
  const out: number[] = []
  for (const s of [...sessions].filter((x) => x.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))) {
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId) continue
      for (const set of e.sets) if (set.done && set.kind !== 'warmup' && set.weight > 0) out.push(set.weight)
    }
  }
  return out
}

/**
 * Learn the equipment's step from logged weights. The grid is anchored on the most recent weight,
 * and the answer is the largest real-world step that at least 80% of the distinct weights sit on
 * (one mistyped number does not shrink the step to 1 lb). Undefined with fewer than two distinct
 * weights: a single number says nothing about spacing.
 */
export function learnStep(weights: number[], unit: Unit): LoadStep | undefined {
  const distinct = [...new Set(weights.filter((w) => w > 0).map((w) => Math.round(w * 1000) / 1000))]
  if (distinct.length < 2) return undefined
  const anchor = distinct[0]
  for (const step of CANDIDATES[unit]) {
    const hits = distinct.filter((w) => onGrid(w, anchor, step)).length
    if (hits >= 2 && hits / distinct.length >= 0.8 - EPS) return { step, source: 'logged', anchor }
  }
  return undefined
}

/** What the equipment type usually moves in when nothing has been logged yet. */
export function equipmentStep(exercise: Pick<Exercise, 'equipment' | 'bodyweight'> | undefined, unit: Unit): number {
  if (!exercise) return unit === 'kg' ? 2.5 : 5
  if (exercise.bodyweight) return 0
  switch (exercise.equipment) {
    case 'Cardio':
    case 'Other':
      return 0
    case 'Machine':
      return unit === 'kg' ? 5 : 10
    default:
      return unit === 'kg' ? 2.5 : 5
  }
}

/**
 * The step to use for an exercise this session: learned from history when there is enough of it,
 * else the routine's seed increment, else the equipment default. A seed of exactly 0 on a
 * bodyweight or cardio item means "there is no load to add" and is kept as is.
 */
export function resolveStep(weights: number[], seed: number | undefined, exercise: Pick<Exercise, 'equipment' | 'bodyweight' | 'load'> | undefined, unit: Unit): LoadStep {
  const limits = cleanLimits(exercise?.load)
  const learned = learnStep(weights, unit)
  const base: LoadStep = (() => {
    if (limits.step !== undefined) return { step: limits.step, source: 'set', anchor: limits.min ?? weights[0] ?? 0 }
    if (learned) return learned
    const anchor = weights[0] ?? 0
    if (seed !== undefined && seed > 0) return { step: seed, source: 'seed', anchor }
    if (seed === 0 && equipmentStep(exercise, unit) === 0) return { step: 0, source: 'seed', anchor }
    return { step: equipmentStep(exercise, unit), source: 'equipment', anchor }
  })()
  // A floor the user typed is a weight that exists, so it is the best anchor for the grid.
  if (limits.min !== undefined) base.anchor = limits.min
  return { ...base, min: limits.min, max: limits.max }
}

/** Drop limits that make no sense (negatives, a ceiling under the floor, a zero step). */
export function cleanLimits(load: LoadLimits | undefined): LoadLimits {
  if (!load) return {}
  const out: LoadLimits = {}
  if (load.step !== undefined && load.step > 0) out.step = load.step
  if (load.min !== undefined && load.min > 0) out.min = load.min
  if (load.max !== undefined && load.max > 0 && (out.min === undefined || load.max >= out.min)) out.max = load.max
  return out
}

/** Keep a weight inside the equipment's floor and ceiling. */
export function clampToLimits(weight: number, limits: Pick<LoadStep, 'min' | 'max'>): number {
  let w = weight
  if (limits.max !== undefined && w > limits.max) w = limits.max
  if (limits.min !== undefined && w < limits.min) w = limits.min
  return w
}

/** The grid weight nearest to `weight`. A step of 0 means any weight is fine. */
export function snapToGrid(weight: number, step: number, anchor = 0): number {
  if (step <= 0) return weight
  const snapped = anchor + Math.round((weight - anchor) / step) * step
  return Math.round(snapped * 1000) / 1000
}

/**
 * The grid weight for a drop to `fraction` of `weight` (a deload or a stall reset). Always below
 * the starting weight when the equipment allows a drop of 25% or less; on something so light that
 * one step down is more than a quarter of the load, the weight stays and the drop has to come from
 * sets or reps instead.
 */
export function dropToGrid(weight: number, fraction: number, step: number, anchor = 0): number {
  if (step <= 0) return Math.round(weight * fraction * 1000) / 1000
  let w = snapToGrid(weight * fraction, step, anchor)
  if (w >= weight) w -= step
  if (w <= 0 || (weight - w) / weight > 0.25 + EPS) return weight
  return Math.round(w * 1000) / 1000
}

/** How big one step is as a share of the working weight; Infinity for an empty bar or zero load. */
export function stepShare(step: number, weight: number): number {
  if (step <= 0) return 0
  if (weight <= 0) return Infinity
  return step / weight
}

/**
 * Extra reps to climb above the routine's top rep target before adding weight, because one step on
 * this equipment is a big jump at this load. A 10 lb step on an 80 lb pulldown (12%) earns two more
 * reps; a 5 lb step on 20 lb lateral raises (25%) earns four. Nothing when a step is 10% or less.
 */
export function repBuffer(step: number, weight: number): number {
  const share = stepShare(step, weight)
  if (share > 0.2) return 4
  if (share > 0.1) return 2
  return 0
}
