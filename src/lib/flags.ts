import type { BodyEntry, DailyEntry, Unit } from '../db'

/**
 * Recovery and bodyweight flags from Health Connect data. The app only points; you decide.
 * - Resting heart rate: 7-day average 5+ bpm over the 28-day average.
 * - Sleep: 7-day average under 6.5 h (under 6 h is worse).
 * - Bodyweight: this week's average vs last week's, outside 0.25% to 1% a week.
 */
export interface HealthFlag {
  key: 'rhr' | 'sleep' | 'weight'
  level: 'warn' | 'bad'
  title: string
  detail: string
}

const DAY = 86400000

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function healthFlags(daily: DailyEntry[], body: BodyEntry[], unit: Unit = 'lb', now = Date.now()): HealthFlag[] {
  const flags: HealthFlag[] = []
  const since = (days: number) => now - days * DAY
  const week = daily.filter((d) => d.date > since(7) && d.date <= now)
  const month = daily.filter((d) => d.date > since(28) && d.date <= now)

  const rhr7 = week.map((d) => d.restingHr).filter((v): v is number => v !== undefined)
  const rhr28 = month.map((d) => d.restingHr).filter((v): v is number => v !== undefined)
  if (rhr7.length >= 4 && rhr28.length >= 14) {
    const a = avg(rhr7)
    const b = avg(rhr28)
    if (a - b >= 5) {
      flags.push({ key: 'rhr', level: a - b >= 8 ? 'bad' : 'warn', title: 'Resting heart rate is up', detail: `7-day average ${Math.round(a)} bpm, ${Math.round(a - b)} over your 28-day average of ${Math.round(b)}.` })
    }
  }

  const sleep7 = week.map((d) => d.sleepMin).filter((v): v is number => v !== undefined)
  if (sleep7.length >= 4) {
    const h = avg(sleep7) / 60
    if (h < 6.5) {
      flags.push({ key: 'sleep', level: h < 6 ? 'bad' : 'warn', title: h < 6 ? 'Sleep under 6 hours' : 'Sleep under 6.5 hours', detail: `7-day average ${h.toFixed(1)} h a night.` })
    }
  }

  const weighIns = (from: number, to: number) => body.filter((b) => b.weight !== undefined && b.date > from && b.date <= to).map((b) => b.weight as number)
  const thisWeek = weighIns(since(7), now)
  const lastWeek = weighIns(since(14), since(7))
  if (thisWeek.length >= 3 && lastWeek.length >= 3) {
    const a = avg(thisWeek)
    const b = avg(lastWeek)
    const pct = ((a - b) / b) * 100
    const abs = Math.abs(pct)
    const diff = `${pct > 0 ? '+' : '−'}${Math.abs(a - b).toFixed(1)} ${unit} (${abs.toFixed(2)}%)`
    if (abs > 1) {
      flags.push({ key: 'weight', level: abs > 1.5 ? 'bad' : 'warn', title: `Bodyweight moving fast`, detail: `${diff} this week against last week's average. More than 1% a week.` })
    } else if (abs < 0.25) {
      flags.push({ key: 'weight', level: 'warn', title: 'Bodyweight is flat', detail: `${diff} this week against last week's average. Under 0.25% a week.` })
    }
  }
  return flags
}

/** True when there is enough data for at least one rule to run. */
export function canFlag(daily: DailyEntry[], body: BodyEntry[], now = Date.now()): boolean {
  const week = daily.filter((d) => d.date > now - 7 * DAY)
  return week.filter((d) => d.restingHr !== undefined || d.sleepMin !== undefined).length >= 4 || body.filter((b) => b.weight !== undefined && b.date > now - 14 * DAY).length >= 6
}
