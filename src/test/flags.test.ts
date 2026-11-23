import { describe, expect, it } from 'vitest'
import type { BodyEntry, DailyEntry } from '../db'
import { canFlag, healthFlags } from '../lib/flags'

const DAY = 86400000
const now = new Date(2026, 10, 23, 12).getTime()
const day = (ago: number) => now - ago * DAY - 1000

function daily(days: number, f: (ago: number) => Partial<DailyEntry>): DailyEntry[] {
  return Array.from({ length: days }, (_, ago) => ({ date: day(ago), ...f(ago) }))
}
function weights(days: number, f: (ago: number) => number): BodyEntry[] {
  return Array.from({ length: days }, (_, ago) => ({ date: day(ago), weight: f(ago) }))
}

describe('healthFlags', () => {
  it('needs enough data to say anything', () => {
    expect(canFlag([], [], now)).toBe(false)
    expect(healthFlags(daily(2, () => ({ restingHr: 70 })), [], 'lb', now)).toEqual([])
  })
  it('stays quiet when everything is in its lane', () => {
    const d = daily(28, () => ({ restingHr: 55, sleepMin: 7 * 60 }))
    const b = weights(14, (ago) => 220 + ago * 0.2) // about 0.6% a week down
    expect(canFlag(d, b, now)).toBe(true)
    expect(healthFlags(d, b, 'lb', now)).toEqual([])
  })
  it('flags resting heart rate 5+ over the 28-day average', () => {
    const d = daily(28, (ago) => ({ restingHr: ago < 7 ? 62 : 55 }))
    const [f] = healthFlags(d, [], 'lb', now)
    expect(f).toMatchObject({ key: 'rhr', level: 'warn' })
    expect(f.detail).toMatch(/62 bpm/)
  })
  it('flags short sleep, worse under 6 h', () => {
    expect(healthFlags(daily(7, () => ({ sleepMin: 6.2 * 60 })), [], 'lb', now)[0]).toMatchObject({ key: 'sleep', level: 'warn' })
    expect(healthFlags(daily(7, () => ({ sleepMin: 5.5 * 60 })), [], 'lb', now)[0]).toMatchObject({ key: 'sleep', level: 'bad' })
  })
  it('flags bodyweight falling faster than 1% a week', () => {
    const [f] = healthFlags([], weights(14, (ago) => (ago < 7 ? 215 : 220)), 'lb', now)
    expect(f).toMatchObject({ key: 'weight', title: 'Bodyweight moving fast' })
    expect(f.detail).toMatch(/5.0 lb/)
  })
  it('flags a flat bodyweight', () => {
    expect(healthFlags([], weights(14, () => 220), 'lb', now)[0]).toMatchObject({ key: 'weight', title: 'Bodyweight is flat' })
  })
})
