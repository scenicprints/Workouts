import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useUnit } from '../hooks/useSettings'
import { sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDuration, formatWeight, relativeDay } from '../lib/format'

export function History() {
  const unit = useUnit()
  const sessions = useLiveQuery(() => db.sessions.orderBy('finishedAt').reverse().filter((s) => !!s.finishedAt).toArray(), [])
  if (!sessions) return null
  const months = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const key = new Date(s.finishedAt!).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    months.set(key, [...(months.get(key) ?? []), s])
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1>History</h1>
        <span className="muted small">{sessions.length} sessions</span>
      </div>
      {sessions.length === 0 ? <div className="empty">No finished workouts yet.</div> : null}
      {[...months.entries()].map(([month, list]) => (
        <div key={month}>
          <h2 className="muted" style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {month}
          </h2>
          <ul className="list">
            {list.map((s) => (
              <li key={s.id}>
                <Link className="list__item" to={`/history/${s.id}`}>
                  <span className="row row--between">
                    <span className="list__title">{s.name}</span>
                    {s.planWeek ? (
                      <span className="pill">
                        W{s.planWeek} D{s.planDay}
                      </span>
                    ) : null}
                  </span>
                  <span className="list__meta">
                    {relativeDay(s.finishedAt!)}
                    {s.entries.length > 0 ? ` · ${sessionSetCount(s)} sets · ${formatWeight(Math.round(sessionVolume(s)), unit)} · ${formatDuration(s.finishedAt! - s.startedAt)}` : ' · rest day'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
