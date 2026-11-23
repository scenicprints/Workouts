import type { BodyEntry, DailyEntry, Session, Unit } from '../db'
import { hitAllTargets } from './progression'

/**
 * Readiness: how recovered you are, read from the watch, the scale and your own gym results, and
 * what that does to progression. No effort ratings: everything here is inferred.
 *
 * Recovery (the score)
 * - Resting heart rate: 7-day average against the three weeks before. +3 nudges, +5 hurts, +8 is bad.
 * - Sleep: 7-day average. Under 7 h nudges, under 6.5 h hurts, under 6 h is bad.
 * - Workout heart rate: the last session's average against your usual for recent sessions. 8% over
 *   means the same work cost more.
 * - Gym results: half or more of your lifts missing their targets across the last two sessions.
 * - Steps: a week at half your usual says you are run down or ill.
 *
 * Score 100 minus the penalties. 80+ green, 50-79 amber, under 50 red. One raised signal (heart
 * rate 5 over, sleep under 6.5 h, most lifts missed) is amber on its own; two together are red.
 * - Green: everything progresses.
 * - Amber: compound loads hold even after a clean session; reps still climb, accessories still go up.
 * - Red: nothing goes up, one set fewer on everything.
 * - Red this week and last week: this session becomes a deload (90%, one set fewer).
 *
 * Body trend (the cut gate), from the scale
 * - Bodyweight down 0.25%+ a week: you are cutting. Stalls are judged by whether reps fall, not
 *   whether they rise, because holding a weight in a deficit is a win.
 * - Bodyweight down more than 1% a week, or lean mass down 1.5%+ over the month: compound loads
 *   hold until it settles, and the read says to eat.
 * - Protein under 0.8 g per lb of lean mass (0.7 g per lb of bodyweight when lean mass is unknown)
 *   gets a line, nothing more.
 */

export type ReadinessLevel = 'green' | 'amber' | 'red'

export interface ProgressionRules {
  /** Weight may go up on compound lifts after a clean session. */
  increaseCompounds: boolean
  /** Weight may go up on isolation and accessory lifts. */
  increaseAccessories: boolean
  /** Reps may climb within a rep range. */
  climbReps: boolean
  /** One set fewer on every exercise this session. */
  dropSet: boolean
  /** Make this session a deload whatever the plan says. */
  deload: boolean
  /** Bodyweight is trending down, so stalls use the cut-aware rule. */
  cutting: boolean
}

export interface Readiness {
  level: ReadinessLevel
  score: number
  /** One line per signal that moved the read, worst first. */
  reasons: string[]
  rules: ProgressionRules
  /** Why compound loads are holding, when they are. */
  holdReason?: string
}

export interface ReadinessInput {
  daily: DailyEntry[]
  body: BodyEntry[]
  /** Finished sessions, any order. */
  sessions: Session[]
  unit?: Unit
  now?: number
}

const DAY = 86400000

const avg = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length
const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pick = <T, K extends keyof T>(rows: T[], key: K): number[] => rows.map((r) => r[key]).filter((v): v is Extract<T[K], number> => typeof v === 'number')

interface Signal {
  penalty: number
  text: string
}

