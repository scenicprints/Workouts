import type { Plan, RoutineItem, Session, SessionEntry, SetEntry, Unit } from '../db'
import { dropToGrid, repBuffer, snapToGrid, stepShare, type LoadStep } from './loadStep'

/** Epley estimated one-rep max. Returns 0 for empty sets. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/** Round to the nearest plate-friendly step for the unit. */
export function roundToPlate(weight: number, unit: Unit): number {
  const step = unit === 'kg' ? 2.5 : 5
  return Math.round(weight / step) * step
}

export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to) return value
  const converted = from === 'kg' ? value * 2.2046226218 : value / 2.2046226218
  return Math.round(converted * 100) / 100
}

/** True when every completed set reached the target reps and at least one set was completed. */
export function hitAllTargets(sets: SetEntry[]): boolean {
  const done = sets.filter((s) => s.done && s.kind !== 'warmup')
  if (done.length === 0) return false
  return done.every((s) => s.reps >= (s.targetReps ?? 0))
}

/** The heaviest weight used on a completed set, or null if nothing was completed. */
export function workingWeight(sets: SetEntry[]): number | null {
  const done = sets.filter((s) => s.done && s.kind !== 'warmup')
  if (done.length === 0) return null
  return Math.max(...done.map((s) => s.weight))
}

export interface Target {
  weight: number
  reps: number
  reason: 'start' | 'suggested' | 'repeat' | 'increase' | 'jump' | 'reps' | 'held' | 'reset' | 'deload'
  /** The working weight last time, when there was one. */
  from?: number
  /** The step the equipment moves in, as used for this target. */
  step?: number
}

/** Total reps across completed work sets. */
export function totalReps(sets: SetEntry[]): number {
  return sets.filter((s) => s.done && s.kind !== 'warmup').reduce((a, s) => a + s.reps, 0)
}

/** True when every completed work set beat its target by `margin` or more: the weight was plainly too light. */
export function overshot(sets: SetEntry[], margin = 2): boolean {
  const done = sets.filter((s) => s.done && s.kind !== 'warmup' && s.targetReps !== undefined)
  if (done.length === 0) return false
  return done.every((s) => s.reps >= (s.targetReps as number) + margin)
}

/** The rep target the last session was working to (the highest target among its work sets). */
export function targetRepsOf(entry: SessionEntry | undefined): number | undefined {
  if (!entry) return undefined
  const targets = entry.sets.filter((s) => s.kind !== 'warmup' && s.targetReps !== undefined).map((s) => s.targetReps as number)
  return targets.length ? Math.max(...targets) : undefined
}

/** True when the item uses a rep range (double progression) rather than a fixed rep target. */
export function hasRepRange(item: Pick<RoutineItem, 'reps' | 'minReps'>): boolean {
  return item.minReps !== undefined && item.minReps > 0 && item.minReps < item.reps
}

export interface NextTargetOptions {
  isDeload?: boolean
  unit?: Unit
  /** The entry before `previous`, used to spot two misses in a row. Superseded by `history` when given. */
  earlier?: SessionEntry
  /** Entries before `previous`, newest first, for counting a run of misses. */
  history?: SessionEntry[]
  /** Used when the routine has no starting weight (0) and there is no history yet. */
  suggestedWeight?: number
  /** Readiness says the weight may go up after a clean session. Default true. */
  allowIncrease?: boolean
  /** Readiness says reps may climb within a range. Default true. */
  allowRepClimb?: boolean
  /**
   * Bodyweight is trending down. Holding a weight is then a win, so a reset needs reps to fall
   * between two misses, or four misses in a row, rather than two misses of any kind.
   */
  cutting?: boolean
  /**
   * What the equipment moves in, learned from logged weights (see `lib/loadStep.ts`). Every target
   * lands on this grid. Without it, the increment stored on the previous entry or the routine item
   * is taken as the step, anchored on the last weight.
   */
  step?: Pick<LoadStep, 'step' | 'anchor'>
}

/**
 * Decide the next target for a routine item given the most recent entries for that exercise.
 * - No history: the routine's starting weight, or a suggestion when that is 0, snapped to the grid.
 * - Hit every set: add one step. With a rep range, reps climb first and the weight goes up only
 *   once every set hits the top of the range; reps then drop back to the bottom.
 * - One step is a big jump at this load (over 10%): reps climb above the routine's top target first,
 *   two extra reps over 10%, four over 20%, so a 10 lb stack on a light pulldown is not an 11% leap.
 * - Beat every set by two or more reps: the weight was too light, so add two steps when two steps
 *   stay within 10% of the load, else one.
 * - Readiness can hold the weight (and the reps) in place after a clean session.
 * - Missed: repeat the same weight and reps.
 * - Missed twice in a row at the same weight: drop to the grid weight nearest 90% instead of
 *   repeating a third time. While cutting, only when reps fell between the two misses, or after
 *   four misses in a row. When the equipment is too coarse to drop, reps go back to the bottom.
 * - Deload week: the grid weight nearest 90% of what it would otherwise be.
 */
