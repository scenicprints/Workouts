import Dexie, { type EntityTable } from 'dexie'

export type Unit = 'kg' | 'lb'

/** Movement pattern, used by the program generator to pick balanced sessions. */
export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v'
  | 'iso_chest'
  | 'iso_back'
  | 'iso_shoulders'
  | 'iso_biceps'
  | 'iso_triceps'
  | 'iso_quads'
  | 'iso_hams'
  | 'iso_glutes'
  | 'iso_calves'
  | 'core'
  | 'carry'

export interface Exercise {
  id?: number
  name: string
  muscle: string
  equipment: string
  pattern?: Pattern
  compound?: boolean
  bodyweight?: boolean
  custom?: boolean
  createdAt: number
}

export interface RoutineItem {
  exerciseId: number
  sets: number
  reps: number
  restSec: number
  /** Starting working weight. 0 means "set it on the first session". */
  weight: number
  /** How much to add when every set hits the target reps. */
  increment: number
}

export interface Routine {
  id?: number
  name: string
  notes?: string
  items: RoutineItem[]
  createdAt: number
  updatedAt: number
}

export interface PlanDay {
  label: string
  /** null means a rest day */
  routineId: number | null
}

export interface Plan {
  id?: number
  name: string
  notes?: string
  weeks: number
  days: PlanDay[]
  /** Every Nth week is a deload (weights drop 10%). 0 disables. */
  deloadEvery: number
  active: boolean
  /** Index of the next day to do, counting across weeks. You move it; the app never guesses. */
  cursor: number
  startedAt?: number
  createdAt: number
}

export interface SetEntry {
  reps: number
  weight: number
  done: boolean
  kind?: 'warmup' | 'work'
  targetReps?: number
  targetWeight?: number
}

export interface SessionEntry {
  exerciseId: number
  restSec: number
  increment: number
  sets: SetEntry[]
}

export interface Session {
  id?: number
  name: string
  startedAt: number
  /** 0 while in progress so Dexie can index it. */
  finishedAt?: number
  routineId?: number
  planId?: number
  planWeek?: number
  planDay?: number
  entries: SessionEntry[]
  notes?: string
  /** From Health Connect (the watch), filled in after finishing. */
  hrAvg?: number
  hrMax?: number
  calories?: number
  /** Health Connect record id once the session has been written there. */
  healthId?: string
}

export interface BodyEntry {
  id?: number
  /** Local midnight timestamp of the day it was logged. One entry per day. */
  date: number
  weight?: number
  /** Body fat percentage, e.g. 18.4 */
  bodyFat?: number
  /** Lean mass in the app's weight unit. */
  leanMass?: number
  /** 1 (rough) to 5 (great). */
  feel?: number
  measurements?: Record<string, number>
  notes?: string
  source?: 'manual' | 'health'
}

/** One row per local day from Health Connect: steps, sleep and resting heart rate. */
export interface DailyEntry {
  date: number
  steps?: number
  sleepMin?: number
  restingHr?: number
}

export interface Setting {
  key: string
  value: unknown
}

export class WorkoutsDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  plans!: EntityTable<Plan, 'id'>
  sessions!: EntityTable<Session, 'id'>
  body!: EntityTable<BodyEntry, 'id'>
  daily!: EntityTable<DailyEntry, 'date'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'workouts') {
    super(name)
    this.version(1).stores({
      exercises: '++id, name, muscle',
      routines: '++id, name',
      plans: '++id, active',
      sessions: '++id, startedAt, finishedAt, routineId, planId',
      settings: '&key',
    })
    this.version(2)
      .stores({
        exercises: '++id, name, muscle, pattern',
        routines: '++id, name',
        plans: '++id, active',
        sessions: '++id, startedAt, finishedAt, routineId, planId',
        body: '++id, &date',
        settings: '&key',
      })
      .upgrade(async (tx) => {
        // Plans gain an explicit cursor; seed it from finished sessions so nothing moves.
        const plans = await tx.table('plans').toArray()
        for (const p of plans) {
          const done = await tx.table('sessions').where('planId').equals(p.id).filter((s: Session) => !!s.finishedAt).count()
          await tx.table('plans').update(p.id, { cursor: done })
        }
        // Tag the built-in library with patterns so the generator can use it.
        const byName = new Map(SEED_EXERCISES.map((e) => [e[0], e]))
        const exercises = await tx.table('exercises').toArray()
        for (const e of exercises) {
          const seed = byName.get(e.name)
          if (seed && !e.pattern) await tx.table('exercises').update(e.id, { pattern: seed[3], compound: seed[4] ?? false, bodyweight: seed[5] ?? false })
        }
      })
    this.version(3).stores({
      exercises: '++id, name, muscle, pattern',
      routines: '++id, name',
      plans: '++id, active',
      sessions: '++id, startedAt, finishedAt, routineId, planId',
      body: '++id, &date',
      daily: '&date',
      settings: '&key',
    })
  }
}

