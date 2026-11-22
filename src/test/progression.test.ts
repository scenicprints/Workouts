import { describe, expect, it } from 'vitest'
import type { Plan, RoutineItem, Session, SessionEntry } from '../db'
import { estimate1RM, hitAllTargets, latestEntryFor, nextTarget, planPosition, roundToPlate, workingWeight } from '../lib/progression'
import { weeklyStreak } from '../lib/format'

const item: RoutineItem = { exerciseId: 1, sets: 3, reps: 5, restSec: 120, weight: 60, increment: 2.5 }

function entry(sets: [reps: number, weight: number, done?: boolean][], targetReps = 5): SessionEntry {
  return { exerciseId: 1, restSec: 120, increment: 2.5, sets: sets.map(([reps, weight, done = true]) => ({ reps, weight, done, targetReps, targetWeight: weight })) }
}

describe('estimate1RM', () => {
  it('returns the weight for a single', () => expect(estimate1RM(100, 1)).toBe(100))
  it('uses Epley for multiple reps', () => expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1))
  it('is zero for nothing', () => expect(estimate1RM(0, 5)).toBe(0))
})

describe('roundToPlate', () => {
  it('rounds kg to 2.5', () => expect(roundToPlate(61.3, 'kg')).toBe(62.5))
  it('rounds lb to 5', () => expect(roundToPlate(137, 'lb')).toBe(135))
})

describe('hitAllTargets / workingWeight', () => {
  it('needs at least one completed set', () => {
    expect(hitAllTargets(entry([[5, 60, false]]).sets)).toBe(false)
    expect(workingWeight(entry([[5, 60, false]]).sets)).toBeNull()
  })
  it('ignores uncompleted sets when judging', () => {
    expect(hitAllTargets(entry([[5, 60], [5, 60], [2, 60, false]]).sets)).toBe(true)
  })
  it('fails when a completed set misses reps', () => {
    expect(hitAllTargets(entry([[5, 60], [4, 60]]).sets)).toBe(false)
  })
  it('uses the heaviest completed set', () => {
    expect(workingWeight(entry([[5, 60], [5, 62.5]]).sets)).toBe(62.5)
  })
})

describe('nextTarget', () => {
  it('starts at the routine weight with no history', () => {
    expect(nextTarget(item, undefined)).toEqual({ weight: 60, reps: 5, reason: 'start' })
  })
  it('adds the increment after a clean session', () => {
    expect(nextTarget(item, entry([[5, 60], [5, 60], [5, 60]]))).toEqual({ weight: 62.5, reps: 5, reason: 'increase' })
  })
  it('repeats after a miss', () => {
    expect(nextTarget(item, entry([[5, 60], [5, 60], [3, 60]]))).toEqual({ weight: 60, reps: 5, reason: 'repeat' })
  })
  it('deloads to 90% rounded to a plate', () => {
    const t = nextTarget(item, entry([[5, 100], [5, 100], [5, 100]]), { isDeload: true, unit: 'kg' })
    expect(t.weight).toBe(92.5)
    expect(t.reason).toBe('deload')
  })
  it('prefers the increment stored on the previous entry', () => {
    const prev = entry([[5, 60]])
    prev.increment = 5
    expect(nextTarget(item, prev).weight).toBe(65)
  })
})

describe('latestEntryFor', () => {
  const sessions: Session[] = [
    { id: 1, name: 'A', startedAt: 1, finishedAt: 100, routineId: 7, entries: [entry([[5, 50]])] },
    { id: 2, name: 'A', startedAt: 2, finishedAt: 200, routineId: 7, entries: [entry([[5, 55]])] },
    { id: 3, name: 'Free', startedAt: 3, finishedAt: 300, entries: [entry([[8, 40]])] },
    { id: 4, name: 'Active', startedAt: 4, finishedAt: 0, routineId: 7, entries: [entry([[5, 99]])] },
  ]
  it('returns the most recent finished entry', () => {
    expect(latestEntryFor(sessions, 1)?.sets[0].weight).toBe(40)
  })
  it('scopes to a routine and skips in-progress sessions', () => {
    expect(latestEntryFor(sessions, 1, 7)?.sets[0].weight).toBe(55)
  })
  it('returns undefined for unknown exercises', () => {
    expect(latestEntryFor(sessions, 999)).toBeUndefined()
  })
})

describe('planPosition', () => {
  const plan: Plan = { name: 'P', weeks: 4, deloadEvery: 4, active: true, createdAt: 0, days: [{ label: 'Mon', routineId: 1 }, { label: 'Wed', routineId: 2 }, { label: 'Fri', routineId: 1 }] }
  it('starts at week 1 day 1', () => expect(planPosition(plan, 0)).toMatchObject({ week: 1, day: 1, isDeload: false, complete: false }))
  it('wraps days into weeks', () => expect(planPosition(plan, 4)).toMatchObject({ week: 2, day: 2 }))
  it('flags deload weeks', () => expect(planPosition(plan, 9)).toMatchObject({ week: 4, day: 1, isDeload: true }))
  it('reports completion', () => expect(planPosition(plan, 12).complete).toBe(true))
  it('never deloads when disabled', () => expect(planPosition({ ...plan, deloadEvery: 0 }, 9).isDeload).toBe(false))
})

describe('weeklyStreak', () => {
  const day = 86400000
  const now = new Date(2026, 10, 22, 12).getTime() // Sunday 22 Nov 2026
  it('is zero with no sessions', () => expect(weeklyStreak([], now)).toBe(0))
  it('counts consecutive weeks ending this week', () => {
    expect(weeklyStreak([now - day, now - 8 * day, now - 15 * day], now)).toBe(3)
  })
  it('breaks on a missed week', () => {
    expect(weeklyStreak([now - day, now - 15 * day], now)).toBe(1)
  })
  it('is zero when this week is empty', () => {
    expect(weeklyStreak([now - 8 * day], now)).toBe(0)
  })
})
