import type { Exercise, Pattern, PlanDay, Routine, RoutineItem, Unit } from '../db'

export type Goal = 'strength' | 'size' | 'general' | 'conditioning'
export type SessionLength = 'short' | 'medium' | 'long'

export interface GeneratorInput {
  goal: Goal
  days: number
  length: SessionLength
  weeks: number
  deload: boolean
  unit: Unit
  /** Equipment names to exclude, e.g. ['Machine', 'Cable'] for a barbell-only gym. */
  exclude?: string[]
}

export interface GeneratedProgram {
  name: string
  routines: Omit<Routine, 'id'>[]
  /** Each day maps to a routine index above, or null for rest. */
  days: { label: string; routine: number | null }[]
  weeks: number
  deloadEvery: number
  notes: string
}

interface Slot {
  pattern: Pattern | Pattern[]
  role: 'main' | 'secondary' | 'accessory' | 'finisher'
}

type DayTemplate = { name: string; slots: Slot[] }

/** Session shapes by split. Order matters: mains first, accessories later. */
const SPLITS: Record<number, DayTemplate[]> = {
  2: [
    { name: 'Full Body A', slots: [s('squat', 'main'), s('push_h', 'main'), s('pull_h', 'secondary'), s(['hinge', 'iso_hams'], 'secondary'), s('iso_shoulders', 'accessory'), s('core', 'finisher'), s('iso_biceps', 'accessory'), s('iso_triceps', 'accessory')] },
    { name: 'Full Body B', slots: [s('hinge', 'main'), s('push_v', 'main'), s('pull_v', 'secondary'), s(['lunge', 'iso_quads'], 'secondary'), s('iso_chest', 'accessory'), s('core', 'finisher'), s('iso_calves', 'accessory'), s('iso_back', 'accessory')] },
  ],
  3: [
    { name: 'Full Body A', slots: [s('squat', 'main'), s('push_h', 'main'), s('pull_h', 'secondary'), s('iso_hams', 'accessory'), s('iso_shoulders', 'accessory'), s('core', 'finisher'), s('iso_biceps', 'accessory'), s('iso_calves', 'accessory')] },
    { name: 'Full Body B', slots: [s('hinge', 'main'), s('push_v', 'main'), s('pull_v', 'secondary'), s('lunge', 'secondary'), s('iso_chest', 'accessory'), s('core', 'finisher'), s('iso_triceps', 'accessory'), s('iso_glutes', 'accessory')] },
    { name: 'Full Body C', slots: [s('squat', 'main'), s('push_h', 'main'), s('pull_h', 'secondary'), s('iso_quads', 'accessory'), s('iso_back', 'accessory'), s('carry', 'finisher'), s('iso_biceps', 'accessory'), s('iso_shoulders', 'accessory')] },
  ],
  4: [
    { name: 'Upper A', slots: [s('push_h', 'main'), s('pull_h', 'main'), s('push_v', 'secondary'), s('pull_v', 'secondary'), s('iso_shoulders', 'accessory'), s('iso_biceps', 'accessory'), s('iso_triceps', 'accessory'), s('iso_chest', 'accessory')] },
    { name: 'Lower A', slots: [s('squat', 'main'), s('hinge', 'secondary'), s('lunge', 'secondary'), s('iso_hams', 'accessory'), s('iso_quads', 'accessory'), s('core', 'finisher'), s('iso_calves', 'accessory'), s('iso_glutes', 'accessory')] },
    { name: 'Upper B', slots: [s('push_v', 'main'), s('pull_v', 'main'), s('push_h', 'secondary'), s('pull_h', 'secondary'), s('iso_chest', 'accessory'), s('iso_back', 'accessory'), s('iso_biceps', 'accessory'), s('iso_triceps', 'accessory')] },
    { name: 'Lower B', slots: [s('hinge', 'main'), s('squat', 'secondary'), s('lunge', 'secondary'), s('iso_quads', 'accessory'), s('iso_hams', 'accessory'), s('carry', 'finisher'), s('iso_calves', 'accessory'), s('core', 'finisher')] },
  ],
  5: [
    { name: 'Push', slots: [s('push_h', 'main'), s('push_v', 'secondary'), s('push_h', 'secondary'), s('iso_chest', 'accessory'), s('iso_shoulders', 'accessory'), s('iso_triceps', 'accessory'), s('iso_triceps', 'accessory'), s('core', 'finisher')] },
    { name: 'Pull', slots: [s('pull_v', 'main'), s('pull_h', 'secondary'), s('pull_h', 'secondary'), s('iso_back', 'accessory'), s('iso_shoulders', 'accessory'), s('iso_biceps', 'accessory'), s('iso_biceps', 'accessory'), s('carry', 'finisher')] },
    { name: 'Legs', slots: [s('squat', 'main'), s('hinge', 'secondary'), s('lunge', 'secondary'), s('iso_quads', 'accessory'), s('iso_hams', 'accessory'), s('iso_glutes', 'accessory'), s('iso_calves', 'accessory'), s('core', 'finisher')] },
    { name: 'Upper', slots: [s('push_h', 'main'), s('pull_h', 'main'), s('push_v', 'secondary'), s('pull_v', 'secondary'), s('iso_shoulders', 'accessory'), s('iso_biceps', 'accessory'), s('iso_triceps', 'accessory'), s('iso_chest', 'accessory')] },
    { name: 'Lower', slots: [s('hinge', 'main'), s('squat', 'secondary'), s('lunge', 'secondary'), s('iso_hams', 'accessory'), s('iso_quads', 'accessory'), s('iso_calves', 'accessory'), s('core', 'finisher'), s('iso_glutes', 'accessory')] },
  ],
  6: [
    { name: 'Push A', slots: [s('push_h', 'main'), s('push_v', 'secondary'), s('iso_chest', 'accessory'), s('iso_shoulders', 'accessory'), s('iso_triceps', 'accessory'), s('core', 'finisher'), s('push_h', 'secondary'), s('iso_triceps', 'accessory')] },
    { name: 'Pull A', slots: [s('pull_h', 'main'), s('pull_v', 'secondary'), s('iso_back', 'accessory'), s('iso_shoulders', 'accessory'), s('iso_biceps', 'accessory'), s('carry', 'finisher'), s('pull_h', 'secondary'), s('iso_biceps', 'accessory')] },
    { name: 'Legs A', slots: [s('squat', 'main'), s('hinge', 'secondary'), s('lunge', 'secondary'), s('iso_quads', 'accessory'), s('iso_hams', 'accessory'), s('iso_calves', 'accessory'), s('core', 'finisher'), s('iso_glutes', 'accessory')] },
    { name: 'Push B', slots: [s('push_v', 'main'), s('push_h', 'secondary'), s('iso_chest', 'accessory'), s('iso_shoulders', 'accessory'), s('iso_triceps', 'accessory'), s('core', 'finisher'), s('push_h', 'secondary'), s('iso_shoulders', 'accessory')] },
    { name: 'Pull B', slots: [s('pull_v', 'main'), s('pull_h', 'secondary'), s('iso_back', 'accessory'), s('iso_shoulders', 'accessory'), s('iso_biceps', 'accessory'), s('core', 'finisher'), s('pull_h', 'secondary'), s('iso_biceps', 'accessory')] },
    { name: 'Legs B', slots: [s('hinge', 'main'), s('squat', 'secondary'), s('lunge', 'secondary'), s('iso_hams', 'accessory'), s('iso_quads', 'accessory'), s('iso_calves', 'accessory'), s('carry', 'finisher'), s('iso_glutes', 'accessory')] },
  ],
}

