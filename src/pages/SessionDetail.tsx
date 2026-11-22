import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { estimate1RM, hitAllTargets, sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDateTime, formatDuration, formatWeight } from '../lib/format'

export function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()
  const exercises = useExerciseMap()
  const session = useLiveQuery(() => db.sessions.get(Number(id)), [id])
  const [notes, setNotes] = useState<string | null>(null)

  if (session === undefined) return null
  if (!session) return <div className="empty">Workout not found.</div>

  async function remove() {
    if (!confirm('Delete this workout from history?')) return
    await db.sessions.delete(session!.id!)
    navigate('/history', { replace: true })
  }

  const duration = session.finishedAt ? session.finishedAt - session.startedAt : 0
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{session.name}</h1>
          <span className="muted small">{formatDateTime(session.startedAt)}</span>
        </div>
        <Link to="/history" className="btn btn--ghost btn--sm">
          Back
        </Link>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="stat__value">{sessionSetCount(session)}</div>
          <div className="stat__label">sets</div>
        </div>
        <div className="stat">
          <div className="stat__value">{Math.round(sessionVolume(session)).toLocaleString()}</div>
          <div className="stat__label">{unit} volume</div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatDuration(duration)}</div>
          <div className="stat__label">duration</div>
        </div>
      </div>
      {session.hrAvg !== undefined || session.calories !== undefined ? (
        <div className="stats">
          <div className="stat">
            <div className="stat__value">{session.hrAvg !== undefined ? Math.round(session.hrAvg) : '—'}</div>
            <div className="stat__label">avg bpm</div>
          </div>
          <div className="stat">
            <div className="stat__value">{session.hrMax !== undefined ? Math.round(session.hrMax) : '—'}</div>
            <div className="stat__label">peak bpm</div>
          </div>
          <div className="stat">
            <div className="stat__value">{session.calories !== undefined ? Math.round(session.calories) : '—'}</div>
            <div className="stat__label">kcal from watch</div>
          </div>
        </div>
      ) : null}
      {session.entries.map((e, i) => {
        const best = e.sets.reduce((b, s) => Math.max(b, estimate1RM(s.weight, s.reps)), 0)
        const hit = e.sets.some((s) => s.targetReps !== undefined) ? hitAllTargets(e.sets) : null
        return (
          <div className="card" key={i}>
            <div className="row row--between">
              <h3 style={{ margin: 0 }}>
                <Link to={`/exercises/${e.exerciseId}`}>{exercises?.get(e.exerciseId)?.name ?? 'Exercise'}</Link>
              </h3>
              {hit === true ? <span className="pill pill--good">All targets hit</span> : hit === false ? <span className="pill pill--warn">Repeat next time</span> : null}
            </div>
            <ul className="list" style={{ marginTop: 8, gap: 4 }}>
              {e.sets.map((s, j) => (
                <li key={j} className="row row--between small">
                  <span className="muted">Set {j + 1}</span>
                  <span className="mono">
                    {s.reps} × {formatWeight(s.weight, unit)}
                    {s.targetReps !== undefined && s.reps < s.targetReps ? <span className="muted"> (target {s.targetReps})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {best > 0 ? <div className="muted small" style={{ marginTop: 6 }}>Est. 1RM {formatWeight(Math.round(best), unit)}</div> : null}
          </div>
        )
      })}
      <div className="card">
        <label className="field">
          <span>Notes</span>
          <textarea value={notes ?? session.notes ?? ''} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== null && db.sessions.update(session.id!, { notes })} placeholder="How did it go?" />
        </label>
      </div>
      <button type="button" className="btn btn--ghost btn--danger btn--block" onClick={remove}>
        Delete workout
      </button>
    </div>
  )
}
