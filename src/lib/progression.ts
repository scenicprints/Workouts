import type { Plan, RoutineItem, Session, SessionEntry, SetEntry, Unit } from '../db'

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
  reason: 'start' | 'repeat' | 'increase' | 'deload'
}

/**
 * Decide the next target for a routine item given the most recent entry for that exercise.
 * - No history: use the routine's starting weight.
 * - Hit every set: add the increment.
 * - Missed: repeat the same weight.
 * - Deload week: 90% of what it would otherwise be, rounded to a plate.
 */
export function nextTarget(
  item: RoutineItem,
  previous: SessionEntry | undefined,
  options: { isDeload?: boolean; unit?: Unit } = {},
): Target {
  const unit = options.unit ?? 'kg'
  let weight = item.weight
  let reason: Target['reason'] = 'start'
  if (previous) {
    const last = workingWeight(previous.sets)
    if (last !== null) {
      if (hitAllTargets(previous.sets)) {
        weight = last + (previous.increment || item.increment)
        reason = 'increase'
      } else {
        weight = last
        reason = 'repeat'
      }
    }
  }
  if (options.isDeload) {
    weight = roundToPlate(weight * 0.9, unit)
    reason = 'deload'
  }
  return { weight, reps: item.reps, reason }
}

/** Find the latest finished session entry for an exercise, optionally scoped to a routine. */
export function latestEntryFor(
  sessions: Session[],
  exerciseId: number,
  routineId?: number,
): SessionEntry | undefined {
  const finished = sessions
    .filter((s) => s.finishedAt && (routineId === undefined || s.routineId === routineId))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  for (const s of finished) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done))
    if (entry) return entry
  }
  return undefined
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