function s(pattern: Pattern | Pattern[], role: Slot['role']): Slot {
  return { pattern, role }
}

const SLOT_COUNT: Record<SessionLength, number> = { short: 4, medium: 6, long: 8 }

interface Prescription {
  sets: number
  reps: number
  restSec: number
}

/** Sets, reps and rest by goal and slot role. Rest defaults follow the lower-compound-longer rule. */
function prescribe(goal: Goal, role: Slot['role'], lower: boolean): Prescription {
  switch (goal) {
    case 'strength':
      if (role === 'main') return { sets: 5, reps: 5, restSec: lower ? 180 : 150 }
      if (role === 'secondary') return { sets: 3, reps: 6, restSec: lower ? 150 : 120 }
      if (role === 'accessory') return { sets: 3, reps: 10, restSec: 90 }
      return { sets: 3, reps: 12, restSec: 60 }
    case 'size':
      if (role === 'main') return { sets: 4, reps: 8, restSec: lower ? 150 : 120 }
      if (role === 'secondary') return { sets: 3, reps: 10, restSec: lower ? 120 : 90 }
      if (role === 'accessory') return { sets: 3, reps: 12, restSec: 75 }
      return { sets: 3, reps: 15, restSec: 60 }
    case 'general':
      if (role === 'main') return { sets: 3, reps: 8, restSec: lower ? 120 : 90 }
      if (role === 'secondary') return { sets: 3, reps: 10, restSec: 90 }
      if (role === 'accessory') return { sets: 2, reps: 12, restSec: 60 }
      return { sets: 2, reps: 15, restSec: 60 }
    case 'conditioning':
      if (role === 'main') return { sets: 4, reps: 10, restSec: 75 }
      if (role === 'secondary') return { sets: 3, reps: 12, restSec: 60 }
      if (role === 'accessory') return { sets: 3, reps: 15, restSec: 45 }
      return { sets: 3, reps: 20, restSec: 30 }
  }
}

