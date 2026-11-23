import { describe, expect, it } from 'vitest'
import type { BodyEntry, DailyEntry, Session, SessionEntry } from '../db'
import { assessReadiness, bodyTrend, canAssess, levelOf } from '../lib/readiness'

const DAY = 86400000
const now = new Date(2026, 10, 23, 12).getTime()
const day = (ago: number) => now - ago * DAY - 1000

function daily(days: number, f: (ago: number) => Partial<DailyEntry>): DailyEntry[] {
  return Array.from({ length: days }, (_, ago) => ({ date: day(ago), ...f(ago) }))
}
function body(days: number, f: (ago: number) => Partial<BodyEntry>): BodyEntry[] {
  return Array.from({ length: days }, (_, ago) => ({ date: day(ago), ...f(ago) }))
}
function entry(results: [reps: number, target: number][]): SessionEntry {
  return { exerciseId: 1, restSec: 90, increment: 5, sets: results.map(([reps, target]) => ({ reps, weight: 100, done: true, kind: 'work', targetReps: target })) }
}
function session(ago: number, entries: SessionEntry[], hrAvg?: number): Session {
  return { id: ago, name: 'A', startedAt: day(ago) - 3600000, finishedAt: day(ago), entries, hrAvg }
}
const win = entry([[8, 8], [8, 8], [8, 8]])
const miss = entry([[8, 8], [7, 8], [6, 8]])
const rested = daily(28, () => ({ restingHr: 55, sleepMin: 7.5 * 60, steps: 9000 }))

describe('levelOf', () => {
  it('splits at 80 and 50', () => {
    expect(levelOf(80)).toBe('green')
    expect(levelOf(79)).toBe('amber')
    expect(levelOf(49)).toBe('red')
  })
})

describe('assessReadiness', () => {
  it('is green with everything in its lane', () => {
    const r = assessReadiness({ daily: rested, body: [], sessions: [], now })
    expect(r).toMatchObject({ level: 'green', score: 100, reasons: [] })
    expect(r.rules).toEqual({ increaseCompounds: true, increaseAccessories: true, climbReps: true, dropSet: false, deload: false, cutting: false })
  })
  it('goes amber on resting heart rate five over the month', () => {
    const d = daily(28, (ago) => ({ restingHr: ago < 7 ? 61 : 55, sleepMin: 7.5 * 60 }))
    const r = assessReadiness({ daily: d, body: [], sessions: [], now })
    expect(r.level).toBe('amber')
    expect(r.rules.increaseCompounds).toBe(false)
    expect(r.rules.increaseAccessories).toBe(true)
    expect(r.holdReason).toBe('recovery amber')
    expect(r.reasons[0]).toMatch(/Resting heart rate 61 bpm, 6 over your usual 55/)
  })
  it('goes red when short sleep stacks on a raised heart rate', () => {
    const d = daily(28, (ago) => ({ restingHr: ago < 7 ? 61 : 55, sleepMin: ago < 7 ? 5.8 * 60 : 7.5 * 60 }))
    const r = assessReadiness({ daily: d, body: [], sessions: [], now })
    expect(r.level).toBe('red')
    expect(r.rules).toMatchObject({ increaseCompounds: false, increaseAccessories: false, climbReps: false, dropSet: true, deload: false })
  })
  it('turns the session into a deload after two red weeks', () => {
    const d = daily(28, () => ({ restingHr: 64, sleepMin: 5.5 * 60 }))
    // 64 all month is not "over the average", so push the month baseline down.
    const d2 = d.map((x, ago) => (ago < 14 ? x : { ...x, restingHr: 54 }))
    const r = assessReadiness({ daily: d2, body: [], sessions: [], now })
    expect(r.level).toBe('red')
    expect(r.rules.deload).toBe(true)
    expect(r.reasons[0]).toMatch(/two weeks running/)
  })
  it('reads a hard last session from the watch', () => {
    const sessions = [session(1, [win], 140), session(3, [win], 120), session(5, [win], 118), session(7, [win], 122), session(9, [win], 121)]
    const r = assessReadiness({ daily: rested, body: [], sessions, now })
    expect(r.score).toBe(85)
    expect(r.reasons[0]).toMatch(/16% above your usual/)
  })
  it('reads missed lifts from the last two sessions', () => {
    const sessions = [session(1, [miss, miss, win]), session(3, [miss, win, miss])]
    const r = assessReadiness({ daily: rested, body: [], sessions, now })
    expect(r.score).toBe(80)
    expect(r.reasons[0]).toMatch(/4 of 6 lifts missed/)
  })
  it('needs four lifts before judging gym results', () => {
    const r = assessReadiness({ daily: rested, body: [], sessions: [session(1, [miss, miss])], now })
    expect(r.score).toBe(100)
  })
  it('notices steps halving', () => {
    const d = daily(28, (ago) => ({ restingHr: 55, sleepMin: 7.5 * 60, steps: ago < 7 ? 3000 : 9000 }))
    expect(assessReadiness({ daily: d, body: [], sessions: [], now }).reasons[0]).toMatch(/half your usual/)
  })
  it('holds compounds on a fast cut even when green', () => {
    const b = body(14, (ago) => ({ weight: ago < 7 ? 220 : 224 }))
    const r = assessReadiness({ daily: rested, body: b, sessions: [], now })
    expect(r.level).toBe('green')
    expect(r.rules.increaseCompounds).toBe(false)
    expect(r.rules.cutting).toBe(true)
    expect(r.holdReason).toBe('bodyweight dropping fast')
  })
})

describe('bodyTrend', () => {
  it('calls a 0.6% weekly drop a cut without freezing anything', () => {
    const t = bodyTrend(body(14, (ago) => ({ weight: ago < 7 ? 220 : 221.4 })), [], 'lb', now)
    expect(t.cutting).toBe(true)
    expect(t.freezeCompounds).toBe(false)
    expect(t.reasons).toEqual([])
  })
  it('freezes compounds when lean mass falls 1.5% against the month', () => {
    const b = body(28, (ago) => ({ weight: 220, leanMass: ago < 7 ? 150 : 154 }))
    const t = bodyTrend(b, [], 'lb', now)
    expect(t.freezeCompounds).toBe(true)
    expect(t.reasons[0]).toMatch(/Lean mass down/)
  })
  it('flags protein under 0.8 g per lb of lean mass', () => {
    const b = body(28, () => ({ weight: 220, leanMass: 155 }))
    const d = daily(7, () => ({ protein: 110, kcal: 2200 }))
    const t = bodyTrend(b, d, 'lb', now)
    expect(t.proteinFloor).toBeCloseTo(124, 0)
    expect(t.kcal).toBe(2200)
    expect(t.reasons[0]).toMatch(/Protein averaging 110 g a day, under your 124 g floor/)
  })
  it('falls back to 0.7 g per lb of bodyweight without lean mass', () => {
    const t = bodyTrend(body(7, () => ({ weight: 200 })), daily(7, () => ({ protein: 150 })), 'lb', now)
    expect(t.proteinFloor).toBe(140)
    expect(t.reasons).toEqual([])
  })
})

describe('canAssess', () => {
  it('needs a week of watch data, two weeks of weigh-ins, or two recent sessions', () => {
    expect(canAssess([], [], [], now)).toBe(false)
    expect(canAssess(daily(4, () => ({ restingHr: 55 })), [], [], now)).toBe(true)
    expect(canAssess([], body(6, () => ({ weight: 220 })), [], now)).toBe(true)
    expect(canAssess([], [], [session(1, [win]), session(3, [win])], now)).toBe(true)
  })
})
