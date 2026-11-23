import { describe, expect, it } from 'vitest'
import { groupEntries, interleaveSets, newGroupId } from '../lib/superset'
import { prTimeline, weeklySetsByMuscle } from '../lib/stats'
import type { Exercise, Session } from '../db'

describe('supersets', () => {
  it('groups entries that share an id and keeps order', () => {
    const entries = [{ group: undefined }, { group: 'a' }, { group: undefined }, { group: 'a' }, { group: 'b' }]
    const blocks = groupEntries(entries)
    expect(blocks.map((b) => b.indices)).toEqual([[0], [1, 3], [2], [4]])
    expect(blocks[1].group).toBe('a')
    // a lone member is not a superset
    expect(blocks[3].group).toBeUndefined()
  })
  it('interleaves sets round robin', () => {
    expect(interleaveSets([2, 3])).toEqual([
      { entry: 0, set: 0 },
      { entry: 1, set: 0 },
      { entry: 0, set: 1 },
      { entry: 1, set: 1 },
      { entry: 1, set: 2 },
    ])
  })
  it('makes unique ids', () => {
    expect(newGroupId()).not.toBe(newGroupId())
  })
})

describe('progress stats', () => {
  const ex = new Map<number, Exercise>([
    [1, { id: 1, name: 'Bench', muscle: 'Chest', equipment: 'Barbell', createdAt: 0 }],
    [2, { id: 2, name: 'Row', muscle: 'Back', equipment: 'Barbell', createdAt: 0 }],
  ])
  const monday = new Date(2026, 10, 16, 10).getTime()
  const day = 86400000
  const s = (id: number, at: number, w: number, reps = 5, exerciseId = 1): Session => ({ id, name: 'S', startedAt: at, finishedAt: at + 1000, entries: [{ exerciseId, restSec: 0, increment: 0, sets: [{ reps, weight: w, done: true, kind: 'work' }, { reps, weight: w, done: true, kind: 'work' }] }] })
  const sessions = [s(1, monday - 7 * day, 100), s(2, monday, 110), s(3, monday + day, 105), s(4, monday + 2 * day, 60, 8, 2)]

  it('counts working sets per muscle per week', () => {
    const r = weeklySetsByMuscle(sessions, ex, 2, monday + 3 * day)
    expect(r.weeks).toHaveLength(2)
    const chest = r.muscles.find((m) => m.muscle === 'Chest')!
    expect(chest.sets).toEqual([2, 4])
    expect(r.muscles[0].muscle).toBe('Chest')
  })
  it('lists PRs newest first with the previous best', () => {
    const prs = prTimeline(sessions, ex)
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ exerciseId: 1, weight: 110, sessionId: 2 })
    expect(Math.round(prs[0].previous)).toBe(117)
  })
})
