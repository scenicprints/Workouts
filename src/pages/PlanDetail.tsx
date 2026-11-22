import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useUnit } from '../hooks/useSettings'
import { planPosition } from '../lib/progression'
import { skipPlanDay, startRoutineSession } from '../lib/sessions'
import { formatDate } from '../lib/format'

export function PlanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()
  const plan = useLiveQuery(() => db.plans.get(Number(id)), [id])
  const routines = useLiveQuery(() => db.routines.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('planId').equals(Number(id)).filter((s) => !!s.finishedAt).sortBy('finishedAt'), [id]) ?? []
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])

  if (plan === undefined) return null
  if (!plan) return <div className="empty">Plan not found.</div>

  const pos = planPosition(plan, sessions.length)
  const perWeek = plan.days.length
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
    if (!confirm('Restart this plan from week 1? Finished workouts stay in history but no longer count toward the plan.')) return
    await db.transaction('rw', [db.sessions, db.plans], async () => {
      const list = await db.sessions.where('planId').equals(plan!.id!).toArray()
      for (const s of list) await db.sessions.update(s.id!, { planId: undefined, planWeek: undefined, planDay: undefined })
      await db.plans.update(plan!.id!, { startedAt: undefined })
    })
  }
  async function remove() {
    if (!confirm('Delete this plan? Workout history is kept.')) return
    await db.plans.delete(plan!.id!)
    navigate('/library/plans', { replace: true })
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{plan.name}</h1>
          <span className="muted small">
            {plan.weeks} weeks · {perWeek} days/week{plan.deloadEvery ? ` · deload every ${plan.deloadEvery} weeks` : ''}
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
            <p className="muted small">{sessions.length} sessions done. Restart it or build the next block.</p>
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
              {routineName(nextDay?.routineId ?? null)} · {sessions.length}/{perWeek * plan.weeks} done
            </p>
            <div className="progress" style={{ marginBottom: 10 }}>
              <div style={{ width: `${(sessions.length / Math.max(perWeek * plan.weeks, 1)) * 100}%` }} />
            </div>
            {!plan.active ? (
              <button type="button" className="btn btn--primary btn--block" onClick={activate}>
                Make this the active plan
              </button>
            ) : active ? (
              <Link to="/workout" className="btn btn--block">
                Workout in progress
              </Link>
            ) : nextRoutine ? (
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={async () => {
                  await startRoutineSession(nextRoutine, { plan, unit })
                  navigate('/workout')
                }}
              >
                Start {nextRoutine.name}
              </button>
            ) : (
              <button type="button" className="btn btn--block" onClick={() => skipPlanDay(plan, pos.week, pos.day, nextDay?.label ?? 'Rest')}>
                Mark rest day done
              </button>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="card__title">Schedule</div>
        <div className="plan-grid" style={{ ['--days' as string]: perWeek }}>
          <div className="plan-grid__cell plan-grid__cell--head" />
          {plan.days.map((d, i) => (
            <div key={i} className="plan-grid__cell plan-grid__cell--head">
              {d.label}
            </div>
          ))}
          {Array.from({ length: plan.weeks }, (_, w) => (
            <WeekRow key={w} week={w + 1} plan={plan} doneCount={sessions.length} routineName={routineName} />
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
        <button type="button" className="btn btn--ghost" onClick={restart} disabled={sessions.length === 0}>
          Restart plan
        </button>
        <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
          Delete plan
        </button>
      </div>
    </div>
  )
}

function WeekRow({ week, plan, doneCount, routineName }: { week: number; plan: { days: { label: string; routineId: number | null }[]; deloadEvery: number }; doneCount: number; routineName: (id: number | null) => string }) {
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
        const cls = ['plan-grid__cell']
        if (idx < doneCount) cls.push('plan-grid__cell--done')
        else if (idx === doneCount) cls.push('plan-grid__cell--next')
        if (!d.routineId) cls.push('plan-grid__cell--rest')
        return (
          <div key={i} className={cls.join(' ')} title={routineName(d.routineId)}>
            {routineName(d.routineId)}
          </div>
        )
      })}
    </>
  )
}
