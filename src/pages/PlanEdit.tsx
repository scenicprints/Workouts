import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Plan } from '../db'
import { NumberField } from '../components/NumberField'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function blankPlan(): Plan {
  return {
    name: '',
    weeks: 8,
    deloadEvery: 4,
    active: true,
    createdAt: Date.now(),
    days: [
      { label: 'Mon', routineId: null },
      { label: 'Wed', routineId: null },
      { label: 'Fri', routineId: null },
    ],
  }
}

export function PlanEdit() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => (id ? ((await db.plans.get(Number(id))) ?? null) : blankPlan()), [id])
  if (loaded === undefined) return null
  if (loaded === null) return <div className="empty">Plan not found.</div>
  return <PlanEditor key={loaded.id ?? 'new'} initial={loaded} />
}

function PlanEditor({ initial }: { initial: Plan }) {
  const navigate = useNavigate()
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? []
  const [plan, setPlan] = useState<Plan>(initial)

  async function save() {
    const name = plan.name.trim() || 'Untitled plan'
    let savedId = plan.id
    await db.transaction('rw', db.plans, async () => {
      if (plan.active) {
        const others = await db.plans.filter((p) => p.active && p.id !== plan.id).toArray()
        for (const o of others) await db.plans.update(o.id!, { active: false })
      }
      if (plan.id) {
        await db.plans.update(plan.id, { name, weeks: plan.weeks, days: plan.days, deloadEvery: plan.deloadEvery, active: plan.active, notes: plan.notes })
      } else {
        savedId = (await db.plans.add({ ...plan, name })) as number
      }
    })
    navigate(`/plans/${savedId}`, { replace: true })
  }

  const patchDay = (i: number, patch: Partial<Plan['days'][number]>) => setPlan({ ...plan, days: plan.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) })

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{plan.id ? 'Edit plan' : 'New plan'}</h1>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>
            Save
          </button>
        </div>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder="e.g. 8-week strength block" autoFocus={!plan.id} />
      </label>
      <div className="row">
        <NumberField label="Weeks" value={plan.weeks} onChange={(weeks) => setPlan({ ...plan, weeks: Math.max(1, weeks) })} min={1} compact />
        <NumberField label="Deload every N weeks (0 = never)" value={plan.deloadEvery} onChange={(deloadEvery) => setPlan({ ...plan, deloadEvery })} min={0} compact />
      </div>
      <label className="check">
        <input type="checkbox" checked={plan.active} onChange={(e) => setPlan({ ...plan, active: e.target.checked })} />
        <span>Active plan (shown on Home; only one plan can be active)</span>
      </label>

      <div className="card">
        <div className="card__title">Weekly schedule</div>
        {routines.length === 0 ? (
          <p className="muted small">
            You need at least one routine first. <Link to="/routines/new">Create a routine</Link>.
          </p>
        ) : null}
        <div className="stack">
          {plan.days.map((d, i) => (
            <div className="row" key={i}>
              <select value={d.label} onChange={(e) => patchDay(i, { label: e.target.value })} aria-label="Day label" style={{ width: 90 }}>
                {DAY_NAMES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
                {!DAY_NAMES.includes(d.label) ? <option>{d.label}</option> : null}
              </select>
              <select className="grow" value={d.routineId ?? ''} onChange={(e) => patchDay(i, { routineId: e.target.value ? Number(e.target.value) : null })} aria-label="Routine">
                <option value="">Rest</option>
                {routines.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => setPlan({ ...plan, days: plan.days.filter((_, j) => j !== i) })} aria-label="Remove day" disabled={plan.days.length <= 1}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlan({ ...plan, days: [...plan.days, { label: DAY_NAMES[plan.days.length % 7], routineId: null }] })} disabled={plan.days.length >= 7}>
            + Add day
          </button>
        </div>
      </div>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea value={plan.notes ?? ''} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
      </label>
      <p className="muted small">The plan advances one day each time you finish a workout (or mark a rest day done), so missing a calendar day never breaks it.</p>
    </div>
  )
}
