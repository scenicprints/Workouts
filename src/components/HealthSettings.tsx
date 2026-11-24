import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { connectHealth, healthPrefs, healthStatus, isNativeApp, syncHealth, type HealthPrefs, type HealthStatus } from '../lib/health'
import { relativeDay } from '../lib/format'

export const APK_URL = 'https://github.com/scenicprints/Workouts/releases/latest/download/workouts.apk'

export function HealthSettings({ onStatus }: { onStatus: (s: string) => void }) {
  const [status, setStatus] = useState<HealthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const prefs = useLiveQuery(async () => ((await db.settings.get('health.prefs'))?.value as HealthPrefs | undefined) ?? null, [])
  const lastSync = useLiveQuery(async () => ((await db.settings.get('health.lastSync'))?.value as number | undefined) ?? null, [])

  useEffect(() => {
    void healthStatus().then(setStatus)
  }, [])

  if (!isNativeApp()) {
    return (
      <div className="card">
        <div className="card__title">Health Connect and Pixel Watch</div>
        <p className="muted small">Body composition from your scale, heart rate and calories from the watch, daily steps, sleep and calories and protein eaten, and writing workouts back to Fitbit all need the Android app. Your data and sign-ins carry over through a backup.</p>
        <a className="btn btn--sm" href={APK_URL} target="_blank" rel="noreferrer">
          Download the Android app
        </a>
      </div>
    )
  }

  const p: HealthPrefs = prefs ?? { enabled: false, body: true, daily: true, vitals: true, write: true }

  async function connect() {
    setBusy(true)
    try {
      const ok = await connectHealth()
      setStatus(await healthStatus())
      onStatus(ok ? 'Health Connect connected. Syncing…' : 'Some permissions were not granted. Open Health Connect to allow them.')
      if (ok) await runSync(true)
    } catch (err) {
      onStatus(`Health Connect: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  async function runSync(full = false) {
    setBusy(true)
    try {
      const r = await syncHealth({ full })
      onStatus(`Synced: ${r.body} body entries, ${r.daily} days, ${r.vitals} sessions with vitals, ${r.written} written to Health Connect.`)
    } catch (err) {
      onStatus(`Sync failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (key: keyof HealthPrefs) => healthPrefs.set({ ...p, [key]: !p[key] })

  return (
    <div className="card">
      <div className="card__title">Health Connect and Pixel Watch</div>
      {!status ? (
        <p className="muted small">Checking…</p>
      ) : !status.available ? (
        <p className="muted small">{status.status === 'update_required' ? 'Health Connect needs an update. Open the Play Store and update it, then come back.' : 'Health Connect is not available on this phone. It is built into Android 14 and later, and installable from the Play Store on Android 9 to 13.'}</p>
      ) : !p.enabled || (!status.granted && status.missing.length === 0) ? (
        <>
          <p className="muted small">Reads weight, body fat and lean mass from your scale, heart rate and calories from the watch for each workout, and daily steps, sleep, resting heart rate, and calories and protein eaten (from BodyComp). Writes finished strength sessions so they show in Fitbit.</p>
          <button type="button" className="btn btn--primary" onClick={connect} disabled={busy}>
            {busy ? 'Opening…' : 'Connect Health Connect'}
          </button>
        </>
      ) : (
        <div className="stack">
          <p className="small">
            Connected. {lastSync ? `Last sync ${relativeDay(lastSync)}.` : 'Not synced yet.'} The app syncs when it opens; sync by hand any time.
          </p>
          {status.missing.length ? (
            <div className="row row--between" style={{ alignItems: 'center' }}>
              <span className="small">
                Not yet allowed: {status.missing.join(', ')}. {status.missing.includes('nutrition') ? 'Calories and protein from BodyComp need this.' : ''}
              </span>
              <button type="button" className="btn btn--sm btn--primary" onClick={connect} disabled={busy}>
                {busy ? 'Opening…' : 'Allow'}
              </button>
            </div>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={p.body} onChange={() => toggle('body')} />
            <span>Import body composition from my scale</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.daily} onChange={() => toggle('daily')} />
            <span>Import daily steps, sleep, resting heart rate, calories and protein eaten</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.vitals} onChange={() => toggle('vitals')} />
            <span>Attach watch heart rate and calories to each workout</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.write} onChange={() => toggle('write')} />
            <span>Write finished workouts to Health Connect</span>
          </label>
          <div className="row">
            <button type="button" className="btn btn--sm" onClick={() => runSync(false)} disabled={busy}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => runSync(true)} disabled={busy}>
              Full re-sync
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => healthPrefs.set({ ...p, enabled: false })}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