function recoverySignals(daily: DailyEntry[], sessions: Session[], now: number): Signal[] {
  const out: Signal[] = []
  const week = daily.filter((d) => d.date > now - 7 * DAY && d.date <= now)
  // The baseline is the three weeks before this one, so a bad week cannot hide inside its own average.
  const baseline = daily.filter((d) => d.date > now - 28 * DAY && d.date <= now - 7 * DAY)

  const rhr7 = pick(week, 'restingHr')
  const rhrBase = pick(baseline, 'restingHr')
  if (rhr7.length >= 4 && rhrBase.length >= 10) {
    const delta = avg(rhr7) - avg(rhrBase)
    const penalty = delta >= 8 ? 45 : delta >= 5 ? 30 : delta >= 3 ? 12 : 0
    if (penalty) out.push({ penalty, text: `Resting heart rate ${Math.round(avg(rhr7))} bpm, ${Math.round(delta)} over your usual ${Math.round(avg(rhrBase))}` })
  }

  const sleep7 = pick(week, 'sleepMin')
  if (sleep7.length >= 4) {
    const h = avg(sleep7) / 60
    const penalty = h < 6 ? 45 : h < 6.5 ? 25 : h < 7 ? 10 : 0
    if (penalty) out.push({ penalty, text: `Sleep averaging ${h.toFixed(1)} h a night` })
  }

  const finished = sessions
    .filter((s) => s.finishedAt && s.finishedAt <= now && s.entries.length > 0)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  const recent = finished.filter((s) => (s.finishedAt ?? 0) > now - 10 * DAY)

  const [last] = recent
  if (last?.hrAvg) {
    const usual = finished.slice(1, 9).map((s) => s.hrAvg).filter((v): v is number => typeof v === 'number' && v > 0)
    if (usual.length >= 3) {
      const ratio = last.hrAvg / median(usual)
      if (ratio >= 1.08) out.push({ penalty: 15, text: `Last session's heart rate ran ${Math.round((ratio - 1) * 100)}% above your usual` })
    }
  }

  const judged = recent.slice(0, 2).flatMap((s) => s.entries.filter((e) => e.sets.some((x) => x.done && x.kind !== 'warmup' && x.targetReps !== undefined)))
  if (judged.length >= 4) {
    const missed = judged.filter((e) => !hitAllTargets(e.sets)).length
    const share = missed / judged.length
    if (share >= 0.75) out.push({ penalty: 30, text: `${missed} of ${judged.length} lifts missed their targets in the last two sessions` })
    else if (share >= 0.5) out.push({ penalty: 20, text: `${missed} of ${judged.length} lifts missed their targets in the last two sessions` })
  }

  const steps7 = pick(week, 'steps')
  const stepsBase = pick(baseline, 'steps')
  if (steps7.length >= 4 && stepsBase.length >= 10 && avg(steps7) < avg(stepsBase) * 0.5) {
    out.push({ penalty: 10, text: `Steps at ${Math.round(avg(steps7)).toLocaleString()} a day, half your usual` })
  }

  return out.sort((a, b) => b.penalty - a.penalty)
}

export interface BodyTrend {
  /** This week's average against last week's, percent. Undefined without two weeks of weigh-ins. */
  weeklyPct?: number
  /** Lean mass this week against the 28-day average, percent. */
  leanPct?: number
  /** Average grams of protein a day over the last week. */
  protein?: number
  /** The protein floor used, in grams. */
  proteinFloor?: number
  /** Average calories a day over the last week. */
  kcal?: number
  cutting: boolean
  freezeCompounds: boolean
  reasons: string[]
}

export function bodyTrend(body: BodyEntry[], daily: DailyEntry[], unit: Unit = 'lb', now = Date.now()): BodyTrend {
  const trend: BodyTrend = { cutting: false, freezeCompounds: false, reasons: [] }
  const weights = (from: number, to: number) => body.filter((b) => b.weight !== undefined && b.date > from && b.date <= to).map((b) => b.weight as number)
  const thisWeek = weights(now - 7 * DAY, now)
  const lastWeek = weights(now - 14 * DAY, now - 7 * DAY)
  if (thisWeek.length >= 3 && lastWeek.length >= 3) {
    const a = avg(thisWeek)
    const b = avg(lastWeek)
    trend.weeklyPct = ((a - b) / b) * 100
    trend.cutting = trend.weeklyPct <= -0.25
    if (trend.weeklyPct <= -1) {
      trend.freezeCompounds = true
      trend.reasons.push(`Bodyweight down ${Math.abs(a - b).toFixed(1)} ${unit} (${Math.abs(trend.weeklyPct).toFixed(1)}%) this week: eat more, compound loads hold`)
    }
  }

  const lean = (from: number, to: number) => body.filter((b) => b.leanMass !== undefined && b.date > from && b.date <= to).map((b) => b.leanMass as number)
  const lean7 = lean(now - 7 * DAY, now)
  const lean28 = lean(now - 28 * DAY, now)
  if (lean7.length >= 3 && lean28.length >= 8) {
    const a = avg(lean7)
    const b = avg(lean28)
    trend.leanPct = ((a - b) / b) * 100
    if (trend.leanPct <= -1.5) {
      trend.freezeCompounds = true
      trend.reasons.push(`Lean mass down ${Math.abs(a - b).toFixed(1)} ${unit} against the month: protein and calories up, compound loads hold`)
    }
  }

  const week = daily.filter((d) => d.date > now - 7 * DAY && d.date <= now)
  const protein = pick(week, 'protein')
  const kcal = pick(week, 'kcal')
  if (kcal.length >= 4) trend.kcal = avg(kcal)
  if (protein.length >= 4) {
    trend.protein = avg(protein)
    const leanLb = lean7.length ? avg(lean7) : lean28.length ? avg(lean28) : undefined
    const weightLb = thisWeek.length ? avg(thisWeek) : lastWeek.length ? avg(lastWeek) : undefined
    const toLb = (v: number) => (unit === 'kg' ? v * 2.2046226218 : v)
    const floor = leanLb !== undefined ? toLb(leanLb) * 0.8 : weightLb !== undefined ? toLb(weightLb) * 0.7 : undefined
    if (floor !== undefined) {
      trend.proteinFloor = floor
      if (trend.protein < floor) trend.reasons.push(`Protein averaging ${Math.round(trend.protein)} g a day, under your ${Math.round(floor)} g floor`)
    }
  }
  return trend
}

