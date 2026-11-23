import { describe, expect, it } from 'vitest'
import type { Plan, RoutineItem, Session, SessionEntry } from '../db'
import { estimate1RM, hitAllTargets, latestEntryFor, nextTarget, planPosition, recentEntriesFor, roundToPlate, suggestStartingWeight, workingWeight } from '../lib/progression'
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
    expect(nextTarget(item, undefined)).toMatchObject({ weight: 60, reps: 5, reason: 'start' })
  })
  it('adds the increment after a clean session', () => {
    expect(nextTarget(item, entry([[5, 60], [5, 60], [5, 60]]))).toMatchObject({ weight: 62.5, reps: 5, reason: 'increase' })
  })
  it('repeats after a miss', () => {
    expect(nextTarget(item, entry([[5, 60], [5, 60], [3, 60]]))).toMatchObject({ weight: 60, reps: 5, reason: 'repeat' })
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

describe('nextTarget with a rep range (double progression)', () => {
  const ranged: RoutineItem = { ...item, reps: 12, minReps: 8 }
  it('starts at the bottom of the range', () => {
    expect(nextTarget(ranged, undefined)).toMatchObject({ weight: 60, reps: 8, reason: 'start' })
  })
  it('adds a rep, not weight, after a clean session below the top', () => {
    expect(nextTarget(ranged, entry([[8, 60], [8, 60], [8, 60]], 8))).toMatchObject({ weight: 60, reps: 9, reason: 'reps' })
  })
  it('adds weight and resets reps once every set hits the top', () => {
    expect(nextTarget(ranged, entry([[12, 60], [12, 60], [12, 60]], 12))).toMatchObject({ weight: 62.5, reps: 8, reason: 'increase' })
  })
  it('repeats the same reps after a miss', () => {
    expect(nextTarget(ranged, entry([[10, 60], [10, 60], [9, 60]], 10))).toMatchObject({ weight: 60, reps: 10, reason: 'repeat' })
  })
  it('treats an old fixed-rep entry as the bottom of the range', () => {
    expect(nextTarget(ranged, entry([[5, 60], [5, 60]], 5))).toMatchObject({ weight: 60, reps: 9, reason: 'reps' })
  })
})

describe('nextTarget after two misses', () => {
  it('drops 10% instead of repeating a third time', () => {
    const miss = entry([[5, 100], [5, 100], [3, 100]])
    expect(nextTarget(item, miss, { earlier: miss, unit: 'kg' })).toMatchObject({ weight: 90, reps: 5, reason: 'reset' })
  })
  it('only counts misses at the same weight', () => {
    expect(nextTarget(item, entry([[5, 100], [3, 100]]), { earlier: entry([[5, 110], [3, 110]]), unit: 'kg' })).toMatchObject({ weight: 100, reps: 5, reason: 'repeat' })
  })
  it('does not reset after a miss that followed a win', () => {
    expect(nextTarget(item, entry([[5, 100], [3, 100]]), { earlier: entry([[5, 97.5], [5, 97.5]]), unit: 'kg' }).reason).toBe('repeat')
  })
})

describe('nextTarget under readiness rules', () => {
  const clean = entry([[5, 100], [5, 100], [5, 100]])
  it('holds the weight after a clean session when increases are off', () => {
    expect(nextTarget(item, clean, { allowIncrease: false })).toMatchObject({ weight: 100, reps: 5, reason: 'held' })
  })
  it('still climbs reps in a range when only increases are off', () => {
    const ranged: RoutineItem = { ...item, reps: 12, minReps: 8 }
    expect(nextTarget(ranged, entry([[8, 60], [8, 60]], 8), { allowIncrease: false })).toMatchObject({ weight: 60, reps: 9, reason: 'reps' })
    expect(nextTarget(ranged, entry([[12, 60], [12, 60]], 12), { allowIncrease: false })).toMatchObject({ weight: 60, reps: 12, reason: 'held' })
  })
  it('holds reps too when rep climbs are off', () => {
    const ranged: RoutineItem = { ...item, reps: 12, minReps: 8 }
    expect(nextTarget(ranged, entry([[9, 60], [9, 60]], 9), { allowIncrease: false, allowRepClimb: false })).toMatchObject({ weight: 60, reps: 9, reason: 'held' })
  })
  it('jumps two increments when every set beat its target by two reps', () => {
    expect(nextTarget(item, entry([[7, 100], [8, 100], [7, 100]]))).toMatchObject({ weight: 105, reps: 5, reason: 'jump' })
    expect(nextTarget(item, entry([[7, 100], [6, 100]])).reason).toBe('increase')
  })
  it('does not jump when increases are off', () => {
    expect(nextTarget(item, entry([[7, 100], [8, 100]]), { allowIncrease: false }).reason).toBe('held')
  })
})

describe('nextTarget while cutting', () => {
  const miss = (reps: number[]) => entry(reps.map((r) => [r, 100] as [number, number]))
  it('keeps repeating after two misses when reps held steady', () => {
    expect(nextTarget(item, miss([5, 5, 3]), { history: [miss([5, 5, 3])], cutting: true, unit: 'kg' })).toMatchObject({ weight: 100, reps: 5, reason: 'repeat' })
  })
  it('resets after two misses when reps fell', () => {
    expect(nextTarget(item, miss([5, 4, 2]), { history: [miss([5, 5, 3])], cutting: true, unit: 'kg' })).toMatchObject({ weight: 90, reps: 5, reason: 'reset' })
  })
  it('resets after four misses whatever the reps did', () => {
    const h = miss([5, 5, 4])
    expect(nextTarget(item, h, { history: [h, h], cutting: true, unit: 'kg' }).reason).toBe('repeat')
    expect(nextTarget(item, h, { history: [h, h, h], cutting: true, unit: 'kg' }).reason).toBe('reset')
  })
  it('counts the run of misses from history, newest first', () => {
    const win = entry([[5, 100], [5, 100], [5, 100]])
    expect(nextTarget(item, miss([5, 4, 3]), { history: [win, miss([5, 5, 3])], unit: 'kg' }).reason).toBe('repeat')
    expect(nextTarget(item, miss([5, 4, 3]), { history: [miss([5, 5, 3]), win], unit: 'kg' }).reason).toBe('reset')
  })
})

describe('suggestStartingWeight', () => {
  const sessions: Session[] = [
    { id: 1, name: 'Old', startedAt: 1, finishedAt: 100, routineId: 3, entries: [entry([[8, 100], [8, 100]], 8)] },
  ]
  it('uses the start weight when the routine has one', () => {
    expect(nextTarget(item, undefined, { suggestedWeight: 80 })).toMatchObject({ weight: 60, reps: 5, reason: 'start' })
  })
  it('suggests when the routine weight is 0', () => {
    expect(nextTarget({ ...item, weight: 0 }, undefined, { suggestedWeight: 80 })).toMatchObject({ weight: 80, reps: 5, reason: 'suggested' })
  })
  it('reuses the last weight at the same rep target', () => {
    expect(suggestStartingWeight(sessions, 1, 8, 'lb')).toBe(100)
  })
  it('scales 90% of the estimated max to a new rep target, rounded to a plate', () => {
    // e1RM 126.7 -> at 5 reps 108.6 -> 90% = 97.7 -> 100 lb
    expect(suggestStartingWeight(sessions, 1, 5, 'lb')).toBe(100)
    expect(suggestStartingWeight(sessions, 1, 5, 'kg')).toBe(97.5)
  })
  it('has nothing to say without history', () => {
    expect(suggestStartingWeight(sessions, 2, 5, 'lb')).toBeUndefined()
  })
})

describe('recentEntriesFor', () => {
  it('returns newest first and respects the count', () => {
    const sessions: Session[] = [
      { id: 1, name: 'A', startedAt: 1, finishedAt: 100, routineId: 7, entries: [entry([[5, 50]])] },
      { id: 2, name: 'A', startedAt: 2, finishedAt: 200, routineId: 7, entries: [entry([[5, 55]])] },
      { id: 3, name: 'A', startedAt: 3, finishedAt: 300, routineId: 7, entries: [entry([[5, 60]])] },
    ]
    expect(recentEntriesFor(sessions, 1, 7, 2).map((e) => e.sets[0].weight)).toEqual([60, 55])
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
  const plan: Plan = { name: 'P', weeks: 4, deloadEvery: 4, active: true, cursor: 0, createdAt: 0, days: [{ label: 'Mon', routineId: 1 }, { label: 'Wed', routineId: 2 }, { label: 'Fri', routineId: 1 }] }
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

describe('nextTarget on an equipment grid', () => {
  const lbItem: RoutineItem = { exerciseId: 1, sets: 3, reps: 8, restSec: 90, weight: 0, increment: 5 }
  const sets = (reps: number, weight: number, target = 8): SessionEntry => ({ exerciseId: 1, restSec: 90, increment: 5, sets: [1, 2, 3].map(() => ({ reps, weight, done: true, targetReps: target, targetWeight: weight })) })
  const stack10 = { step: 10, anchor: 100 }

  it('moves by the learned step, not the routine increment', () => {
    expect(nextTarget(lbItem, sets(8, 100), { unit: 'lb', step: stack10 })).toMatchObject({ weight: 110, reps: 8, reason: 'increase', from: 100, step: 10 })
  })
  it('climbs reps before adding a step that is more than 10% of the load', () => {
    expect(nextTarget(lbItem, sets(8, 80), { unit: 'lb', step: stack10 })).toMatchObject({ weight: 80, reps: 9, reason: 'reps' })
    expect(nextTarget(lbItem, sets(9, 80, 9), { unit: 'lb', step: stack10 })).toMatchObject({ weight: 80, reps: 10, reason: 'reps' })
    expect(nextTarget(lbItem, sets(10, 80, 10), { unit: 'lb', step: stack10 })).toMatchObject({ weight: 90, reps: 8, reason: 'increase' })
  })
  it('climbs four extra reps when a step is over 20% of the load', () => {
    const light = { step: 5, anchor: 20 }
    expect(nextTarget(lbItem, sets(11, 20, 11), { unit: 'lb', step: light })).toMatchObject({ weight: 20, reps: 12, reason: 'reps' })
    expect(nextTarget(lbItem, sets(12, 20, 12), { unit: 'lb', step: light })).toMatchObject({ weight: 25, reps: 8, reason: 'increase' })
  })
  it('a miss during the rep climb repeats that rep target', () => {
    const prev = sets(9, 80, 10)
    expect(nextTarget(lbItem, prev, { unit: 'lb', step: stack10 })).toMatchObject({ weight: 80, reps: 10, reason: 'repeat' })
  })
  it('doubles the jump only while two steps stay within 10%', () => {
    expect(nextTarget(lbItem, sets(11, 200), { unit: 'lb', step: { step: 5, anchor: 200 } })).toMatchObject({ weight: 210, reason: 'jump' })
    expect(nextTarget(lbItem, sets(11, 100), { unit: 'lb', step: stack10 })).toMatchObject({ weight: 110, reason: 'increase' })
  })
  it('resets to the grid weight nearest 90%', () => {
    const miss = sets(6, 90)
    expect(nextTarget(lbItem, miss, { unit: 'lb', step: stack10, history: [miss] })).toMatchObject({ weight: 80, reps: 8, reason: 'reset' })
  })
  it('cannot reset a load the equipment is too coarse to drop, so reps come back down', () => {
    const miss = sets(10, 15, 11)
    expect(nextTarget(lbItem, miss, { unit: 'lb', step: { step: 5, anchor: 15 }, history: [miss] })).toMatchObject({ weight: 15, reps: 8, reason: 'reset' })
  })
  it('snaps a suggested start to the grid', () => {
    expect(nextTarget(lbItem, undefined, { unit: 'lb', step: stack10, suggestedWeight: 87 })).toMatchObject({ weight: 90, reason: 'suggested' })
  })
  it('deloads to the grid weight nearest 90%', () => {
    expect(nextTarget(lbItem, sets(8, 100), { unit: 'lb', step: stack10, isDeload: true })).toMatchObject({ weight: 100, reason: 'deload', from: 100 })
    expect(nextTarget(lbItem, sets(8, 140), { unit: 'lb', step: stack10, isDeload: true })).toMatchObject({ weight: 140, reason: 'deload' })
  })
})
