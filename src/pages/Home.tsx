import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { nextPlanWorkout, skipPlanDay, startRoutineSession } from '../lib/sessions'
import { sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDuration, formatWeight, relativeDay, weeklyStreak } from '../lib/format'
import { recentPRs, weeklyStats } from '../lib/stats'
import { BarChart, LineChart } from '../components/Charts'

export function Home() {
  const navigate = useNavigate()
  const unit = useUnit()
  const exercises = useExerciseMap()
  const [now] = useState(() => Date.now())
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  const next = useLiveQuery(() => nextPlanWorkout(), [])
  const finished = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt && s.entries.length > 0).toArray(), [])
  const body = useLiveQuery(() => db.body.orderBy('date').toArray(), []) ?? []

  if (!finished || !exercises) return null

  const weekly = weeklyStats(finished, 8, now)
  const thisWeek = weekly[weekly.length - 1]
  const streak = weeklyStreak(finished.map((s) => s.finishedAt!), now)
  const prs = recentPRs(finished, exercises, 30, now).slice(0, 5)
  const recent = [...finished].sort((a, b) => b.finishedAt! - a.finishedAt!).slice(0, 3)
  const weights = body.filter((b) => b.weight).map((b) => ({ x: b.date, y: b.weight! }))
  const latestWeight = weights.at(-1)
  const weekAgoWeight = weights.filter((w) => w.x <= now - 7 * 86400000).at(-1)
  const lastFeel = [...body].reverse().find((b) => b.feel)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Workouts</h1>
        <span className="muted small">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </div>

      {/* One tap to start, always at the top. */}
      {active ? (
        <Link className="btn btn--primary btn--block btn--lg" to="/workout">
          Continue {active.name}
        </Link>
      ) : next && !next.complete && next.routine ? (
        <div className="row">
          <button
            type="button"
            className="btn btn--primary btn--lg grow"
            onClick={async () => {
              await startRoutineSession(next.routine!, { plan: next.plan, unit })
              navigate('/workout')
            }}
          >
            <span className="grow" style={{ textAlign: 'left' }}>
              Start {next.routine.name}
              <span className="small" style={{ display: 'block', fontWeight: 400, opacity: 0.85 }}>
                {next.plan.name} · W{next.week} {next.label}
                {next.isDeload ? ' · deload' : ''}
              </span>
            </span>
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => skipPlanDay(next.plan)} title="Skip this day">
            Skip
          </button>
        </div>
      ) : next && !next.complete ? (
        <div className="row">
          <div className="grow">
            <strong>{next.label}</strong> <span className="muted">· rest day · {next.plan.name}</span>
          </div>
          <button type="button" className="btn btn--sm" onClick={() => skipPlanDay(next.plan)}>
            Next day
          </button>
        </div>
      ) : (
        <Link className="btn btn--primary btn--block btn--lg" to="/workout">
          Start a workout
        </Link>
      )}

      <div className="stats">
        <div className="stat">
          <div className="stat__value">{streak}</div>
          <div className="stat__label">week streak</div>
        </div>
        <div className="stat">
          <div className="stat__value">{thisWeek?.sessions ?? 0}</div>
          <div className="stat__label">sessions this week</div>
        </div>
        <div className="stat">
          <div className="stat__value">{Math.round(thisWeek?.volume ?? 0).toLocaleString()}</div>
          <div className="stat__label">{unit} this week</div>
        </div>
      </div>

      <div className="card">
        <div className="row row--between">
          <div className="card__title">Weekly volume</div>
          <span className="muted small">{unit} · last 8 weeks</span>
        </div>
        <BarChart bars={weekly.map((w, i) => ({ label: new Date(w.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: w.volume, highlight: i === weekly.length - 1 }))} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString())} />
      </div>

      <div className="card">
        <div className="row row--between">
          <div className="card__title">Recent PRs</div>
          <span className="muted small">last 30 days</span>
        </div>
        {prs.length === 0 ? (
          <p className="muted small">Log a few sessions and your best estimated one-rep maxes show up here.</p>
        ) : (
          <ul className="list" style={{ gap: 4 }}>
            {prs.map((p) => (
              <li key={p.exerciseId} className="row row--between small">
                <Link to={`/exercises/${p.exerciseId}`}>{p.name}</Link>
                <span className="mono">
                  {p.reps} × {formatWeight(p.weight, unit)} <span className="muted">· e1RM {Math.round(p.e1rm)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/body" className="card" style={{ display: 'block', color: 'inherit' }}>
        <div className="row row--between">
          <div className="card__title">Body</div>
          <span className="muted small">
            {latestWeight ? `${formatWeight(latestWeight.y, unit)}` : 'no weigh-ins yet'}
            {latestWeight && weekAgoWeight ? ` · ${latestWeight.y - weekAgoWeight.y >= 0 ? '+' : ''}${(latestWeight.y - weekAgoWeight.y).toFixed(1)} vs last week` : ''}
            {lastFeel ? ` · feel ${lastFeel.feel}/5` : ''}
          </span>
        </div>
        {weights.length >= 2 ? <LineChart points={weights.slice(-30)} height={110} /> : <p className="muted small">Tap to log bodyweight, measurements and how you feel.</p>}
      </Link>

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
