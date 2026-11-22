import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkoutsDB, seedIfEmpty, exportAll, importAll } from '../db'

// The sessions module uses the shared `db` singleton; point it at a fresh database per test.
let database: WorkoutsDB
vi.mock('../db', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../db')>()
  return { ...mod, get db() { return database } }
})

const sessions = await import('../lib/sessions')

beforeEach(async () => {
  database = new WorkoutsDB(`test-${Math.random().toString(36).slice(2)}`)
  await seedIfEmpty(database)
})

async function makeRoutine() {
  const squat = (await database.exercises.where('name').equals('Back Squat').first())!
  const id = await database.routines.add({
    name: 'A',
    items: [{ exerciseId: squat.id!, sets: 3, reps: 5, restSec: 120, weight: 60, increment: 2.5 }],
    createdAt: 0,
    updatedAt: 0,
  })
  return (await database.routines.get(id))!
}

describe('seed and backup', () => {
  it('seeds the library once', async () => {
    const before = await database.exercises.count()
    await seedIfEmpty(database)
    expect(await database.exercises.count()).toBe(before)
    expect(before).toBeGreaterThan(20)
  })
  it('round-trips an export', async () => {
    await database.routines.add({ name: 'R', items: [], createdAt: 0, updatedAt: 0 })
    const bundle = await exportAll(database)
    await database.routines.clear()
    await importAll(bundle, database)
    expect(await database.routines.count()).toBe(1)
  })
  it('rejects garbage imports', async () => {
    await expect(importAll({ version: 2 } as never, database)).rejects.toThrow()
  })
})

describe('session lifecycle', () => {
  it('starts a routine session with targets from the routine', async () => {
    const routine = await makeRoutine()
    const id = await sessions.startRoutineSession(routine)
    const s = (await database.sessions.get(id))!
    expect(s.finishedAt).toBe(0)
    expect(s.entries[0].sets).toHaveLength(3)
    expect(s.entries[0].sets[0]).toMatchObject({ targetWeight: 60, targetReps: 5, done: false })
  })

  it('refuses to start a second session while one is active', async () => {
    const routine = await makeRoutine()
    const a = await sessions.startRoutineSession(routine)
    const b = await sessions.startEmptySession()
    expect(b).toBe(a)
  })

  it('progresses the weight after a clean session and drops undone sets on finish', async () => {
    const routine = await makeRoutine()
    const id = await sessions.startRoutineSession(routine)
    const s = (await database.sessions.get(id))!
    s.entries[0].sets = s.entries[0].sets.map((x, i) => ({ ...x, done: i < 2 }))
    await database.sessions.update(id, { entries: s.entries })
    await sessions.finishSession(id)
    const finished = (await database.sessions.get(id))!
    expect(finished.finishedAt).toBeGreaterThan(0)
    expect(finished.entries[0].sets).toHaveLength(2)

    const next = await sessions.startRoutineSession(routine)
    const n = (await database.sessions.get(next))!
    expect(n.entries[0].sets[0].targetWeight).toBe(62.5)
  })

  it('repeats the weight after a missed set', async () => {
    const routine = await makeRoutine()
    const id = await sessions.startRoutineSession(routine)
    const s = (await database.sessions.get(id))!
    s.entries[0].sets = s.entries[0].sets.map((x, i) => ({ ...x, done: true, reps: i === 2 ? 3 : 5 }))
    await database.sessions.update(id, { entries: s.entries })
    await sessions.finishSession(id)
    const next = await sessions.startRoutineSession(routine)
    expect((await database.sessions.get(next))!.entries[0].sets[0].targetWeight).toBe(60)
  })

  it('walks through a plan and applies deload targets', async () => {
    const routine = await makeRoutine()
    const planId = await database.plans.add({ name: 'P', weeks: 2, deloadEvery: 2, active: true, createdAt: 0, days: [{ label: 'Mon', routineId: routine.id! }, { label: 'Wed', routineId: null }] })
    const plan = (await database.plans.get(planId))!

    let next = await sessions.nextPlanWorkout()
    expect(next).toMatchObject({ week: 1, day: 1, isDeload: false })

    const id = await sessions.startRoutineSession(routine, { plan })
    const s = (await database.sessions.get(id))!
    expect(s).toMatchObject({ planId, planWeek: 1, planDay: 1 })
    s.entries[0].sets = s.entries[0].sets.map((x) => ({ ...x, done: true }))
    await database.sessions.update(id, { entries: s.entries })
    await sessions.finishSession(id)
    expect((await database.plans.get(planId))!.startedAt).toBeGreaterThan(0)

    next = await sessions.nextPlanWorkout()
    expect(next).toMatchObject({ week: 1, day: 2, routine: null })
    await sessions.skipPlanDay(plan, 1, 2, 'Wed')

    next = await sessions.nextPlanWorkout()
    expect(next).toMatchObject({ week: 2, day: 1, isDeload: true })
    const deloadId = await sessions.startRoutineSession(routine, { plan: (await database.plans.get(planId))! })
    // 62.5 after the win, then 90% rounded to a plate = 57.5
    expect((await database.sessions.get(deloadId))!.entries[0].sets[0].targetWeight).toBe(57.5)
  })
})
