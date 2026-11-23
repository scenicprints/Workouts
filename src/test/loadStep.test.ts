import { describe, expect, it } from 'vitest'
import type { Session } from '../db'
import { dropToGrid, equipmentStep, learnStep, loggedWeights, repBuffer, resolveStep, snapToGrid } from '../lib/loadStep'

describe('learnStep', () => {
  it('says nothing from a single weight', () => {
    expect(learnStep([100, 100, 100], 'lb')).toBeUndefined()
    expect(learnStep([], 'lb')).toBeUndefined()
  })
  it('reads a 10 lb stack from weights that only ever moved in tens', () => {
    expect(learnStep([100, 90, 80], 'lb')).toMatchObject({ step: 10, anchor: 100, source: 'logged' })
  })
  it('reads 5 lb once a weight lands between the tens', () => {
    expect(learnStep([90, 85, 80], 'lb')?.step).toBe(5)
    expect(learnStep([110, 100, 90, 85], 'lb')?.step).toBe(5)
  })
  it('reads a 15 lb stack', () => {
    expect(learnStep([90, 75, 60], 'lb')?.step).toBe(15)
  })
  it('reads the dumbbell rack', () => {
    expect(learnStep([30, 25, 20, 15], 'lb')?.step).toBe(5)
    expect(learnStep([12.5, 10, 7.5], 'lb')?.step).toBe(2.5)
    expect(learnStep([12, 10, 8], 'kg')?.step).toBe(2)
  })
  it('lets one mistyped weight through without shrinking the step', () => {
    expect(learnStep([120, 110, 100, 90, 87], 'lb')?.step).toBe(10)
  })
  it('anchors the grid on the most recent weight', () => {
    // A machine whose stack runs 15, 25, 35: weights are 10 apart but not multiples of 10.
    expect(learnStep([35, 25, 15], 'lb')).toMatchObject({ step: 10, anchor: 35 })
  })
})

describe('resolveStep', () => {
  const machine = { equipment: 'Machine', bodyweight: false }
  it('prefers the learned step, then the seed, then the equipment', () => {
    expect(resolveStep([100, 90], 5, machine, 'lb')).toMatchObject({ step: 10, source: 'logged' })
    expect(resolveStep([100], 5, machine, 'lb')).toMatchObject({ step: 5, source: 'seed', anchor: 100 })
    expect(resolveStep([], undefined, machine, 'lb')).toMatchObject({ step: 10, source: 'equipment' })
    expect(resolveStep([], undefined, undefined, 'kg')).toMatchObject({ step: 2.5 })
  })
  it('keeps a zero seed only where there is no load to add', () => {
    expect(resolveStep([], 0, { equipment: 'Cardio', bodyweight: false }, 'lb').step).toBe(0)
    expect(resolveStep([], 0, { equipment: 'Bodyweight', bodyweight: true }, 'lb').step).toBe(0)
    expect(resolveStep([], 0, machine, 'lb').step).toBe(10)
  })
  it('knows what equipment usually moves in', () => {
    expect(equipmentStep({ equipment: 'Machine', bodyweight: false }, 'kg')).toBe(5)
    expect(equipmentStep({ equipment: 'Dumbbell', bodyweight: false }, 'lb')).toBe(5)
    expect(equipmentStep({ equipment: 'Barbell', bodyweight: false }, 'kg')).toBe(2.5)
    expect(equipmentStep({ equipment: 'Other', bodyweight: false }, 'lb')).toBe(0)
  })
})

describe('grid maths', () => {
  it('snaps to the anchored grid', () => {
    expect(snapToGrid(87, 10, 100)).toBe(90)
    expect(snapToGrid(92, 10, 35)).toBe(95)
    expect(snapToGrid(87, 0)).toBe(87)
  })
  it('drops to the grid weight nearest 90%, always below the start', () => {
    expect(dropToGrid(100, 0.9, 10, 100)).toBe(90)
    expect(dropToGrid(90, 0.9, 10, 90)).toBe(80)
    expect(dropToGrid(102.5, 0.9, 2.5, 100)).toBe(92.5)
    expect(dropToGrid(60, 0.9, 10, 60)).toBe(50)
  })
  it('refuses a drop that would be more than a quarter of the load', () => {
    expect(dropToGrid(20, 0.9, 5, 20)).toBe(15)
    expect(dropToGrid(15, 0.9, 5, 15)).toBe(15)
    expect(dropToGrid(10, 0.9, 5, 10)).toBe(10)
  })
  it('buffers reps when a step is a big share of the load', () => {
    expect(repBuffer(5, 200)).toBe(0)
    expect(repBuffer(10, 100)).toBe(0)
    expect(repBuffer(10, 80)).toBe(2)
    expect(repBuffer(5, 20)).toBe(4)
    expect(repBuffer(0, 0)).toBe(0)
  })
})

describe('loggedWeights', () => {
  it('collects completed work-set weights newest session first', () => {
    const s = (id: number, finishedAt: number, weights: number[]): Session => ({
      id,
      name: 'A',
      startedAt: finishedAt - 1,
      finishedAt,
      entries: [{ exerciseId: 7, restSec: 60, increment: 5, sets: weights.map((weight) => ({ reps: 8, weight, done: true, kind: 'work' as const })) }],
    })
    const sessions = [s(1, 100, [80, 80]), s(2, 300, [90, 90]), s(3, 200, [85, 0])]
    sessions[1].entries[0].sets.push({ reps: 5, weight: 40, done: true, kind: 'warmup' }, { reps: 0, weight: 95, done: false, kind: 'work' })
    expect(loggedWeights(sessions, 7)).toEqual([90, 90, 85, 80, 80])
    expect(loggedWeights(sessions, 8)).toEqual([])
  })
})
