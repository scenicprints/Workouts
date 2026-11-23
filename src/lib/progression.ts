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
  reason: 'start' | 'suggested' | 'repeat' | 'increase' | 'reps' | 'reset' | 'deload'
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
  /** The entry before `previous`, used to spot two misses in a row. */
  earlier?: SessionEntry
  /** Used when the routine has no starting weight (0) and there is no history yet. */
  suggestedWeight?: number
}

/**
 * Decide the next target for a routine item given the most recent entries for that exercise.
 * - No history: the routine's starting weight, or a suggestion when that is 0.
 * - Hit every set: add the increment. With a rep range, reps climb first and the weight goes up
 *   only once every set hits the top of the range; reps then drop back to the bottom.
 * - Missed: repeat the same weight and reps.
 * - Missed twice in a row at the same weight: drop 10% instead of repeating a third time.
 * - Deload week: 90% of what it would otherwise be, rounded to a plate.
 */
export function nextTarget(item: RoutineItem, previous: SessionEntry | undefined, options: NextTargetOptions = {}): Target {
  const unit = options.unit ?? 'kg'
  const ranged = hasRepRange(item)
  const bottom = ranged ? (item.minReps as number) : item.reps
  let weight = item.weight
  let reps = bottom
  let reason: Target['reason'] = 'start'
  const last = previous ? workingWeight(previous.sets) : null
  if (previous && last !== null) {
    const lastReps = Math.min(Math.max(targetRepsOf(previous) ?? bottom, bottom), item.reps)
    if (hitAllTargets(previous.sets)) {
      if (ranged && lastReps < item.reps) {
        weight = last
        reps = lastReps + 1
        reason = 'reps'
      } else {
        weight = last + (previous.increment || item.increment)
        reason = 'increase'
      }
    } else {
      weight = last
      reps = lastReps
      reason = 'repeat'
      const before = options.earlier
      if (before && !hitAllTargets(before.sets) && workingWeight(before.sets) === last && (targetRepsOf(before) ?? bottom) === lastReps) {
        weight = roundToPlate(last * 0.9, unit)
        reps = bottom
        reason = 'reset'
      }
    }
  } else if (weight <= 0 && options.suggestedWeight) {
    weight = options.suggestedWeight
    reason = 'suggested'
  }
  if (options.isDeload) {
    weight = roundToPlate(weight * 0.9, unit)
    reason = 'deload'
  }
  return { weight, reps, reason }
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