const LOWER: Pattern[] = ['squat', 'hinge', 'lunge', 'iso_quads', 'iso_hams', 'iso_glutes', 'iso_calves']

/** The lifts worth building a session around, best first. Anything not listed ranks after these. */
const MAIN_PREFERENCE = [
  'Back Squat',
  'Deadlift',
  'Bench Press',
  'Overhead Press',
  'Barbell Row',
  'Pull-Up',
  'Front Squat',
  'Romanian Deadlift',
  'Incline Bench Press',
  'Lat Pulldown',
  'Dumbbell Shoulder Press',
  'Chin-Up',
  'Leg Press',
  'Trap Bar Deadlift',
  'Dumbbell Bench Press',
  'Seated Cable Row',
  'Hip Thrust',
  'Bulgarian Split Squat',
]

function increment(ex: Exercise, unit: Unit): number {
  if (ex.bodyweight) return 0
  const lower = ex.pattern ? LOWER.includes(ex.pattern) : false
  if (ex.compound && lower) return unit === 'kg' ? 5 : 10
  if (ex.compound) return unit === 'kg' ? 2.5 : 5
  return unit === 'kg' ? 1.25 : 2.5
}

const GOAL_NAMES: Record<Goal, string> = { strength: 'Strength', size: 'Hypertrophy', general: 'General Fitness', conditioning: 'Conditioning' }

/**
 * Build a program from the exercise library. Deterministic for the same input and library,
 * and it rotates exercise choices across days so A and B sessions differ.
 */
