import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus, X } from 'lucide-react'
import { db, type Exercise, type SessionEntry, type SetEntry } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { estimate1RM, hitAllTargets, sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDateTime, formatDuration, formatWeight } from '../lib/format'
import { closePad, openPad } from '../lib/pad'
import { ExercisePicker } from '../components/ExercisePicker'
import { ReadinessCard } from '../components/Readiness'
import { groupEntries } from '../lib/superset'

export function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()
  const exercises = useExerciseMap()
  const session = useLiveQuery(() => db.sessions.get(Number(id)), [id])
  const [notes, setNotes] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)

  if (session === undefined) return null
  if (!session) return <div className="empty">Workout not found.</div>

  const sid = session.id!
  const save = (entries: SessionEntry[]) => db.sessions.update(sid, { entries })
  const step = unit === 'kg' ? 2.5 : 5

  function updateSet(ei: number, si: number, patch: Partial<SetEntry>) {
    void save(session!.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e)))
  }
  function addSet(ei: number) {
    const e = session!.entries[ei]
    const last = e.sets[e.sets.length - 1]
    const next: SetEntry = last ? { ...last, done: true } : { reps: 8, weight: 0, done: true, kind: 'work' }
    void save(session!.entries.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, next] } : x)))
  }
  function removeSet(ei: number, si: number) {
    const entries = session!.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)).filter((e) => e.sets.length > 0)
    void save(entries)
  }
  function removeExercise(ei: number) {
    void save(session!.entries.filter((_, i) => i !== ei))
  }
  function addExercise(ex: Exercise) {
    void save([...session!.entries, { exerciseId: ex.id!, restSec: 90, increment: step, sets: [{ reps: 8, weight: 0, done: true, kind: 'work' }] }])
    setPicking(false)
  }
  async function remove() {
    if (!confirm('Delete this workout from history?')) return
    await db.sessions.delete(sid)
    navigate('/history', { replace: true })
  }

  const duration = session.finishedAt ? session.finishedAt - session.startedAt : 0
  const blocks = groupEntries(session.entries)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{session.name}</h1>
          <span className="muted small">{formatDateTime(session.startedAt)}</span>
        </div>
        <div className="row">
          <button type="button" className={`btn btn--sm${editing ? ' btn--primary' : ''}`} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit'}
          </button>
          {!editing ? (
            <Link to="/history" className="btn btn--ghost btn--sm">
              Back
            </Link>
          ) : null}
        </div>
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
            <div className="stat__label">kcal</div>
          </div>
        </div>
      ) : null}

      {session.readiness ? <ReadinessCard readiness={session.readiness} title="Readiness at the start" /> : null}

      {blocks.map((block) => (
        <div className="card" key={block.indices.join('-')}>
          {block.group ? <div className="section--eyebrow section">Superset</div> : null}
          {block.indices.map((ei) => {
            const e = session.entries[ei]
            const best = e.sets.reduce((b, s) => Math.max(b, estimate1RM(s.weight, s.reps)), 0)
            const hit = e.sets.some((s) => s.targetReps !== undefined) ? hitAllTargets(e.sets) : null
            return (
              <div key={ei} style={{ marginBottom: block.indices.length > 1 ? 16 : 0 }}>
                <div className="row row--between">
                  <h3 style={{ margin: 0 }}>
                    <Link to={`/exercises/${e.exerciseId}`}>{exercises?.get(e.exerciseId)?.name ?? 'Exercise'}</Link>
                    {e.note ? <span className="muted small" style={{ display: 'block', fontWeight: 400 }}>{e.note}</span> : null}
                  </h3>
                  {editing ? (
                    <button type="button" className="btn btn--icon" onClick={() => removeExercise(ei)} aria-label="Remove exercise">
                      <X size={16} />
                    </button>
                  ) : hit === true ? (
                    <span className="pill pill--good">Targets hit</span>
                  ) : hit === false ? (
                    <span className="pill pill--warn">Repeat next time</span>
                  ) : null}
                </div>
                <ul className="list" style={{ marginTop: 8 }}>
                  {e.sets.map((s, j) => (
                    <li key={j} className="row row--between small">
                      <span className="muted">{s.kind === 'warmup' ? `W` : `Set ${j + 1}`}</span>
                      {editing ? (
                        <span className="row" style={{ gap: 6 }}>
                          <button
                            type="button"
                            className="setgrid__val"
                            style={{ minWidth: 64 }}
                            onClick={() =>
                              openPad({ value: s.weight, label: `Set ${j + 1} · ${unit}`, unit, step, allowDecimal: true, onChange: (weight) => updateSet(ei, j, { weight }), primary: { label: 'Done', onPress: closePad } })
                            }
                          >
                            {s.weight}
                          </button>
                          <button
                            type="button"
                            className="setgrid__val"
                            style={{ minWidth: 52 }}
                            onClick={() => openPad({ value: s.reps, label: `Set ${j + 1} · reps`, step: 1, allowDecimal: false, onChange: (reps) => updateSet(ei, j, { reps }), primary: { label: 'Done', onPress: closePad } })}
                          >
                            {s.reps}
                          </button>
                          <button type="button" className="btn btn--icon" onClick={() => removeSet(ei, j)} aria-label={`Remove set ${j + 1}`}>
                            <X size={14} />
                          </button>
                        </span>
                      ) : (
                        <span className="mono">
                          {s.reps} × {formatWeight(s.weight, unit)}
                          {s.targetReps !== undefined && s.reps < s.targetReps ? <span className="muted"> (target {s.targetReps})</span> : null}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {editing ? (
                  <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 6 }} onClick={() => addSet(ei)}>
                    <Plus size={14} /> Add set
                  </button>
                ) : best > 0 ? (
                  <div className="muted small" style={{ marginTop: 6 }}>
                    Est. 1RM {formatWeight(Math.round(best), unit)}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}

      {editing ? (
        <button type="button" className="btn btn--block" onClick={() => setPicking(true)}>
          <Plus size={16} /> Add exercise
        </button>
      ) : null}

      <div className="card">
        <label className="field">
          <span>Notes</span>
          <textarea value={notes ?? session.notes ?? ''} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== null && db.sessions.update(sid, { notes })} placeholder="How did it go?" />
        </label>
      </div>
      {editing ? (
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => setEditing(false)}>
            <Check size={16} /> Done editing
          </button>
          <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
            Delete workout
          </button>
        </div>
      ) : null}
      {picking ? <ExercisePicker onPick={addExercise} onClose={() => setPicking(false)} /> : null}
    </div>
  )
}
