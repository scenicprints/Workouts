import Dexie, { type EntityTable } from 'dexie'

export type Unit = 'kg' | 'lb'

export interface Exercise {
  id?: number
  name: string
  muscle: string
  equipment: string
  bodyweight?: boolean
  custom?: boolean
  createdAt: number
}

export interface RoutineItem {
  exerciseId: number
  sets: number
  reps: number
  restSec: number
  /** Starting working weight. Progression builds on top of this. */
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
  startedAt?: number
  createdAt: number
}

export interface SetEntry {
  reps: number
  weight: number
  done: boolean
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
  finishedAt?: number
  routineId?: number
  planId?: number
  planWeek?: number
  planDay?: number
  entries: SessionEntry[]
  notes?: string
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
  }
}

export const db = new WorkoutsDB()

type SeedExercise = [name: string, muscle: string, equipment: string, bodyweight?: boolean]

export const SEED_EXERCISES: SeedExercise[] = [
  ['Back Squat', 'Legs', 'Barbell'],
  ['Front Squat', 'Legs', 'Barbell'],
  ['Deadlift', 'Back', 'Barbell'],
  ['Romanian Deadlift', 'Hamstrings', 'Barbell'],
  ['Bench Press', 'Chest', 'Barbell'],
  ['Incline Bench Press', 'Chest', 'Barbell'],
  ['Overhead Press', 'Shoulders', 'Barbell'],
  ['Barbell Row', 'Back', 'Barbell'],
  ['Pull-Up', 'Back', 'Bodyweight', true],
  ['Chin-Up', 'Back', 'Bodyweight', true],
  ['Dip', 'Chest', 'Bodyweight', true],
  ['Push-Up', 'Chest', 'Bodyweight', true],
  ['Dumbbell Bench Press', 'Chest', 'Dumbbell'],
  ['Dumbbell Row', 'Back', 'Dumbbell'],
  ['Dumbbell Shoulder Press', 'Shoulders', 'Dumbbell'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell'],
  ['Bicep Curl', 'Arms', 'Dumbbell'],
  ['Hammer Curl', 'Arms', 'Dumbbell'],
  ['Tricep Pushdown', 'Arms', 'Cable'],
  ['Skull Crusher', 'Arms', 'Barbell'],
  ['Lat Pulldown', 'Back', 'Cable'],
  ['Seated Cable Row', 'Back', 'Cable'],
  ['Face Pull', 'Shoulders', 'Cable'],
  ['Leg Press', 'Legs', 'Machine'],
  ['Leg Extension', 'Legs', 'Machine'],
  ['Leg Curl', 'Hamstrings', 'Machine'],
  ['Hip Thrust', 'Glutes', 'Barbell'],
  ['Bulgarian Split Squat', 'Legs', 'Dumbbell'],
  ['Walking Lunge', 'Legs', 'Dumbbell'],
  ['Calf Raise', 'Calves', 'Machine'],
  ['Plank', 'Core', 'Bodyweight', true],
  ['Hanging Leg Raise', 'Core', 'Bodyweight', true],
  ['Cable Crunch', 'Core', 'Cable'],
]

/** Insert the built-in exercise library on first run. Safe to call repeatedly. */
export async function seedIfEmpty(database: WorkoutsDB = db): Promise<void> {
  const count = await database.exercises.count()
  if (count > 0) return
  const now = Date.now()
  await database.exercises.bulkAdd(
    SEED_EXERCISES.map(([name, muscle, equipment, bodyweight]) => ({
      name,
      muscle,
      equipment,
      bodyweight: bodyweight ?? false,
      custom: false,
      createdAt: now,
    })),
  )
}

export async function getSetting<T>(key: string, fallback: T, database: WorkoutsDB = db): Promise<T> {
  const row = await database.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown, database: WorkoutsDB = db): Promise<void> {
  await database.settings.put({ key, value })
}

export interface ExportBundle {
  version: 1
  exportedAt: number
  exercises: Exercise[]
  routines: Routine[]
  plans: Plan[]
  sessions: Session[]
  settings: Setting[]
}

const ALL_TABLES = (d: WorkoutsDB) => [d.exercises, d.routines, d.plans, d.sessions, d.settings]

export async function exportAll(database: WorkoutsDB = db): Promise<ExportBundle> {
  const [exercises, routines, plans, sessions, settings] = await Promise.all([
    database.exercises.toArray(),
    database.routines.toArray(),
    database.plans.toArray(),
    database.sessions.toArray(),
    database.settings.toArray(),
  ])
  return { version: 1, exportedAt: Date.now(), exercises, routines, plans, sessions, settings }
}

export async function importAll(bundle: ExportBundle, database: WorkoutsDB = db): Promise<void> {
  if (bundle.version !== 1 || !Array.isArray(bundle.exercises)) throw new Error('Not a Workouts backup file')
  await database.transaction('rw', ALL_TABLES(database), async () => {
    await Promise.all(ALL_TABLES(database).map((t) => t.clear()))
    await database.exercises.bulkAdd(bundle.exercises)
    await database.routines.bulkAdd(bundle.routines ?? [])
    await database.plans.bulkAdd(bundle.plans ?? [])
    await database.sessions.bulkAdd(bundle.sessions ?? [])
    await database.settings.bulkAdd(bundle.settings ?? [])
  })
}

export async function wipeAll(database: WorkoutsDB = db): Promise<void> {
  await database.transaction('rw', ALL_TABLES(database), async () => {
    await Promise.all(ALL_TABLES(database).map((t) => t.clear()))
  })
  await seedIfEmpty(database)
}
