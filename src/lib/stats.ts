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
