import { beforeEach, describe, expect, it } from 'vitest'
import { WorkoutsDB, seedIfEmpty } from '../db'
import { importProgram, validateProgram, type ProgramFile } from '../lib/importProgram'

let database: WorkoutsDB
beforeEach(async () => {
  database = new WorkoutsDB(`import-${Math.random().toString(36).slice(2)}`)
  await seedIfEmpty(database)
})

const program: ProgramFile = {
  name: 'Test block',
  weeks: 4,
  deloadEvery: 4,
  unit: 'kg',
  days: [
    { label: 'Mon', routine: 'A' },
    { label: 'Wed', routine: null },
    { label: 'Fri', routine: 'A' },
  ],
  routines: [
    {
      name: 'A',
      exercises: [
        { exercise: 'bench press', sets: 4, reps: 6, weight: 80, increment: 2.5 },
        { exercise: 'Lateral Raise', sets: 3, reps: 15, weight: 8, superset: 'S1' },
        { exercise: 'Face Pull', sets: 3, reps: 15, weight: 20, superset: 'S1' },
        { exercise: 'Banded Pull-Apart', sets: 2, reps: 20, muscle: 'Shoulders', equipment: 'Band' },
      ],
    },
  ],
}

describe('validateProgram', () => {
  it('accepts a good file', () => expect(validateProgram(program).ok).toBe(true))
  it('explains problems', () => {
    const v = validateProgram({ ...program, days: [{ label: 'Monday', routine: 'B' }] })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errors.join(' ')).toMatch(/should be Mon/)
      expect(v.errors.join(' ')).toMatch(/routine "B"/)
    }
  })
})

describe('importProgram', () => {
  it('creates routines, exercises and an active plan, converting units', async () => {
    const r = await importProgram(program, { unit: 'lb', database })
    expect(r.createdExercises).toEqual(['Banded Pull-Apart'])
    expect(r.warnings).toEqual([])
    const plan = (await database.plans.get(r.planId))!
    expect(plan).toMatchObject({ active: true, cursor: 0, weeks: 4, deloadEvery: 4 })
    expect(plan.days[1].routineId).toBeNull()
    expect(plan.days[0].routineId).toBe(r.routineIds[0])
    const routine = (await database.routines.get(r.routineIds[0]))!
    expect(routine.items).toHaveLength(4)
    expect(routine.items[0].weight).toBeCloseTo(176.25, 1) // 80 kg → lb, plate-rounded
    expect(routine.items[1].group).toBeDefined()
    expect(routine.items[1].group).toBe(routine.items[2].group)
    expect(routine.items[3].group).toBeUndefined()
    expect(routine.items[3].increment).toBe(5)
  })
  it('drops a one-member superset with a warning', async () => {
    const r = await importProgram({ ...program, routines: [{ name: 'A', exercises: [{ exercise: 'Bench Press', sets: 3, reps: 5, superset: 'solo' }] }] }, { unit: 'kg', database })
    expect(r.warnings[0]).toMatch(/only one exercise/)
  })
})
