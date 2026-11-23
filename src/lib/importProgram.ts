import { db, type Exercise, type Pattern, type PlanDay, type RoutineItem, type WorkoutsDB } from '../db'
import { newGroupId } from './superset'

/**
 * The hand-off format for programs designed outside the app (by a coach, a spreadsheet, or an AI).
 * Exercise names are matched to the library case-insensitively; unknown ones are created as custom.
 */
export interface ProgramFile {
  name: string
  notes?: string
  weeks: number
  /** Every Nth week is a deload at 90%. 0 or omitted = none. */
  deloadEvery?: number
  /** On deload weeks, also drop one set from every exercise. */
  deloadDropSet?: boolean
  unit?: 'kg' | 'lb'
  days: { label: string; routine: string | null }[]
  routines: {
    name: string
    notes?: string
    exercises: {
      exercise: string
      sets: number
      /** Target reps, or the top of the rep range when minReps is given. */
      reps: number
      /** Bottom of a rep range: reps climb from here to `reps` before the weight goes up. */
      minReps?: number
      /** Starting working weight in the file's unit. 0 = set on first session. */
      weight?: number
      /** Added after a session where every set hits the target reps. */
      increment?: number
      restSec?: number
      /** Exercises sharing a superset label alternate set by set. */
      superset?: string
      muscle?: string
      equipment?: string
      pattern?: Pattern
    }[]
  }[]
}

export interface ImportResult {
  planId: number
  routineIds: number[]
  createdExercises: string[]
  warnings: string[]
}

const DAY_LABELS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

/** Validate the shape and explain what is wrong in plain words. */
export function validateProgram(input: unknown): { ok: true; program: ProgramFile } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const p = input as Partial<ProgramFile>
  if (!p || typeof p !== 'object') return { ok: false, errors: ['Not a JSON object.'] }
  if (!p.name || typeof p.name !== 'string') errors.push('Missing "name".')
  if (!Number.isInteger(p.weeks) || (p.weeks as number) < 1 || (p.weeks as number) > 52) errors.push('"weeks" must be a whole number from 1 to 52.')
  if (!Array.isArray(p.days) || p.days.length === 0 || p.days.length > 7) errors.push('"days" must list 1 to 7 days.')
  if (!Array.isArray(p.routines) || p.routines.length === 0) errors.push('"routines" must list at least one routine.')
  if (errors.length) return { ok: false, errors }
  const names = new Set(p.routines!.map((r) => r.name))
  p.days!.forEach((d, i) => {
    if (!d || typeof d.label !== 'string') errors.push(`Day ${i + 1} needs a "label".`)
    else if (!DAY_LABELS.has(d.label)) errors.push(`Day ${i + 1}: label "${d.label}" should be Mon, Tue, Wed, Thu, Fri, Sat or Sun.`)
    if (d && d.routine !== null && !names.has(d.routine)) errors.push(`Day ${i + 1} points at routine "${d.routine}", which is not in "routines".`)
  })
  p.routines!.forEach((r, ri) => {
    if (!r.name) errors.push(`Routine ${ri + 1} needs a "name".`)
    if (!Array.isArray(r.exercises) || r.exercises.length === 0) errors.push(`Routine "${r.name}" has no exercises.`)
    else
      r.exercises.forEach((e, ei) => {
        if (!e.exercise) errors.push(`Routine "${r.name}", exercise ${ei + 1} needs an "exercise" name.`)
        if (!Number.isInteger(e.sets) || e.sets < 1) errors.push(`Routine "${r.name}", ${e.exercise}: "sets" must be a whole number ≥ 1.`)
        if (!Number.isInteger(e.reps) || e.reps < 1) errors.push(`Routine "${r.name}", ${e.exercise}: "reps" must be a whole number ≥ 1.`)
        if (e.minReps !== undefined && (!Number.isInteger(e.minReps) || e.minReps < 1 || e.minReps >= e.reps)) errors.push(`Routine "${r.name}", ${e.exercise}: "minReps" must be a whole number from 1 up to one below "reps".`)
      })
  })
  return errors.length ? { ok: false, errors } : { ok: true, program: p as ProgramFile }
}

/** Create the routines and plan. Makes the plan active. */
export async function importProgram(program: ProgramFile, options: { unit: 'kg' | 'lb'; database?: WorkoutsDB } = { unit: 'lb' }): Promise<ImportResult> {
  const database = options.database ?? db
  const warnings: string[] = []
  const createdExercises: string[] = []
  const library = await database.exercises.toArray()
  const byName = new Map(library.map((e) => [e.name.toLowerCase().trim(), e]))
  const fileUnit = program.unit ?? options.unit
  const convert = (v: number | undefined, fallback: number) => {
    if (v === undefined) return fallback
    if (fileUnit === options.unit) return v
    const f = fileUnit === 'kg' ? 2.2046226218 : 1 / 2.2046226218
    return Math.round(v * f * 4) / 4
  }
  const defaultIncrement = options.unit === 'kg' ? 2.5 : 5

  async function resolve(e: ProgramFile['routines'][number]['exercises'][number]): Promise<Exercise> {
    const key = e.exercise.toLowerCase().trim()
    const found = byName.get(key)
    if (found) return found
    const created: Exercise = { name: e.exercise.trim(), muscle: e.muscle ?? 'Other', equipment: e.equipment ?? 'Other', pattern: e.pattern, compound: false, bodyweight: (e.equipment ?? '').toLowerCase() === 'bodyweight', custom: true, createdAt: Date.now() }
    created.id = (await database.exercises.add(created)) as number
    byName.set(key, created)
    createdExercises.push(created.name)
    return created
  }

  const now = Date.now()
  const routineIds = new Map<string, number>()
  const ids: number[] = []
  for (const r of program.routines) {
    const groups = new Map<string, string>()
    const items: RoutineItem[] = []
    for (const e of r.exercises) {
      const ex = await resolve(e)
      let group: string | undefined
      if (e.superset) {
        group = groups.get(e.superset) ?? newGroupId()
        groups.set(e.superset, group)
      }
      items.push({ exerciseId: ex.id!, sets: e.sets, reps: e.reps, minReps: e.minReps, restSec: e.restSec ?? 90, weight: convert(e.weight, 0), increment: convert(e.increment, ex.bodyweight ? 0 : defaultIncrement), group })
    }
    for (const [label, g] of groups) {
      if (items.filter((i) => i.group === g).length < 2) {
        warnings.push(`Routine "${r.name}": superset "${label}" has only one exercise, so it was ignored.`)
        for (const i of items) if (i.group === g) i.group = undefined
      }
    }
    const id = (await database.routines.add({ name: r.name, notes: r.notes, items, createdAt: now, updatedAt: now })) as number
    routineIds.set(r.name, id)
    ids.push(id)
  }
  const days: PlanDay[] = program.days.map((d) => ({ label: d.label, routineId: d.routine === null ? null : (routineIds.get(d.routine) ?? null) }))
  const others = await database.plans.filter((p) => p.active).toArray()
  for (const o of others) await database.plans.update(o.id!, { active: false })
  const planId = (await database.plans.add({ name: program.name, notes: program.notes, weeks: program.weeks, days, deloadEvery: program.deloadEvery ?? 0, deloadDropSet: !!program.deloadDropSet, active: true, cursor: 0, createdAt: now })) as number
  return { planId, routineIds: ids, createdExercises, warnings }
}
