import { Capacitor, registerPlugin } from '@capacitor/core'
import { db, getSetting, setSetting, type BodyEntry, type DailyEntry } from '../db'

/**
 * Health Connect bridge. Only does anything inside the Android app; on the web every call is a no-op
 * and the UI shows a pointer to the APK instead.
 */
interface HealthConnectPlugin {
  isAvailable(): Promise<{ available: boolean; status: 'available' | 'update_required' | 'unavailable' }>
  hasPermissions(): Promise<{ granted: boolean; count: number }>
  requestHealthPermissions(): Promise<{ granted: boolean; count: number }>
  readBody(o: { since: number }): Promise<{ records: { type: 'weight' | 'fat' | 'lean'; time: number; value: number }[] }>
  readDaily(o: { since: number }): Promise<{ days: { date: number; steps?: number; sleepMin?: number; restingHr?: number }[] }>
  readSessionVitals(o: { start: number; end: number }): Promise<{ hrAvg?: number; hrMax?: number; calories?: number }>
  writeSession(o: { start: number; end: number; title: string; notes?: string }): Promise<{ id: string }>
}

const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect')

export const isNativeApp = (): boolean => Capacitor.isNativePlatform()

export interface HealthPrefs {
  enabled: boolean
  body: boolean
  daily: boolean
  vitals: boolean
  write: boolean
}

const DEFAULT_PREFS: HealthPrefs = { enabled: false, body: true, daily: true, vitals: true, write: true }

export const healthPrefs = {
  get: () => getSetting<HealthPrefs>('health.prefs', DEFAULT_PREFS),
  set: (p: HealthPrefs) => setSetting('health.prefs', p),
}

export async function healthStatus(): Promise<{ native: boolean; available: boolean; status: string; granted: boolean }> {
  if (!isNativeApp()) return { native: false, available: false, status: 'web', granted: false }
  const a = await HealthConnect.isAvailable()
  if (!a.available) return { native: true, available: false, status: a.status, granted: false }
  const p = await HealthConnect.hasPermissions()
  return { native: true, available: true, status: a.status, granted: p.granted }
}

export async function connectHealth(): Promise<boolean> {
  const r = await HealthConnect.requestHealthPermissions()
  if (r.granted) await healthPrefs.set({ ...(await healthPrefs.get()), enabled: true })
  return r.granted
}

function dayStart(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const DAY = 86400000

export interface HealthSyncReport {
  body: number
  daily: number
  vitals: number
  written: number
  at: number
}

/** Pull everything new from Health Connect and push unsent sessions. Safe to call often. */
export async function syncHealth(options: { full?: boolean } = {}): Promise<HealthSyncReport> {
  const prefs = await healthPrefs.get()
  const report: HealthSyncReport = { body: 0, daily: 0, vitals: 0, written: 0, at: Date.now() }
  if (!isNativeApp() || !prefs.enabled) return report
  const lastSync = options.full ? 0 : await getSetting<number>('health.lastSync', 0)
  const now = Date.now()

  if (prefs.body) {
    // Re-read a few days of overlap so late-arriving scale syncs still land.
    const since = lastSync ? lastSync - 3 * DAY : now - 365 * DAY
    const { records } = await HealthConnect.readBody({ since })
    const byDay = new Map<number, Partial<BodyEntry>>()
    for (const r of records.sort((a, b) => a.time - b.time)) {
      const date = dayStart(r.time)
      const cur = byDay.get(date) ?? {}
      if (r.type === 'weight') cur.weight = Math.round(r.value * 10) / 10
      if (r.type === 'fat') cur.bodyFat = Math.round(r.value * 10) / 10
      if (r.type === 'lean') cur.leanMass = Math.round(r.value * 10) / 10
      byDay.set(date, cur)
    }
    const unit = await getSetting<'kg' | 'lb'>('unit', 'lb')
    for (const [date, patch] of byDay) {
      const existing = await db.body.where('date').equals(date).first()
      const toUnit = (kg: number | undefined) => (kg === undefined ? undefined : unit === 'lb' ? Math.round(kg * 2.2046226218 * 10) / 10 : kg)
      const merged: BodyEntry = {
        ...(existing ?? { date }),
        weight: toUnit(patch.weight) ?? existing?.weight,
        bodyFat: patch.bodyFat ?? existing?.bodyFat,
        leanMass: toUnit(patch.leanMass) ?? existing?.leanMass,
        source: 'health',
      }
      await db.body.put(merged)
      report.body++
    }
  }

  if (prefs.daily) {
    const since = lastSync ? lastSync - 2 * DAY : now - 90 * DAY
    const { days } = await HealthConnect.readDaily({ since })
    const rows: DailyEntry[] = days
      .filter((d) => d.steps !== undefined || d.sleepMin !== undefined || d.restingHr !== undefined)
      .map((d) => ({ date: dayStart(d.date), steps: d.steps, sleepMin: d.sleepMin, restingHr: d.restingHr }))
    if (rows.length) await db.daily.bulkPut(rows)
    report.daily = rows.length
  }

  if (prefs.vitals || prefs.write) {
    const recent = await db.sessions.filter((s) => !!s.finishedAt && s.finishedAt > now - 30 * DAY && s.entries.length > 0).toArray()
    for (const s of recent) {
      const patch: Partial<typeof s> = {}
      if (prefs.vitals && s.hrAvg === undefined) {
        try {
          const v = await HealthConnect.readSessionVitals({ start: s.startedAt, end: s.finishedAt! })
          if (v.hrAvg !== undefined || v.calories !== undefined) {
            patch.hrAvg = v.hrAvg
            patch.hrMax = v.hrMax
            patch.calories = v.calories === undefined ? undefined : Math.round(v.calories)
            report.vitals++
          }
        } catch {
          // keep going; the next sync will try again
        }
      }
      if (prefs.write && !s.healthId) {
        try {
          const w = await HealthConnect.writeSession({ start: s.startedAt, end: s.finishedAt!, title: s.name, notes: s.notes })
          patch.healthId = w.id || 'written'
          report.written++
        } catch {
          // ignore; retried next sync
        }
      }
      if (Object.keys(patch).length) await db.sessions.update(s.id!, patch)
    }
  }

  await setSetting('health.lastSync', report.at)
  return report
}

/** Called right after a workout is finished: attach watch vitals and write it to Health Connect. */
export async function onSessionFinished(sessionId: number): Promise<void> {
  if (!isNativeApp()) return
  const prefs = await healthPrefs.get()
  if (!prefs.enabled) return
  const s = await db.sessions.get(sessionId)
  if (!s?.finishedAt) return
  const patch: Partial<typeof s> = {}
  if (prefs.vitals) {
    try {
      const v = await HealthConnect.readSessionVitals({ start: s.startedAt, end: s.finishedAt })
      patch.hrAvg = v.hrAvg
      patch.hrMax = v.hrMax
      patch.calories = v.calories === undefined ? undefined : Math.round(v.calories)
    } catch {
      // vitals are a bonus
    }
  }
  if (prefs.write && s.entries.length > 0) {
    try {
      const w = await HealthConnect.writeSession({ start: s.startedAt, end: s.finishedAt, title: s.name, notes: s.notes })
      patch.healthId = w.id || 'written'
    } catch {
      // retried by the next sync
    }
  }
  if (Object.keys(patch).length) await db.sessions.update(sessionId, patch)
}
