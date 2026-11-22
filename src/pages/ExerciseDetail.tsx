import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useUnit } from '../hooks/useSettings'
import { estimate1RM } from '../lib/progression'
import { formatDate, formatWeight } from '../lib/format'

export function ExerciseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()
  const exercise = useLiveQuery(() => db.exercises.get(Number(id)), [id])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const points = useLiveQuery(async () => {
    const sessions = await db.sessions.filter((s) => !!s.finishedAt).sortBy('finishedAt')
    const out: { ts: number; best: number; e1rm: number; sets: number; sessionId: number }[] = []
    for (const s of sessions) {
      const entry = s.entries.find((e) => e.exerciseId === Number(id))
      if (!entry || entry.sets.length === 0) continue
      const best = Math.max(...entry.sets.map((x) => x.weight))
      const e1rm = Math.max(...entry.sets.map((x) => estimate1RM(x.weight, x.reps)))
      out.push({ ts: s.finishedAt!, best, e1rm, sets: entry.sets.length, sessionId: s.id! })
    }
    return out
  }, [id])

  if (exercise === undefined) return null
  if (!exercise) return <div className="empty">Exercise not found.</div>

  const pr = points?.reduce((b, p) => Math.max(b, p.best), 0) ?? 0
  const bestE1rm = points?.reduce((b, p) => Math.max(b, p.e1rm), 0) ?? 0

  async function rename() {
    const n = name.trim()
    if (n) await db.exercises.update(exercise!.id!, { name: n })
    setEditing(false)
  }
  async function remove() {
    const used = await db.routines.filter((r) => r.items.some((i) => i.exerciseId === exercise!.id)).count()
    if (used > 0) {
      alert(`This exercise is used in ${used} routine${used === 1 ? '' : 's'}. Remove it from those first.`)
      return
    }
    if (!confirm('Delete this exercise? History that references it will show "Exercise".')) return
    await db.exercises.delete(exercise!.id!)
    navigate('/library/exercises', { replace: true })
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          {editing ? (
            <div className="row">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Exercise name" />
              <button type="button" className="btn btn--sm btn--primary" onClick={rename}>
                Save
              </button>
            </div>
          ) : (
            <h1>{exercise.name}</h1>
          )}
          <span className="muted small">
            {exercise.muscle} · {exercise.equipment}
          </span>
        </div>
        <Link to="/library/exercises" className="btn btn--ghost btn--sm">
          Back
        </Link>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="stat__value">{pr ? formatWeight(pr, unit) : '—'}</div>
          <div className="stat__label">heaviest set</div>
        </div>
        <div className="stat">
          <div className="stat__value">{bestE1rm ? formatWeight(Math.round(bestE1rm), unit) : '—'}</div>
          <div className="stat__label">best est. 1RM</div>
        </div>
        <div className="stat">
          <div className="stat__value">{points?.length ?? 0}</div>
          <div className="stat__label">sessions</div>
        </div>
      </div>
      {points && points.length >= 2 ? (
        <div className="card">
          <div className="card__title">Estimated 1RM over time</div>
          <LineChart points={points.map((p) => ({ x: p.ts, y: p.e1rm }))} />
        </div>
      ) : null}
      {points && points.length > 0 ? (
        <div className="card">
          <div className="card__title">Log</div>
          <ul className="list" style={{ gap: 4 }}>
            {[...points].reverse().map((p) => (
              <li key={p.sessionId} className="row row--between small">
                <Link to={`/history/${p.sessionId}`}>{formatDate(p.ts)}</Link>
                <span className="mono">
                  {p.sets} sets · top {formatWeight(p.best, unit)} · e1RM {formatWeight(Math.round(p.e1rm), unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="empty">No logged sets yet.</div>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setName(exercise.name)
            setEditing(true)
          }}
        >
          Rename
        </button>
        {exercise.custom ? (
          <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function LineChart({ points }: { points: { x: number; y: number }[] }) {
  const w = 320
  const h = 160
  const pad = { l: 36, r: 8, t: 8, b: 20 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.floor(Math.min(...ys) * 0.95)
  const maxY = Math.ceil(Math.max(...ys) * 1.05)
  const sx = (x: number) => pad.l + ((x - minX) / Math.max(maxX - minX, 1)) * (w - pad.l - pad.r)
  const sy = (y: number) => h - pad.b - ((y - minY) / Math.max(maxY - minY, 1)) * (h - pad.t - pad.b)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const ticks = [minY, (minY + maxY) / 2, maxY]
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Progress chart">
      {ticks.map((t) => (
        <g key={t}>
          <line className="chart__grid" x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} />
          <text className="chart__label" x={pad.l - 4} y={sy(t) + 3} textAnchor="end">
            {Math.round(t)}
          </text>
        </g>
      ))}
      <path className="chart__line" d={d} />
      {points.map((p, i) => (
        <circle key={i} className="chart__dot" cx={sx(p.x)} cy={sy(p.y)} r={3} />
      ))}
      <text className="chart__label" x={pad.l} y={h - 6}>
        {formatDate(minX)}
      </text>
      <text className="chart__label" x={w - pad.r} y={h - 6} textAnchor="end">
        {formatDate(maxX)}
      </text>
    </svg>
  )
}