export function generateProgram(input: GeneratorInput, library: Exercise[]): GeneratedProgram {
  const days = Math.max(2, Math.min(6, Math.round(input.days)))
  const template = SPLITS[days]
  const exclude = new Set((input.exclude ?? []).map((e) => e.toLowerCase()))
  const usable = library.filter((e) => e.pattern && !exclude.has(e.equipment.toLowerCase()))
  const slotCount = SLOT_COUNT[input.length]

  // The big lifts come first in every pattern; strength leans harder on barbells.
  const rank = (e: Exercise) => {
    let score = 0
    const pref = MAIN_PREFERENCE.indexOf(e.name)
    if (pref >= 0) score -= 10 - pref * 0.1
    if (input.goal === 'strength' && e.equipment === 'Barbell') score -= 2
    if (input.goal === 'conditioning' && (e.equipment === 'Bodyweight' || e.equipment === 'Kettlebell')) score -= 1
    if (e.custom) score += 1
    return score
  }
  const byPattern = new Map<Pattern, Exercise[]>()
  for (const e of usable) byPattern.set(e.pattern!, [...(byPattern.get(e.pattern!) ?? []), e])
  for (const list of byPattern.values()) list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))

  // Main lifts rotate only between the top two choices for a pattern, so "Upper B" still opens
  // with a real press rather than the fourth-best option. Everything else rotates through the list.
  const usedCount = new Map<string, number>()
  const pick = (pattern: Pattern | Pattern[], role: Slot['role'], taken: Set<number>): Exercise | undefined => {
    const patterns = Array.isArray(pattern) ? pattern : [pattern]
    for (const p of patterns) {
      const full = byPattern.get(p) ?? []
      if (full.length === 0) continue
      const key = role === 'main' ? `main:${p}` : p
      const n = usedCount.get(key) ?? 0
      usedCount.set(key, n + 1)
      // Rotate over the whole ranked list and skip what this day already has, so the rotation
      // position never shifts just because an earlier slot took the top choice.
      const pool = role === 'main' ? full.slice(0, 2) : full
      for (let k = 0; k < pool.length; k++) {
        const e = pool[(n + k) % pool.length]
        if (!taken.has(e.id!)) return e
      }
      const fallback = full.find((e) => !taken.has(e.id!))
      if (fallback) return fallback
    }
    return undefined
  }

  const routines: Omit<Routine, 'id'>[] = []
  const now = Date.now()
  for (const day of template) {
    const taken = new Set<number>()
    const items: RoutineItem[] = []
    for (const slot of day.slots) {
      if (items.length >= slotCount) break
      const ex = pick(slot.pattern, slot.role, taken)
      if (!ex) continue
      taken.add(ex.id!)
      const lower = ex.pattern ? LOWER.includes(ex.pattern) : false
      const p = prescribe(input.goal, slot.role, lower)
      items.push({ exerciseId: ex.id!, sets: p.sets, reps: p.reps, restSec: p.restSec, weight: 0, increment: increment(ex, input.unit) })
    }
    routines.push({ name: day.name, items, createdAt: now, updatedAt: now, notes: undefined })
  }

  const labels = dayLabels(days)
  const dayList = labels.map((label, i) => ({ label, routine: i < routines.length ? i : null }))
  const deloadEvery = input.deload ? (input.weeks >= 8 ? 4 : input.weeks >= 6 ? 3 : 0) : 0
  const name = `${input.weeks}-week ${GOAL_NAMES[input.goal]} (${days}x/week)`
  const notes = [
    `Generated for ${GOAL_NAMES[input.goal].toLowerCase()}, ${days} days a week, ${input.length} sessions.`,
    'Weights start at 0: enter what you lift on the first session and progression takes it from there.',
    'Hit every target rep and the weight goes up next time. Miss, and it repeats.',
    deloadEvery ? `Every ${deloadEvery}th week is a deload at 90%.` : 'No deload weeks. Add one from the plan editor if you want.',
  ].join(' ')
  return { name, routines, days: dayList, weeks: input.weeks, deloadEvery, notes }
}

function dayLabels(days: number): string[] {
  switch (days) {
    case 2:
      return ['Mon', 'Thu']
    case 3:
      return ['Mon', 'Wed', 'Fri']
    case 4:
      return ['Mon', 'Tue', 'Thu', 'Fri']
    case 5:
      return ['Mon', 'Tue', 'Wed', 'Fri', 'Sat']
    default:
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  }
}

export function toPlanDays(program: GeneratedProgram, routineIds: number[]): PlanDay[] {
  return program.days.map((d) => ({ label: d.label, routineId: d.routine === null ? null : routineIds[d.routine] }))
}
