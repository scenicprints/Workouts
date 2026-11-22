import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { buildSummary, type Summary } from '../lib/stats'
import { loadSyncConfig, pullFromGitHub, pushToGitHub } from '../lib/sync'
import { formatWeight, relativeDay } from '../lib/format'
import { BarChart } from '../components/Charts'

const CACHE_KEY = 'workouts.friends'

export function Friends() {
  const unit = useUnit()
  const exercises = useExerciseMap()
  const cfg = loadSyncConfig()
  const [people, setPeople] = useState<Summary[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as Summary[]
    } catch {
      return []
    }
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(() => Number(localStorage.getItem(`${CACHE_KEY}.at`)) || null)

  async function sync() {
    if (!cfg || !exercises) return
    setError(null)
    try {
      setBusy('Uploading…')
      const [sessions, body] = await Promise.all([db.sessions.toArray(), db.body.toArray()])
      const mine = buildSummary(cfg.name, unit, sessions, exercises, body)
      await pushToGitHub(cfg, mine)
      setBusy('Downloading…')
      const files = await pullFromGitHub(cfg)
      const list = files.map((f) => f.data.summary).filter((s) => s && s.name).sort((a, b) => (a.name === cfg.name ? -1 : b.name === cfg.name ? 1 : a.name.localeCompare(b.name)))
      setPeople(list)
      localStorage.setItem(CACHE_KEY, JSON.stringify(list))
      const at = Date.now()
      localStorage.setItem(`${CACHE_KEY}.at`, String(at))
      setLastSync(at)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (cfg && exercises && people.length === 0) void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!exercises])

  if (!cfg) {
    return (
      <div className="stack">
        <div className="page-head">
          <h1>Friends</h1>
        </div>
        <div className="card">
          <p>Compare streaks, weekly volume and best lifts with a friend through a private GitHub repo. No accounts, no server of your own.</p>
          <Link to="/settings" className="btn btn--primary">
            Set up sync in Settings
          </Link>
        </div>
      </div>
    )
  }

  const liftNames = [...new Set(people.flatMap((p) => p.lifts.map((l) => l.name)))].filter((n) => people.filter((p) => p.lifts.some((l) => l.name === n)).length > 1).slice(0, 8)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Friends</h1>
          <span className="muted small">{lastSync ? `Synced ${relativeDay(lastSync)}` : 'Not synced yet'}</span>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={sync} disabled={!!busy}>
          {busy ?? 'Sync now'}
        </button>
      </div>
      {error ? <div className="card" style={{ borderColor: 'var(--bad)' }}>{error}</div> : null}
      {people.length === 0 && !busy ? <div className="empty">No one has synced yet. Tap Sync now to upload your numbers.</div> : null}

      {people.length > 0 ? (
        <div className="card">
          <div className="card__title">This week</div>
          <div className="compare">
            <div className="compare__head">
              <span />
              {people.map((p) => (
                <span key={p.name} className={p.name === cfg.name ? 'accent' : ''}>
                  {p.name}
                </span>
              ))}
            </div>
            {[
              ['Week streak', (p: Summary) => String(p.streak)],
              ['Sessions', (p: Summary) => String(p.sessionsThisWeek)],
              ['Sets', (p: Summary) => String(p.setsThisWeek)],
              ['Volume', (p: Summary) => `${Math.round(p.volumeThisWeek).toLocaleString()} ${p.unit}`],
              ['Total sessions', (p: Summary) => String(p.totalSessions)],
              ['Bodyweight', (p: Summary) => (p.bodyweight ? formatWeight(p.bodyweight.value, p.unit) : '—')],
            ].map(([label, get]) => (
              <div key={label as string} className="compare__row">
                <span className="muted">{label as string}</span>
                {people.map((p) => (
                  <span key={p.name} className="mono">
                    {(get as (p: Summary) => string)(p)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {liftNames.length > 0 ? (
        <div className="card">
          <div className="card__title">Best lifts (est. 1RM)</div>
          <div className="compare">
            <div className="compare__head">
              <span />
              {people.map((p) => (
                <span key={p.name}>{p.name}</span>
              ))}
            </div>
            {liftNames.map((n) => (
              <div key={n} className="compare__row">
                <span className="muted">{n}</span>
                {people.map((p) => {
                  const l = p.lifts.find((x) => x.name === n)
                  return (
                    <span key={p.name} className="mono">
                      {l ? `${Math.round(l.e1rm)} ${p.unit}` : '—'}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {people.map((p) => (
        <div className="card" key={p.name}>
          <div className="row row--between">
            <div className="card__title">{p.name}</div>
            <span className="muted small">updated {relativeDay(p.updatedAt)}</span>
          </div>
          <BarChart bars={p.weekly.map((w, i) => ({ label: new Date(w.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: w.volume, highlight: i === p.weekly.length - 1 }))} height={100} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString())} />
          {p.lifts.length ? (
            <ul className="list" style={{ gap: 2 }}>
              {p.lifts.slice(0, 5).map((l) => (
                <li key={l.exerciseId} className="row row--between small">
                  <span>{l.name}</span>
                  <span className="mono">
                    {l.reps} × {formatWeight(l.weight, p.unit)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  )
}
