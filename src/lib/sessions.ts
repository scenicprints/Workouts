import { db, type Plan, type Routine, type Session, type SessionEntry, type SessionReadiness, type SetEntry, type Unit } from '../db'
import { hasRepRange, nextTarget, planPosition, recentEntriesFor, suggestStartingWeight, type Target } from './progression'
import { assessReadiness, canAssess, type Readiness } from './readiness'
import { formatWeight } from './format'

/** In-progress sessions store finishedAt = 0 so Dexie can index them. */
export const IN_PROGRESS = 0

export async function activeSession(): Promise<Session | undefined> {
  return db.sessions.where('finishedAt').equals(IN_PROGRESS).first()
}

function blankSets(count: number, weight: number, reps: number): SetEntry[] {
  return Array.from({ length: count }, () => ({ reps, weight, done: false, kind: 'work' as const, targetReps: reps, targetWeight: weight }))
}

export async function startEmptySession(name = 'Workout'): Promise<number> {
  const existing = await activeSession()
  if (existing?.id) return existing.id
  return (await db.sessions.add({ name, startedAt: Date.now(), finishedAt: IN_PROGRESS, entries: [] })) as number
}

export interface StartOptions {
  plan?: Plan
  unit?: Unit
  /** Skip the readiness read (tests, or a user who turned it off). */
  readiness?: Readiness | false
}

const DAY = 86400000

/**
 * The readiness read for right now, from the last five weeks of Health Connect data and finished
 * sessions. Null when there is not enough data to say anything, in which case nothing is gated.
 */
export async function currentReadiness(unit: Unit, now = Date.now()): Promise<Readiness | null> {
  const [daily, body, sessions] = await Promise.all([
    db.daily.where('date').above(now - 36 * DAY).toArray(),
    db.body.where('date').above(now - 36 * DAY).toArray(),
    db.sessions.where('finishedAt').above(IN_PROGRESS).toArray(),
  ])
  if (!canAssess(daily, body, sessions, now)) return null
  return assessReadiness({ daily, body, sessions, unit, now })
}

/** The one-line explanation of a target that sits under the exercise name during the session. */
export function describeTarget(target: Target, previous: SessionEntry | undefined, unit: Unit, readiness?: Readiness | null): string {
  const inc = (n: number) => `+${formatWeight(n, unit)}`
  switch (target.reason) {
    case 'start':
      return target.weight > 0 ? 'Starting weight' : 'Pick a weight: 3 reps in reserve'
    case 'suggested':
      return 'Suggested from your history'
    case 'increase':
      return `${inc(previous?.increment || 0)} after a clean session`
    case 'jump':
      return `${inc((previous?.increment || 0) * 2)}: last time was too easy`
    case 'reps':
      return `Reps ${target.reps - 1} → ${target.reps}, same weight`
    case 'held':
      return `Held: ${readiness?.holdReason ?? 'recovery'}`
    case 'repeat':
      return 'Same again: missed last time'
    case 'reset':
      return '−10% after stalling, build back up'
    case 'deload':
      return readiness?.rules.deload ? 'Deload at 90%: two red weeks' : 'Deload at 90%'
  }
}

/**
 * Start a session from a routine. Targets come from the last time this routine was done:
 * hit every set last time and the weight goes up by the increment, otherwise it repeats
 * (and drops 10% after a stall). Exercises with no starting weight get a suggestion from
 * anything logged for them before. Readiness (watch, scale, recent results) can hold weights,
 * drop a set, or turn the session into a deload; each entry carries a note saying why.
 */
