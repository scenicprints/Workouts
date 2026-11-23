import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { generateProgram, toPlanDays, type GeneratedProgram, type Goal, type SessionLength } from '../lib/generator'
import { NumberField } from '../components/NumberField'

const GOALS: { id: Goal; label: string; blurb: string }[] = [
  { id: 'strength', label: 'Strength', blurb: 'Heavy compounds, 5s and 6s, long rests.' },
  { id: 'size', label: 'Muscle size', blurb: '8 to 12 reps, more volume, accessories.' },
  { id: 'general', label: 'General fitness', blurb: 'Balanced full-body work, moderate everything.' },
  { id: 'conditioning', label: 'Conditioning', blurb: 'Higher reps, short rests, finishers.' },
]
const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Kettlebell', 'Bodyweight']

export function Generate() {
  const navigate = useNavigate()
  const unit = useUnit()
  const exercises = useExerciseMap()
  const library = useLiveQuery(() => db.exercises.toArray(), []) ?? []
  const [goal, setGoal] = useState<Goal>('strength')
  const [days, setDays] = useState(5)
  const [length, setLength] = useState<SessionLength>('medium')
  const [weeks, setWeeks] = useState(8)
  const [deload, setDeload] = useState(true)
  const [exclude, setExclude] = useState<string[]>([])
  const [preview, setPreview] = useState<GeneratedProgram | null>(null)

  function build() {
    setPreview(generateProgram({ goal, days, length, weeks, deload, unit, exclude }, library))
  }

  async function save() {
    if (!preview) return
    const now = Date.now()
    const planId = await db.transaction('rw', [db.routines, db.plans], async () => {
      const ids: number[] = []
      for (const r of preview.routines) ids.push((await db.routines.add({ ...r, name: r.name })) as number)
      const others = await db.plans.filter((p) => p.active).toArray()
      for (const o of others) await db.plans.update(o.id!, { active: false })
      return (await db.plans.add({ name: preview.name, notes: preview.notes, weeks: preview.weeks, days: toPlanDays(preview, ids), deloadEvery: preview.deloadEvery, active: true, cursor: 0, createdAt: now })) as number
    })
    navigate(`/plans/${planId}`, { replace: true })
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Generate a program</h1>
      </div>

      <div className="card">
        <div className="card__title">Goal</div>
        <div className="stack" style={{ gap: 6 }}>
          {GOALS.map((g) => (
            <button key={g.id} type="button" className={`list__item${goal === g.id ? ' list__item--hi' : ''}`} aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
              <span className="list__title">{g.label}</span>
              <span className="list__meta">{g.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card__title">Schedule</div>
        <div className="row">
          <NumberField label="Days per week" value={days} onChange={(v) => setDays(Math.max(2, Math.min(6, v)))} min={2} compact integer />
          <NumberField label="Weeks" value={weeks} onChange={(v) => setWeeks(Math.max(2, Math.min(16, v)))} min={2} compact integer />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <span>Session length</span>
          <div className="segmented">
            {(['short', 'medium', 'long'] as SessionLength[]).map((l) => (
              <button key={l} type="button" aria-pressed={length === l} onClick={() => setLength(l)}>
                {l === 'short' ? 'Short · 4 lifts' : l === 'medium' ? 'Medium · 6' : 'Long · 8'}
              </button>
            ))}
          </div>
        </div>
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={deload} onChange={(e) => setDeload(e.target.checked)} />
          <span>Include deload weeks (90% loads every 3rd or 4th week)</span>
        </label>
      </div>

      <div className="card">
        <div className="card__title">Equipment to skip</div>
        <div className="row">
          {EQUIPMENT.map((e) => (
            <button key={e} type="button" className={`pill${exclude.includes(e) ? ' pill--warn' : ''}`} style={{ border: 0, cursor: 'pointer', padding: '6px 10px' }} aria-pressed={exclude.includes(e)} onClick={() => setExclude((x) => (x.includes(e) ? x.filter((y) => y !== e) : [...x, e]))}>
              {exclude.includes(e) ? `No ${e}` : e}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Full gym by default. Tap anything you do not have.</p>
      </div>

      <button type="button" className="btn btn--primary btn--block btn--lg" onClick={build}>
        {preview ? 'Regenerate' : 'Build program'}
      </button>

      {preview ? (
        <>
          <div className="card card--accent">
            <div className="card__title">{preview.name}</div>
            <p className="muted small">{preview.notes}</p>
            <p className="small">
              {preview.days.map((d) => `${d.label}: ${d.routine === null ? 'Rest' : preview.routines[d.routine].name}`).join(' · ')}
            </p>
            <button type="button" className="btn btn--primary btn--block" onClick={save}>
              Save and make it my active plan
            </button>
          </div>
          {preview.routines.map((r) => (
            <div className="card" key={r.name}>
              <div className="card__title">{r.name}</div>
              <ul className="list" style={{ gap: 4 }}>
                {r.items.map((it, i) => (
                  <li key={i} className="row row--between small">
                    <span>{exercises?.get(it.exerciseId)?.name ?? '…'}</span>
                    <span className="muted mono">
                      {it.sets}×{it.reps} · {it.restSec}s
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}
    </div>
  )
}
