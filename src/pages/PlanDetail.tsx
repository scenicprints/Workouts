import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useUnit } from '../hooks/useSettings'
import { planPosition } from '../lib/progression'
import { jumpPlanTo, skipPlanDay, startRoutineSession } from '../lib/sessions'
import { formatDate } from '../lib/format'
import { canFlag, healthFlags } from '../lib/flags'

export function PlanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()
  const plan = useLiveQuery(() => db.plans.get(Number(id)), [id])
  const routines = useLiveQuery(() => db.routines.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('planId').equals(Number(id)).filter((s) => !!s.finishedAt).sortBy('finishedAt'), [id]) ?? []
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  const health = useLiveQuery(async () => {
    const now = Date.now()
    const [daily, body] = await Promise.all([db.daily.where('date').above(now - 29 * 86400000).toArray(), db.body.where('date').above(now - 15 * 86400000).toArray()])
    return { enough: canFlag(daily, body, now), flags: healthFlags(daily, body, unit, now) }
  }, [unit])

  if (plan === undefined) return null
  if (!plan) return <div className="empty">Plan not found.</div>

  const pos = planPosition(plan, plan.cursor)
  const perWeek = plan.days.length
  const total = perWeek * plan.weeks
  const routineName = (rid: number | null) => (rid ? (routines.find((r) => r.id === rid)?.name ?? '?') : 'Rest')
  const nextDay = pos.complete ? null : plan.days[pos.day - 1]
  const nextRoutine = nextDay?.routineId ? routines.find((r) => r.id === nextDay.routineId) : undefined

  async function activate() {
    await db.transaction('rw', db.plans, async () => {
      const others = await db.plans.filter((p) => p.active).toArray()
      for (const o of others) await db.plans.update(o.id!, { active: false })
      await db.plans.update(plan!.id!, { active: true })
    })
  }
  async function restart() {
    if (!confirm('Restart this plan from week 1? Workout history is kept.')) return
    await db.plans.update(plan!.id!, { cursor: 0, startedAt: undefined })
  }
  async function remove() {
    if (!confirm('Delete this plan? Workout history is kept.')) return
    await db.plans.delete(plan!.id!)
    navigate('/library/plans', { replace: true })
  }
  async function jump(index: number) {
    if (index === plan!.cursor) return
    const week = Math.floor(index / perWeek) + 1
    const day = plan!.days[index % perWeek]
    if (!confirm(`Move the plan to week ${week}, ${day.label} (${routineName(day.routineId)})?`)) return
    await jumpPlanTo(plan!, index)
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{plan.name}</h1>
          <span className="muted small">
            {plan.weeks} weeks · {perWeek} days/week{plan.deloadEvery ? ` · deload every ${plan.deloadEvery} weeks${plan.deloadDropSet ? ', one set fewer' : ''}` : ''}
            {plan.startedAt ? ` · started ${formatDate(plan.startedAt)}` : ''}
          </span>
        </div>
        <Link to={`/plans/${plan.id}/edit`} className="btn btn--ghost btn--sm">
          Edit
        </Link>
      </div>

      <div className={`card${plan.active ? ' card--accent' : ''}`}>
        {pos.complete ? (
          <>
            <div className="card__title">Plan complete</div>
            <p className="muted small">{sessions.length} sessions logged. Restart it, extend it in Edit, or generate the next block.</p>
          </>
        ) : (
          <>
            <div className="row row--between">
              <div className="card__title">
                Next: Week {pos.week}, {nextDay?.label}
              </div>
              {pos.isDeload ? <span className="pill pill--warn">Deload</span> : null}
            </div>
            <p className="muted small">
              {routineName(nextDay?.routineId ?? null)} · day {plan.cursor + 1} of {total}
            </p>
            <div className="progress" style={{ marginBottom: 10 }}>
              <div style={{ width: `${(plan.cursor / Math.max(total, 1)) * 100}%` }} />
            </div>
            <div className="row">
              {!plan.active ? (
                <button type="button" className="btn btn--primary grow" onClick={activate}>
                  Make this the active plan
                </button>
              ) : active ? (
                <Link to="/workout" className="btn grow">
                  Workout in progress
                </Link>
              ) : nextRoutine ? (
                <button
                  type="button"
                  className="btn btn--primary grow"
                  onClick={async () => {
                    await startRoutineSession(nextRoutine, { plan, unit })
                    navigate('/workout')
                  }}
                >
                  Start {nextRoutine.name}
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={() => skipPlanDay(plan)}>
                Skip day
              </button>
            </div>
          </>
        )}
      </div>

      {health?.enough ? (
        <div className="card">
          <div className="row row--between">
            <div className="card__title">Health this week</div>
            <span className="muted small">from Health Connect</span>
          </div>
          {health.flags.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>No flags. Resting heart rate, sleep and bodyweight are all in their lanes.</p>
          ) : (
            <ul className="list">
              {health.flags.map((f) => (
                <li key={f.key} className="list__item" style={{ display: 'block' }}>
                  <div className="row row--between">
                    <span className="list__title">{f.title}</span>
                    <span className={`pill ${f.level === 'bad' ? 'pill--warn' : ''}`}>{f.level === 'bad' ? 'Act' : 'Watch'}</span>
                  </div>
                  <div className="muted small">{f.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="card">
        <div className="row row--between">
          <div className="card__title">Schedule</div>
          <span className="muted small">tap a day to jump there</span>
        </div>
        <div className="plan-grid" style={{ ['--days' as string]: perWeek }}>
          <div className="plan-grid__cell plan-grid__cell--head" />
          {plan.days.map((d, i) => (
            <div key={i} className="plan-grid__cell plan-grid__cell--head">
              {d.label}
            </div>
          ))}
          {Array.from({ length: plan.weeks }, (_, w) => (
            <WeekRow key={w} week={w + 1} plan={plan} cursor={plan.cursor} routineName={routineName} onJump={jump} />
          ))}
        </div>
      </div>

      {plan.notes ? (
        <div className="card">
          <div className="card__title">Notes</div>
          <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
            {plan.notes}
          </p>
        </div>
      ) : null}

      <div className="row">
        <button type="button" className="btn btn--ghost" onClick={restart} disabled={plan.cursor === 0}>
          Restart plan
        </button>
        <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
          Delete plan
        </button>
      </div>
    </div>
  )
}

function WeekRow({ week, plan, cursor, routineName, onJump }: { week: number; plan: { days: { label: string; routineId: number | null }[]; deloadEvery: number }; cursor: number; routineName: (id: number | null) => string; onJump: (index: number) => void }) {
  const perWeek = plan.days.length
  const isDeload = plan.deloadEvery > 0 && week % plan.deloadEvery === 0
  return (
    <>
      <div className="plan-grid__cell plan-grid__cell--head" title={isDeload ? 'Deload week' : undefined}>
        W{week}
        {isDeload ? '↓' : ''}
      </div>
      {plan.days.map((d, i) => {
        const idx = (week - 1) * perWeek + i
        const cls = ['plan-grid__cell', 'plan-grid__cell--tap']
        if (idx < cursor) cls.push('plan-grid__cell--done')
        else if (idx === cursor) cls.push('plan-grid__cell--next')
        if (!d.routineId) cls.push('plan-grid__cell--rest')
        return (
          <button type="button" key={i} className={cls.join(' ')} title={routineName(d.routineId)} onClick={() => onJump(idx)}>
            {routineName(d.routineId)}
          </button>
        )
      })}
    </>
  )
}