export async function startRoutineSession(routine: Routine, options: StartOptions = {}): Promise<number> {
  const existing = await activeSession()
  if (existing?.id) return existing.id
  const finished = await db.sessions.where('finishedAt').above(IN_PROGRESS).toArray()
  const history = finished.filter((s) => s.routineId === routine.id)
  const unit = options.unit ?? 'kg'
  const readiness = options.readiness === false ? null : (options.readiness ?? (await currentReadiness(unit)))
  const rules = readiness?.rules
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id!, e]))
  let planFields: Partial<Session> = {}
  let isDeload = false
  let dropSet = false
  if (options.plan?.id) {
    const pos = planPosition(options.plan, options.plan.cursor)
    isDeload = pos.isDeload
    dropSet = isDeload && !!options.plan.deloadDropSet
    planFields = { planId: options.plan.id, planWeek: pos.week, planDay: pos.day }
  }
  const earlyDeload = !!rules?.deload && !isDeload
  if (earlyDeload) isDeload = true
  if (rules?.dropSet || earlyDeload) dropSet = true
  const entries: SessionEntry[] = routine.items.map((item) => {
    const [previous, ...older] = recentEntriesFor(history, item.exerciseId, routine.id, 5)
    const firstReps = hasRepRange(item) ? (item.minReps as number) : item.reps
    const suggestedWeight = !previous && item.weight <= 0 ? suggestStartingWeight(finished, item.exerciseId, firstReps, unit) : undefined
    const compound = !!exercises.get(item.exerciseId)?.compound
    const target = nextTarget(item, previous, {
      isDeload,
      unit,
      history: older,
      suggestedWeight,
      allowIncrease: rules ? (compound ? rules.increaseCompounds : rules.increaseAccessories) : true,
      allowRepClimb: rules ? rules.climbReps : true,
      cutting: rules?.cutting ?? false,
    })
    const sets = dropSet ? Math.max(1, item.sets - 1) : item.sets
    return {
      exerciseId: item.exerciseId,
      restSec: item.restSec,
      increment: item.increment,
      group: item.group,
      note: describeTarget(target, previous, unit, readiness),
      sets: blankSets(sets, target.weight, target.reps),
    }
  })
  const stored: SessionReadiness | undefined = readiness ? { level: readiness.level, score: readiness.score, reasons: readiness.reasons, earlyDeload: earlyDeload || undefined } : undefined
  return (await db.sessions.add({
    name: routine.name,
    startedAt: Date.now(),
    finishedAt: IN_PROGRESS,
    routineId: routine.id,
    entries,
    readiness: stored,
    ...planFields,
  })) as number
}

export async function finishSession(id: number): Promise<void> {
  const session = await db.sessions.get(id)
  if (!session) return
  // Drop sets that were never completed so history only shows real work.
  const entries = session.entries
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
    .filter((e) => e.sets.length > 0)
  await db.sessions.update(id, { finishedAt: Date.now(), entries })
  if (session.planId) {
    const plan = await db.plans.get(session.planId)
    if (plan) await db.plans.update(plan.id!, { cursor: plan.cursor + 1, startedAt: plan.startedAt ?? session.startedAt })
  }
}

export async function discardSession(id: number): Promise<void> {
  await db.sessions.delete(id)
}

export interface NextWorkout {
  plan: Plan
  routine: Routine | null
  week: number
  day: number
  label: string
  isDeload: boolean
  complete: boolean
  index: number
  total: number
}

/** Next workout for the active plan, or null when there is no active plan. */
export async function nextPlanWorkout(): Promise<NextWorkout | null> {
  const plan = await db.plans.filter((p) => p.active).first()
  if (!plan?.id) return null
  const pos = planPosition(plan, plan.cursor)
  const total = plan.days.length * plan.weeks
  if (pos.complete) return { plan, routine: null, week: pos.week, day: pos.day, label: 'Plan complete', isDeload: false, complete: true, index: plan.cursor, total }
  const dayDef = plan.days[pos.day - 1]
  const routine = dayDef?.routineId ? ((await db.routines.get(dayDef.routineId)) ?? null) : null
  return { plan, routine, week: pos.week, day: pos.day, label: dayDef?.label ?? `Day ${pos.day}`, isDeload: pos.isDeload, complete: false, index: plan.cursor, total }
}

/** Move past the current day without logging anything. You decide, the app does not. */
export async function skipPlanDay(plan: Plan): Promise<void> {
  const total = plan.days.length * plan.weeks
  await db.plans.update(plan.id!, { cursor: Math.min(plan.cursor + 1, total), startedAt: plan.startedAt ?? Date.now() })
}

/** Jump the plan to any day index (0-based across weeks). */
export async function jumpPlanTo(plan: Plan, index: number): Promise<void> {
  const total = plan.days.length * plan.weeks
  await db.plans.update(plan.id!, { cursor: Math.max(0, Math.min(index, total)) })
}