export function nextTarget(item: RoutineItem, previous: SessionEntry | undefined, options: NextTargetOptions = {}): Target {
  const allowIncrease = options.allowIncrease ?? true
  const allowRepClimb = options.allowRepClimb ?? true
  const last = previous ? workingWeight(previous.sets) : null
  const step = options.step?.step ?? (previous ? previous.increment || item.increment : item.increment)
  const anchor = options.step?.anchor ?? last ?? item.weight
  const buffer = last !== null ? repBuffer(step, last) : 0
  const ranged = hasRepRange(item) || buffer > 0
  const bottom = hasRepRange(item) ? (item.minReps as number) : item.reps
  const top = item.reps + buffer
  let weight = item.weight
  let reps = bottom
  let reason: Target['reason'] = 'start'
  if (previous && last !== null) {
    const lastReps = Math.min(Math.max(targetRepsOf(previous) ?? bottom, bottom), top)
    if (hitAllTargets(previous.sets)) {
      if (!allowIncrease && (!ranged || lastReps >= top || !allowRepClimb)) {
        weight = last
        reps = lastReps
        reason = 'held'
      } else if (overshot(previous.sets) && allowIncrease) {
        const steps = stepShare(step * 2, last) <= 0.1 ? 2 : 1
        weight = last + step * steps
        reason = steps === 2 ? 'jump' : 'increase'
      } else if (ranged && lastReps < top) {
        weight = last
        reps = lastReps + 1
        reason = 'reps'
      } else {
        weight = last + step
        reason = 'increase'
      }
    } else {
      weight = last
      reps = lastReps
      reason = 'repeat'
      const sameTarget = (e: SessionEntry) => !hitAllTargets(e.sets) && workingWeight(e.sets) === last && (targetRepsOf(e) ?? bottom) === lastReps
      const older = options.history ?? (options.earlier ? [options.earlier] : [])
      let misses = 1
      for (const e of older) {
        if (!sameTarget(e)) break
        misses++
      }
      const fell = older.length > 0 && sameTarget(older[0]) && totalReps(previous.sets) < totalReps(older[0].sets)
      const reset = options.cutting ? (misses >= 2 && fell) || misses >= 4 : misses >= 2
      if (reset) {
        weight = dropToGrid(last, 0.9, step, anchor)
        reps = bottom
        reason = 'reset'
      }
    }
  } else if (weight <= 0 && options.suggestedWeight) {
    weight = snapToGrid(options.suggestedWeight, step, anchor)
    reason = 'suggested'
  }
  let from = last ?? undefined
  if (options.isDeload) {
    from ??= weight
    weight = dropToGrid(weight, 0.9, step, anchor)
    reason = 'deload'
  }
  weight = Math.round(weight * 1000) / 1000
  return { weight, reps, reason, from, step }
}

/** The most recent finished entries for an exercise, newest first, optionally scoped to a routine. */
export function recentEntriesFor(sessions: Session[], exerciseId: number, routineId?: number, count = 2): SessionEntry[] {
  const finished = sessions
    .filter((s) => s.finishedAt && (routineId === undefined || s.routineId === routineId))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  const out: SessionEntry[] = []
  for (const s of finished) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done))
    if (entry) out.push(entry)
    if (out.length >= count) break
  }
  return out
}

/** Find the latest finished session entry for an exercise, optionally scoped to a routine. */
export function latestEntryFor(sessions: Session[], exerciseId: number, routineId?: number): SessionEntry | undefined {
  return recentEntriesFor(sessions, exerciseId, routineId, 1)[0]
}

/**
 * A starting weight for an exercise the routine leaves at 0, from anything logged for it before
 * (any routine). Same rep target as last time: reuse that weight. Otherwise 90% of the weight the
 * best recent set predicts for the target reps, rounded to a plate. Undefined with no history.
 */
export function suggestStartingWeight(sessions: Session[], exerciseId: number, reps: number, unit: Unit): number | undefined {
  const [latest] = recentEntriesFor(sessions, exerciseId, undefined, 1)
  if (!latest) return undefined
  const done = latest.sets.filter((s) => s.done && s.kind !== 'warmup' && s.weight > 0)
  if (done.length === 0) return undefined
  const heaviest = done.reduce((a, b) => (b.weight > a.weight ? b : a))
  if ((targetRepsOf(latest) ?? heaviest.reps) === reps) return heaviest.weight
  const best = Math.max(...done.map((s) => estimate1RM(s.weight, s.reps)))
  const atReps = reps <= 1 ? best : best / (1 + reps / 30)
  const suggested = roundToPlate(atReps * 0.9, unit)
  return suggested > 0 ? suggested : undefined
}

export interface PlanPosition {
  week: number
  day: number
  index: number
  isDeload: boolean
  complete: boolean
}

/**
 * Where the user is in a plan, based on how many plan sessions they have finished.
 * Weeks and days are 1-based for display.
 */
export function planPosition(plan: Plan, finishedPlanSessions: number): PlanPosition {
  const perWeek = Math.max(plan.days.length, 1)
  const total = perWeek * plan.weeks
  const index = finishedPlanSessions
  if (index >= total) {
    return { week: plan.weeks, day: perWeek, index, isDeload: false, complete: true }
  }
  const week = Math.floor(index / perWeek) + 1
  const day = (index % perWeek) + 1
  const isDeload = plan.deloadEvery > 0 && week % plan.deloadEvery === 0
  return { week, day, index, isDeload, complete: false }
}

export function sessionVolume(session: Session): number {
  return session.entries.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.done && s.kind !== 'warmup').reduce((a, s) => a + s.reps * s.weight, 0),
    0,
  )
}

export function sessionSetCount(session: Session): number {
  return session.entries.reduce((sum, e) => sum + e.sets.filter((s) => s.done && s.kind !== 'warmup').length, 0)
}
