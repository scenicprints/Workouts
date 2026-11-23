import { db, type Plan, type Routine, type Session, type SessionEntry, type SetEntry, type Unit } from '../db'
import { latestEntryFor, nextTarget, planPosition } from './progression'

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
}

/**
 * Start a session from a routine. Targets come from the last time this routine was done:
 * hit every set last time and the weight goes up by the increment, otherwise it repeats.
 */
export async function startRoutineSession(routine: Routine, options: StartOptions = {}): Promise<number> {
  const existing = await activeSession()
  if (existing?.id) return existing.id
  const history = await db.sessions.where('routineId').equals(routine.id!).toArray()
  let planFields: Partial<Session> = {}
  let isDeload = false
  if (options.plan?.id) {
    const pos = planPosition(options.plan, options.plan.cursor)
    isDeload = pos.isDeload
    planFields = { planId: options.plan.id, planWeek: pos.week, planDay: pos.day }
  }
  const entries: SessionEntry[] = routine.items.map((item) => {
    const previous = latestEntryFor(history, item.exerciseId, routine.id)
    const target = nextTarget(item, previous, { isDeload, unit: options.unit })
    return {
      exerciseId: item.exerciseId,
      restSec: item.restSec,
      increment: item.increment,
      group: item.group,
      sets: blankSets(item.sets, target.weight, target.reps),
    }
  })
  return (await db.sessions.add({
    name: routine.name,
    startedAt: Date.now(),
    finishedAt: IN_PROGRESS,
    routineId: routine.id,
    entries,
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
