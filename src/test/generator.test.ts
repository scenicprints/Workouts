import { describe, expect, it } from 'vitest'
import { SEED_EXERCISES, type Exercise } from '../db'
import { generateProgram, type Goal } from '../lib/generator'
import { platesPerSide } from '../lib/plates'
import { bestLifts, buildSummary, weeklyStats } from '../lib/stats'
import type { Session } from '../db'

const library: Exercise[] = SEED_EXERCISES.map(([name, muscle, equipment, pattern, compound, bodyweight], i) => ({ id: i + 1, name, muscle, equipment, pattern, compound: compound ?? false, bodyweight: bodyweight ?? false, createdAt: 0 }))
const byId = new Map(library.map((e) => [e.id!, e]))

describe('generateProgram', () => {
  for (const days of [2, 3, 4, 5, 6]) {
    it(`builds a ${days}-day split with no repeated exercise inside a day`, () => {
      const p = generateProgram({ goal: 'size', days, length: 'long', weeks: 8, deload: true, unit: 'kg' }, library)
      expect(p.routines).toHaveLength(days)
      expect(p.days).toHaveLength(days)
      for (const r of p.routines) {
        expect(r.items.length).toBeGreaterThanOrEqual(4)
        expect(new Set(r.items.map((i) => i.exerciseId)).size).toBe(r.items.length)
      }
    })
  }

  it('respects session length', () => {
    const short = generateProgram({ goal: 'general', days: 3, length: 'short', weeks: 4, deload: false, unit: 'kg' }, library)
    const long = generateProgram({ goal: 'general', days: 3, length: 'long', weeks: 4, deload: false, unit: 'kg' }, library)
    expect(short.routines[0].items).toHaveLength(4)
    expect(long.routines[0].items).toHaveLength(8)
  })

  it('favours barbells and low reps for strength', () => {
    const p = generateProgram({ goal: 'strength', days: 4, length: 'medium', weeks: 8, deload: true, unit: 'kg' }, library)
    const main = p.routines[1].items[0] // Lower A main lift
    expect(byId.get(main.exerciseId)?.equipment).toBe('Barbell')
    expect(main.reps).toBe(5)
    expect(main.restSec).toBe(180)
    expect(main.increment).toBe(5)
  })

  it('uses short rests for conditioning', () => {
    const p = generateProgram({ goal: 'conditioning', days: 3, length: 'medium', weeks: 6, deload: false, unit: 'lb' }, library)
    expect(Math.max(...p.routines.flatMap((r) => r.items.map((i) => i.restSec)))).toBeLessThanOrEqual(75)
  })

  it('excludes equipment', () => {
    const p = generateProgram({ goal: 'size', days: 4, length: 'long', weeks: 8, deload: true, unit: 'kg', exclude: ['Machine', 'Cable'] }, library)
    for (const r of p.routines) for (const i of r.items) expect(['Machine', 'Cable']).not.toContain(byId.get(i.exerciseId)?.equipment)
  })

  it('rotates exercise choices between A and B days', () => {
    const p = generateProgram({ goal: 'size', days: 4, length: 'medium', weeks: 8, deload: true, unit: 'kg' }, library)
    expect(p.routines[0].items[0].exerciseId).not.toBe(p.routines[2].items[0].exerciseId)
  })

  it('sets deload cadence from weeks', () => {
    const goals: Goal[] = ['strength', 'size', 'general', 'conditioning']
    for (const goal of goals) {
      expect(generateProgram({ goal, days: 3, length: 'short', weeks: 8, deload: true, unit: 'kg' }, library).deloadEvery).toBe(4)
      expect(generateProgram({ goal, days: 3, length: 'short', weeks: 6, deload: true, unit: 'kg' }, library).deloadEvery).toBe(3)
      expect(generateProgram({ goal, days: 3, length: 'short', weeks: 4, deload: true, unit: 'kg' }, library).deloadEvery).toBe(0)
      expect(generateProgram({ goal, days: 3, length: 'short', weeks: 8, deload: false, unit: 'kg' }, library).deloadEvery).toBe(0)
    }
  })
})

describe('platesPerSide', () => {
  it('loads 100 kg as 25 + 15 per side', () => expect(platesPerSide(100, 'kg')).toEqual({ plates: [25, 15], remainder: 0 }))
  it('loads 102.5 kg with the small plates', () => expect(platesPerSide(102.5, 'kg')).toEqual({ plates: [25, 15, 1.25], remainder: 0 }))
  it('loads 135 lb as one 45 per side', () => expect(platesPerSide(135, 'lb')).toEqual({ plates: [45], remainder: 0 }))
  it('reports what cannot be loaded', () => expect(platesPerSide(21, 'kg')?.remainder).toBe(0.5))
  it('returns null below the bar', () => expect(platesPerSide(10, 'kg')).toBeNull())
})

describe('stats', () => {
  const monday = new Date(2026, 10, 16, 10).getTime() // Mon 16 Nov 2026
  const now = monday + 5 * 86400000
  const session = (id: number, at: number, weight: number, reps = 5): Session => ({
    id,
    name: 'S',
    startedAt: at - 3600000,
    finishedAt: at,
    entries: [{ exerciseId: 1, restSec: 120, increment: 2.5, sets: [{ reps, weight, done: true, kind: 'work' }, { reps: 8, weight: 20, done: true, kind: 'warmup' }] }],
  })
  const list = [session(1, monday, 100), session(2, monday - 7 * 86400000, 90), session(3, monday + 86400000, 110, 3)]

  it('picks the best estimated 1RM per exercise and ignores warm-ups', () => {
    const best = bestLifts(list, byId)
    expect(best).toHaveLength(1)
    expect(best[0]).toMatchObject({ exerciseId: 1, weight: 110, reps: 3, sessionId: 3 })
  })
  it('buckets sessions into weeks', () => {
    const weeks = weeklyStats(list, 3, now)
    expect(weeks.map((w) => w.sessions)).toEqual([0, 1, 2])
    expect(weeks[2].volume).toBe(100 * 5 + 110 * 3)
    expect(weeks[2].sets).toBe(2)
  })
  it('builds a summary for syncing', () => {
    const s = buildSummary('Me', 'kg', list, byId, [{ date: now - 86400000, weight: 82 }], now)
    expect(s).toMatchObject({ name: 'Me', totalSessions: 3, streak: 2, sessionsThisWeek: 2, bodyweight: { value: 82 } })
    expect(s.lifts[0].name).toBe('Back Squat')
  })
})