export const db = new WorkoutsDB()

type SeedExercise = [name: string, muscle: string, equipment: string, pattern: Pattern, compound?: boolean, bodyweight?: boolean]

export const SEED_EXERCISES: SeedExercise[] = [
  // Squat pattern
  ['Back Squat', 'Legs', 'Barbell', 'squat', true],
  ['Front Squat', 'Legs', 'Barbell', 'squat', true],
  ['Leg Press', 'Legs', 'Machine', 'squat', true],
  ['Hack Squat', 'Legs', 'Machine', 'squat', true],
  ['Goblet Squat', 'Legs', 'Dumbbell', 'squat', true],
  // Hinge
  ['Deadlift', 'Back', 'Barbell', 'hinge', true],
  ['Romanian Deadlift', 'Hamstrings', 'Barbell', 'hinge', true],
  ['Trap Bar Deadlift', 'Legs', 'Barbell', 'hinge', true],
  ['Hip Thrust', 'Glutes', 'Barbell', 'hinge', true],
  // Lunge / single leg
  ['Bulgarian Split Squat', 'Legs', 'Dumbbell', 'lunge', true],
  ['Walking Lunge', 'Legs', 'Dumbbell', 'lunge', true],
  ['Step-Up', 'Legs', 'Dumbbell', 'lunge', true],
  // Horizontal push
  ['Bench Press', 'Chest', 'Barbell', 'push_h', true],
  ['Incline Bench Press', 'Chest', 'Barbell', 'push_h', true],
  ['Dumbbell Bench Press', 'Chest', 'Dumbbell', 'push_h', true],
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell', 'push_h', true],
  ['Machine Chest Press', 'Chest', 'Machine', 'push_h', true],
  ['Dip', 'Chest', 'Bodyweight', 'push_h', true, true],
  ['Push-Up', 'Chest', 'Bodyweight', 'push_h', true, true],
  // Vertical push
  ['Overhead Press', 'Shoulders', 'Barbell', 'push_v', true],
  ['Dumbbell Shoulder Press', 'Shoulders', 'Dumbbell', 'push_v', true],
  ['Machine Shoulder Press', 'Shoulders', 'Machine', 'push_v', true],
  // Horizontal pull
  ['Barbell Row', 'Back', 'Barbell', 'pull_h', true],
  ['Dumbbell Row', 'Back', 'Dumbbell', 'pull_h', true],
  ['Seated Cable Row', 'Back', 'Cable', 'pull_h', true],
  ['Chest-Supported Row', 'Back', 'Machine', 'pull_h', true],
  // Vertical pull
  ['Pull-Up', 'Back', 'Bodyweight', 'pull_v', true, true],
  ['Chin-Up', 'Back', 'Bodyweight', 'pull_v', true, true],
  ['Lat Pulldown', 'Back', 'Cable', 'pull_v', true],
  // Isolation
  ['Cable Fly', 'Chest', 'Cable', 'iso_chest'],
  ['Pec Deck', 'Chest', 'Machine', 'iso_chest'],
  ['Straight-Arm Pulldown', 'Back', 'Cable', 'iso_back'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell', 'iso_shoulders'],
  ['Face Pull', 'Shoulders', 'Cable', 'iso_shoulders'],
  ['Rear Delt Fly', 'Shoulders', 'Dumbbell', 'iso_shoulders'],
  ['Bicep Curl', 'Arms', 'Dumbbell', 'iso_biceps'],
  ['Hammer Curl', 'Arms', 'Dumbbell', 'iso_biceps'],
  ['Cable Curl', 'Arms', 'Cable', 'iso_biceps'],
  ['Tricep Pushdown', 'Arms', 'Cable', 'iso_triceps'],
  ['Skull Crusher', 'Arms', 'Barbell', 'iso_triceps'],
  ['Overhead Tricep Extension', 'Arms', 'Cable', 'iso_triceps'],
  ['Leg Extension', 'Legs', 'Machine', 'iso_quads'],
  ['Leg Curl', 'Hamstrings', 'Machine', 'iso_hams'],
  ['Cable Kickback', 'Glutes', 'Cable', 'iso_glutes'],
  ['Calf Raise', 'Calves', 'Machine', 'iso_calves'],
  ['Seated Calf Raise', 'Calves', 'Machine', 'iso_calves'],
  // Core and carries
  ['Plank', 'Core', 'Bodyweight', 'core', false, true],
  ['Hanging Leg Raise', 'Core', 'Bodyweight', 'core', false, true],
  ['Cable Crunch', 'Core', 'Cable', 'core'],
  ['Ab Wheel Rollout', 'Core', 'Bodyweight', 'core', false, true],
  ["Farmer's Carry", 'Core', 'Dumbbell', 'carry', true],
  ['Kettlebell Swing', 'Glutes', 'Kettlebell', 'hinge', true],
]

/** Insert the built-in exercise library on first run. Safe to call repeatedly. */
export async function seedIfEmpty(database: WorkoutsDB = db): Promise<void> {
  const count = await database.exercises.count()
  if (count > 0) return
  const now = Date.now()
  await database.exercises.bulkAdd(
    SEED_EXERCISES.map(([name, muscle, equipment, pattern, compound, bodyweight]) => ({
      name,
      muscle,
      equipment,
      pattern,
      compound: compound ?? false,
      bodyweight: bodyweight ?? false,
      custom: false,
      createdAt: now,
    })),
  )
}

/** Add any built-in exercises that are missing (new ones ship with updates). Never touches custom ones. */
export async function topUpLibrary(database: WorkoutsDB = db): Promise<number> {
  const existing = new Set((await database.exercises.toArray()).map((e) => e.name.toLowerCase()))
  const missing = SEED_EXERCISES.filter(([name]) => !existing.has(name.toLowerCase()))
  if (missing.length === 0) return 0
  const now = Date.now()
  await database.exercises.bulkAdd(
    missing.map(([name, muscle, equipment, pattern, compound, bodyweight]) => ({ name, muscle, equipment, pattern, compound: compound ?? false, bodyweight: bodyweight ?? false, custom: false, createdAt: now })),
  )
  return missing.length
}

export async function getSetting<T>(key: string, fallback: T, database: WorkoutsDB = db): Promise<T> {
  const row = await database.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown, database: WorkoutsDB = db): Promise<void> {
  await database.settings.put({ key, value })
}

export interface ExportBundle {
  version: 1 | 2 | 3
  exportedAt: number
  exercises: Exercise[]
  routines: Routine[]
  plans: Plan[]
  sessions: Session[]
  body?: BodyEntry[]
  daily?: DailyEntry[]
  settings: Setting[]
}

const ALL_TABLES = (d: WorkoutsDB) => [d.exercises, d.routines, d.plans, d.sessions, d.body, d.daily, d.settings]

export async function exportAll(database: WorkoutsDB = db): Promise<ExportBundle> {
  const [exercises, routines, plans, sessions, body, daily, settings] = await Promise.all([
    database.exercises.toArray(),
    database.routines.toArray(),
    database.plans.toArray(),
    database.sessions.toArray(),
    database.body.toArray(),
    database.daily.toArray(),
    database.settings.toArray(),
  ])
  return { version: 3, exportedAt: Date.now(), exercises, routines, plans, sessions, body, daily, settings }
}

export async function importAll(bundle: ExportBundle, database: WorkoutsDB = db): Promise<void> {
  if (![1, 2, 3].includes(bundle.version) || !Array.isArray(bundle.exercises)) throw new Error('Not a Workouts backup file')
  await database.transaction('rw', ALL_TABLES(database), async () => {
    await Promise.all(ALL_TABLES(database).map((t) => t.clear()))
    await database.exercises.bulkAdd(bundle.exercises)
    await database.routines.bulkAdd(bundle.routines ?? [])
    await database.plans.bulkAdd((bundle.plans ?? []).map((p) => ({ ...p, cursor: p.cursor ?? 0 })))
    await database.sessions.bulkAdd(bundle.sessions ?? [])
    await database.body.bulkAdd(bundle.body ?? [])
    await database.daily.bulkAdd(bundle.daily ?? [])
    await database.settings.bulkAdd((bundle.settings ?? []).filter((s) => !s.key.startsWith('sync.') && !s.key.startsWith('health.')))
  })
}

export async function wipeAll(database: WorkoutsDB = db): Promise<void> {
  await database.transaction('rw', ALL_TABLES(database), async () => {
    await Promise.all(ALL_TABLES(database).map((t) => t.clear()))
  })
  await seedIfEmpty(database)
}
