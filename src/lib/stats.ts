import type { BodyEntry, Exercise, Session } from '../db'
import { estimate1RM, sessionVolume } from './progression'
import { weeklyStreak } from './format'

export interface LiftRecord {
  exerciseId: number
  name: string
  weight: number
  reps: number
  e1rm: number
  date: number
  sessionId: number
}

/** Best estimated one-rep max per exercise, plus whether it was set in the last `recentDays`. */
export function bestLifts(sessions: Session[], exercises: Map<number, Exercise>): LiftRecord[] {
  const best = new Map<number, LiftRecord>()
  for (const s of sessions) {
    if (!s.finishedAt) continue
    for (const e of s.entries) {
      for (const set of e.sets) {
        if (!set.done || set.kind === 'warmup') continue
        const e1rm = estimate1RM(set.weight, set.reps)
        if (e1rm <= 0) continue
        const cur = best.get(e.exerciseId)
        if (!cur || e1rm > cur.e1rm + 1e-9) {
          best.set(e.exerciseId, { exerciseId: e.exerciseId, name: exercises.get(e.exerciseId)?.name ?? 'Exercise', weight: set.weight, reps: set.reps, e1rm, date: s.finishedAt, sessionId: s.id! })
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm)
}

export function recentPRs(sessions: Session[], exercises: Map<number, Exercise>, days = 30, now = Date.now()): LiftRecord[] {
  const since = now - days * 86400000
  return bestLifts(sessions, exercises).filter((r) => r.date >= since).sort((a, b) => b.date - a.date)
}

export function mondayOf(ts: number): number {
  const d = new Date(ts)
  const day = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime()
}

export interface WeekStat {
  weekStart: number
  sessions: number
  volume: number
  sets: number
}

/** Last `weeks` weeks ending this week, oldest first. */
export function weeklyStats(sessions: Session[], weeks = 8, now = Date.now()): WeekStat[] {
  const out: WeekStat[] = []
  const thisMonday = mondayOf(now)
  for (let i = weeks - 1; i >= 0; i--) {
    const start = mondayOf(thisMonday - i * 7 * 86400000 + 12 * 3600000)
    out.push({ weekStart: start, sessions: 0, volume: 0, sets: 0 })
  }
  for (const s of sessions) {
    if (!s.finishedAt || s.entries.length === 0) continue
    const start = mondayOf(s.finishedAt)
    const w = out.find((x) => x.weekStart === start)
    if (!w) continue
    w.sessions++
    w.volume += sessionVolume(s)
    w.sets += s.entries.reduce((a, e) => a + e.sets.filter((x) => x.done && x.kind !== 'warmup').length, 0)
  }
  return out
}

/** Working sets per muscle group per week, oldest week first. Muscles sorted by total. */
export function weeklySetsByMuscle(sessions: Session[], exercises: Map<number, Exercise>, weeks = 8, now = Date.now()): { weeks: number[]; muscles: { muscle: string; sets: number[]; total: number }[] } {
  const starts: number[] = []
  const thisMonday = mondayOf(now)
  for (let i = weeks - 1; i >= 0; i--) starts.push(mondayOf(thisMonday - i * 7 * 86400000 + 12 * 3600000))
  const table = new Map<string, number[]>()
  for (const s of sessions) {
    if (!s.finishedAt) continue
    const wi = starts.indexOf(mondayOf(s.finishedAt))
    if (wi === -1) continue
    for (const e of s.entries) {
      const muscle = exercises.get(e.exerciseId)?.muscle ?? 'Other'
      const row = table.get(muscle) ?? new Array(weeks).fill(0)
      row[wi] += e.sets.filter((x) => x.done && x.kind !== 'warmup').length
      table.set(muscle, row)
    }
  }
  const muscles = [...table.entries()].map(([muscle, sets]) => ({ muscle, sets, total: sets.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total)
  return { weeks: starts, muscles }
}

/** Every time an exercise's estimated 1RM beat its previous best, newest first. */
export function prTimeline(sessions: Session[], exercises: Map<number, Exercise>): (LiftRecord & { previous: number })[] {
  const best = new Map<number, number>()
  const out: (LiftRecord & { previous: number })[] = []
  for (const s of [...sessions].filter((x) => !!x.finishedAt).sort((a, b) => a.finishedAt! - b.finishedAt!)) {
    for (const e of s.entries) {
      let top: { weight: number; reps: number; e1rm: number } | null = null
      for (const set of e.sets) {
        if (!set.done || set.kind === 'warmup') continue
        const e1rm = estimate1RM(set.weight, set.reps)
        if (e1rm > 0 && (!top || e1rm > top.e1rm)) top = { weight: set.weight, reps: set.reps, e1rm }
      }
      if (!top) continue
      const prev = best.get(e.exerciseId) ?? 0
      if (top.e1rm > prev + 1e-9) {
        best.set(e.exerciseId, top.e1rm)
        if (prev > 0) out.push({ exerciseId: e.exerciseId, name: exercises.get(e.exerciseId)?.name ?? 'Exercise', weight: top.weight, reps: top.reps, e1rm: top.e1rm, date: s.finishedAt!, sessionId: s.id!, previous: prev })
      }
    }
  }
  return out.reverse()
}

export interface Summary {
  name: string
  updatedAt: number
  totalSessions: number
  streak: number
  sessionsThisWeek: number
  volumeThisWeek: number
  setsThisWeek: number
  weekly: WeekStat[]
  lifts: LiftRecord[]
  bodyweight?: { value: number; date: number }
  unit: string
}

/** The compact profile that gets synced for comparing with a friend. */
export function buildSummary(name: string, unit: string, sessions: Session[], exercises: Map<number, Exercise>, body: BodyEntry[], now = Date.now()): Summary {
  const finished = sessions.filter((s) => !!s.finishedAt && s.entries.length > 0)
  const weekly = weeklyStats(finished, 8, now)
  const thisWeek = weekly[weekly.length - 1]
  const latestWeight = [...body].filter((b) => b.weight).sort((a, b) => b.date - a.date)[0]
  return {
    name,
    updatedAt: now,
    unit,
    totalSessions: finished.length,
    streak: weeklyStreak(finished.map((s) => s.finishedAt!), now),
    sessionsThisWeek: thisWeek?.sessions ?? 0,
    volumeThisWeek: thisWeek?.volume ?? 0,
    setsThisWeek: thisWeek?.sets ?? 0,
    weekly,
    lifts: bestLifts(finished, exercises).slice(0, 12),
    bodyweight: latestWeight ? { value: latestWeight.weight!, date: latestWeight.date } : undefined,
  }
}
