import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useUnit } from '../hooks/useSettings'
import { nextPlanWorkout, startEmptySession, startRoutineSession, skipPlanDay } from '../lib/sessions'
import { sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDuration, formatWeight, relativeDay, weeklyStreak } from '../lib/format'

export function Home() {
  const navigate = useNavigate()
  const unit = useUnit()
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  const next = useLiveQuery(() => nextPlanWorkout(), [])
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? []
  const recent = useLiveQuery(
    () => db.sessions.orderBy('finishedAt').reverse().filter((s) => !!s.finishedAt && s.entries.length > 0).limit(5).toArray(),
    [],
  ) ?? []
  const stats = useLiveQuery(async () => {
    const all = await db.sessions.filter((s) => !!s.finishedAt && s.entries.length > 0).toArray()
    const weekAgo = Date.now() - 7 * 86400000
    const thisWeek = all.filter((s) => (s.finishedAt ?? 0) >= weekAgo)
    return {
      week: thisWeek.length,
      volume: thisWeek.reduce((a, s) => a + sessionVolume(s), 0),
      streak: weeklyStreak(all.map((s) => s.finishedAt!)),
    }
  }, [])

  const [now] = useState(() => Date.now())
  function go(_sessionId: number) {
    navigate('/workout')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Workouts</h1>
        <span className="muted small">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </div>

      {active ? (
        <div className="card card--accent">
          <div className="card__title">Workout in progress</div>
          <p className="muted">{active.name} · started {formatDuration(now - active.startedAt)} ago</p>
          <Link className="btn btn--primary btn--block" to="/workout">
            Continue
          </Link>
        </div>
      ) : next && !next.complete ? (
        <div className="card card--accent">
          <div className="row row--between">
            <div className="card__title">{next.plan.name}</div>
            <span className="pill pill--accent">
              Week {next.week} · Day {next.day}
            </span>
          </div>
          <p>
            <strong>{next.label}</strong>
            {next.routine ? <span className="muted"> · {next.routine.name}</span> : <span className="muted"> · Rest day</span>}
            {next.isDeload ? <span className="pill pill--warn" style={{ marginLeft: 8 }}>Deload</span> : null}
          </p>
          <div className="progress" style={{ marginBottom: 10 }}>
            <div style={{ width: `${(next.finished / Math.max(next.total, 1)) * 100}%` }} />
          </div>
          {next.routine ? (
            <button
              type="button"
              className="btn btn--primary btn--block btn--lg"
              onClick={async () => go(await startRoutineSession(next.routine!, { plan: next.plan, unit }))}
            >
              Start {next.routine.name}
            </button>
          ) : (
            <button type="button" className="btn btn--block" onClick={() => skipPlanDay(next.plan, next.week, next.day, next.label)}>
              Mark rest day done
            </button>
          )}
        </div>
      ) : next?.complete ? (
        <div className="card card--accent">
          <div className="card__title">{next.plan.name} complete</div>
          <p className="muted">Every week is done. Edit the plan to extend it, or start a new one.</p>
          <Link className="btn" to={`/plans/${next.plan.id}`}>
            View plan
          </Link>
        </div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="stat__value">{stats?.week ?? 0}</div>
          <div className="stat__label">sessions this week</div>
        </div>
        <div className="stat">
          <div className="stat__value">{Math.round(stats?.volume ?? 0).toLocaleString()}</div>
          <div className="stat__label">{unit} lifted this week</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats?.streak ?? 0}</div>
          <div className="stat__label">week streak</div>
        </div>
      </div>

      {!active ? (
        <div className="card">
          <div className="card__title">Quick start</div>
          <div className="stack">
            {routines.slice(0, 4).map((r) => (
              <button key={r.id} type="button" className="btn" onClick={async () => go(await startRoutineSession(r, { unit }))}>
                {r.name}
              </button>
            ))}
            <button type="button" className="btn btn--ghost" onClick={async () => go(await startEmptySession())}>
              Empty workout
            </button>
            {routines.length === 0 ? (
              <p className="muted small center">
                No routines yet. <Link to="/routines/new">Build one</Link> to get targets and rest timers.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="row row--between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Recent</h2>
          <Link to="/history" className="small">
            All history
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty">Your finished workouts will show up here.</div>
        ) : (
          <ul className="list">
            {recent.map((s) => (
              <li key={s.id}>
                <Link className="list__item" to={`/history/${s.id}`}>
                  <span className="list__title">{s.name}</span>
                  <span className="list__meta">
                    {relativeDay(s.finishedAt!)} · {sessionSetCount(s)} sets · {formatWeight(Math.round(sessionVolume(s)), unit)} · {formatDuration(s.finishedAt! - s.startedAt)}
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
