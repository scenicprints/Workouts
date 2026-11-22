import { db, type Plan, type Routine, type Session, type SessionEntry, type SetEntry, type Unit } from '../db'
import { latestEntryFor, nextTarget, planPosition } from './progression'

/** In-progress sessions store finishedAt = 0 so Dexie can index them. */
export const IN_PROGRESS = 0

export async function activeSession(): Promise<Session | undefined> {
  return db.sessions.where('finishedAt').equals(IN_PROGRESS).first()
}

function blankSets(count: number, weight: number, reps: number): SetEntry[] {
  return Array.from({ length: count }, () => ({ reps, weight, done: false, targetReps: reps, targetWeight: weight }))
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
    const done = await db.sessions.where('planId').equals(options.plan.id).filter((s) => !!s.finishedAt).count()
    const pos = planPosition(options.plan, done)
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
    if (plan && !plan.startedAt) await db.plans.update(plan.id!, { startedAt: session.startedAt })
  }
}

export async function discardSession(id: number): Promise<void> {
  await db.sessions.delete(id)
}

/** Next workout for the active plan, or null when there is no active plan or it is finished. */
export async function nextPlanWorkout(): Promise<{ plan: Plan; routine: Routine | null; week: number; day: number; label: string; isDeload: boolean; complete: boolean; finished: number; total: number } | null> {
  const plan = await db.plans.filter((p) => p.active).first()
  if (!plan?.id) return null
  const finished = await db.sessions.where('planId').equals(plan.id).filter((s) => !!s.finishedAt).count()
  const pos = planPosition(plan, finished)
  const total = plan.days.length * plan.weeks
  if (pos.complete) return { plan, routine: null, week: pos.week, day: pos.day, label: 'Plan complete', isDeload: false, complete: true, finished, total }
  const dayDef = plan.days[pos.day - 1]
  const routine = dayDef?.routineId ? ((await db.routines.get(dayDef.routineId)) ?? null) : null
  return { plan, routine, week: pos.week, day: pos.day, label: dayDef?.label ?? `Day ${pos.day}`, isDeload: pos.isDeload, complete: false, finished, total }
}

/** Mark a rest day as done by recording a tiny finished session with no entries. */
export async function skipPlanDay(plan: Plan, week: number, day: number, label: string): Promise<void> {
  const now = Date.now()
  await db.sessions.add({ name: `${label} (rest)`, startedAt: now, finishedAt: now, planId: plan.id, planWeek: week, planDay: day, entries: [] })
  if (!plan.startedAt) await db.plans.update(plan.id!, { startedAt: now })
}
