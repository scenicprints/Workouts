import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useUnit } from '../hooks/useSettings'
import { estimate1RM } from '../lib/progression'
import { cleanLimits, learnStep, loggedWeights } from '../lib/loadStep'
import { formatDate, formatWeight } from '../lib/format'
import { LineChart } from '../components/Charts'
import { EquipmentSheet } from '../components/EquipmentSheet'

export function ExerciseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()
  const exercise = useLiveQuery(() => db.exercises.get(Number(id)), [id])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [equip, setEquip] = useState(false)
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
  const step = useLiveQuery(async () => learnStep(loggedWeights(await db.sessions.toArray(), Number(id)), unit), [id, unit])
  const gear = useLiveQuery(async () => {
    const ex = await db.exercises.get(Number(id))
    return ex?.gearId ? ((await db.gear.get(ex.gearId)) ?? null) : null
  }, [id])

  if (exercise === undefined) return null
  if (!exercise) return <div className="empty">Exercise not found.</div>

  const limits = cleanLimits(gear ?? undefined)
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
        <button type="button" className="stat" style={{ cursor: 'pointer', textAlign: 'inherit', font: 'inherit', color: 'inherit' }} onClick={() => setEquip(true)} title={gear ? `On ${gear.name}. Tap to change the equipment.` : step ? 'Learned from the weights you have logged. Tap to link this exercise to a piece of equipment.' : 'Log two different weights and the app learns what this equipment moves in, or tap to link it to a piece of equipment.'}>
          <div className="stat__value">{limits.step ? formatWeight(limits.step, unit) : step ? formatWeight(step.step, unit) : '—'}</div>
          <div className="stat__label">{gear ? gear.name : 'step (learned)'}</div>
        </button>
      </div>
      {gear ? (
        <p className="muted small" style={{ margin: 0 }}>
          {gear.name}: {limits.step ? `${formatWeight(limits.step, unit)} steps` : 'step learned from the log'}, {limits.min !== undefined ? `from ${formatWeight(limits.min, unit)}` : 'no minimum'}, {limits.max !== undefined ? `up to ${formatWeight(limits.max, unit)}` : 'no maximum'}.
        </p>
      ) : null}
      {equip ? <EquipmentSheet exercise={exercise} unit={unit} onClose={() => setEquip(false)} /> : null}
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