/** What a level does to today's targets, in one short clause. */
export function readinessEffect(r: { level: ReadinessLevel; earlyDeload?: boolean }): string {
  if (r.earlyDeload) return 'deload: two red weeks'
  switch (r.level) {
    case 'green':
      return 'everything progresses'
    case 'amber':
      return 'compound loads hold'
    case 'red':
      return 'nothing goes up, one set fewer'
  }
}

export function levelOf(score: number): ReadinessLevel {
  return score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red'
}

/** The full read: recovery score, body trend, and the rules progression should follow. */
export function assessReadiness(input: ReadinessInput): Readiness {
  const now = input.now ?? Date.now()
  const unit = input.unit ?? 'lb'
  const signals = recoverySignals(input.daily, input.sessions, now)
  const score = Math.max(0, 100 - signals.reduce((a, s) => a + s.penalty, 0))
  const level = levelOf(score)
  const trend = bodyTrend(input.body, input.daily, unit, now)

  let lastWeekRed = false
  if (level === 'red') {
    const earlier = recoverySignals(input.daily, input.sessions, now - 7 * DAY)
    lastWeekRed = levelOf(Math.max(0, 100 - earlier.reduce((a, s) => a + s.penalty, 0))) === 'red'
  }

  const rules: ProgressionRules = {
    increaseCompounds: level === 'green' && !trend.freezeCompounds,
    increaseAccessories: level !== 'red',
    climbReps: level !== 'red',
    dropSet: level === 'red',
    deload: level === 'red' && lastWeekRed,
    cutting: trend.cutting,
  }
  const reasons = [...signals.map((s) => s.text), ...trend.reasons]
  if (rules.deload) reasons.unshift('Red two weeks running: this session is a deload')

  let holdReason: string | undefined
  if (!rules.increaseCompounds) {
    holdReason = level === 'red' ? 'recovery red' : level === 'amber' ? 'recovery amber' : trend.leanPct !== undefined && trend.leanPct <= -1.5 ? 'lean mass falling' : 'bodyweight dropping fast'
  }
  return { level, score, reasons, rules, holdReason }
}

/** True when there is enough data for the read to mean anything. */
export function canAssess(daily: DailyEntry[], body: BodyEntry[], sessions: Session[], now = Date.now()): boolean {
  const week = daily.filter((d) => d.date > now - 7 * DAY)
  if (week.filter((d) => d.restingHr !== undefined || d.sleepMin !== undefined).length >= 4) return true
  if (body.filter((b) => b.weight !== undefined && b.date > now - 14 * DAY).length >= 6) return true
  return sessions.filter((s) => s.finishedAt && s.finishedAt > now - 10 * DAY).length >= 2
}
