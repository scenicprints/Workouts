import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { estimate1RM } from '../lib/progression'
import { bestLifts, prTimeline, weeklySetsByMuscle } from '../lib/stats'
import { formatDate, formatWeight, relativeDay } from '../lib/format'
import { LineChart } from '../components/Charts'

export function Progress() {
  const unit = useUnit()
  const exercises = useExerciseMap()
  const [now] = useState(() => Date.now())
  const sessions = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt && s.entries.length > 0).toArray(), [])
  const [picked, setPicked] = useState<number | null>(null)

  const lifts = useMemo(() => (sessions && exercises ? bestLifts(sessions, exercises) : []), [sessions, exercises])
  const muscle = useMemo(() => (sessions && exercises ? weeklySetsByMuscle(sessions, exercises, 8, now) : null), [sessions, exercises, now])
  const prs = useMemo(() => (sessions && exercises ? prTimeline(sessions, exercises).slice(0, 20) : []), [sessions, exercises])
  if (!sessions || !exercises || !muscle) return null

  const exerciseId = picked ?? lifts[0]?.exerciseId ?? null
  const points = exerciseId
    ? [...sessions]
        .sort((a, b) => a.finishedAt! - b.finishedAt!)
        .map((s) => {
          const e = s.entries.find((x) => x.exerciseId === exerciseId)
          if (!e) return null
          const best = Math.max(0, ...e.sets.filter((x) => x.done && x.kind !== 'warmup').map((x) => estimate1RM(x.weight, x.reps)))
          return best > 0 ? { x: s.finishedAt!, y: Math.round(best) } : null
        })
        .filter((p): p is { x: number; y: number } => !!p)
    : []
  const maxSets = Math.max(1, ...muscle.muscles.flatMap((m) => m.sets))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Progress</h1>
        <span className="muted small">{sessions.length} workouts</span>
      </div>

      <div>
        <div className="section">Estimated 1RM</div>
        {lifts.length === 0 ? (
          <div className="empty">Log a few workouts first.</div>
        ) : (
          <>
            <select value={exerciseId ?? ''} onChange={(e) => setPicked(Number(e.target.value))} aria-label="Exercise" style={{ marginBottom: 12 }}>
              {lifts.map((l) => (
                <option key={l.exerciseId} value={l.exerciseId}>
                  {l.name} · {Math.round(l.e1rm)} {unit}
                </option>
              ))}
            </select>
            {points.length >= 2 ? <LineChart points={points} /> : <p className="muted small">One session so far. The line appears after the next.</p>}
            {exerciseId ? (
              <div className="row row--between" style={{ marginTop: 8 }}>
                <span className="muted small">Best: {lifts.find((l) => l.exerciseId === exerciseId)?.reps} × {formatWeight(lifts.find((l) => l.exerciseId === exerciseId)?.weight ?? 0, unit)}</span>
                <Link to={`/exercises/${exerciseId}`} className="small">
                  Exercise history
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div>
        <div className="section">Sets per muscle · 8 weeks</div>
        {muscle.muscles.length === 0 ? (
          <div className="empty">Nothing yet.</div>
        ) : (
          <ul className="list">
            {muscle.muscles.map((m) => (
              <li key={m.muscle} style={{ padding: '10px 0' }}>
                <div className="row row--between" style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{m.muscle}</span>
                  <span className="mono muted small">
                    {m.sets[m.sets.length - 1]} this week · {m.total} total
                  </span>
                </div>
                <div className="bars" style={{ height: 24 }} aria-label={`${m.muscle} sets per week`}>
                  {m.sets.map((n, i) => (
                    <span key={i} className={i === m.sets.length - 1 ? 'is-now' : ''} style={{ height: `${Math.max(4, (n / maxSets) * 100)}%` }} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="section">PR timeline</div>
        {prs.length === 0 ? (
          <div className="empty">A PR shows here the first time a lift beats its previous best.</div>
        ) : (
          <ul className="list">
            {prs.map((p, i) => (
              <li key={`${p.sessionId}-${p.exerciseId}-${i}`}>
                <Link className="list__item" to={`/history/${p.sessionId}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="list__title">{p.name}</span>
                    <span className="list__meta">
                      {relativeDay(p.date)} · {formatDate(p.date)}
                    </span>
                  </span>
                  <span className="mono" style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 500 }}>{Math.round(p.e1rm)}</span>
                    <span className="muted small"> ← {Math.round(p.previous)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
