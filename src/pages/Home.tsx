import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { nextPlanWorkout, skipPlanDay, startRoutineSession } from '../lib/sessions'
import { sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDuration, formatWeight, relativeDay, weeklyStreak } from '../lib/format'
import { recentPRs, weeklyStats } from '../lib/stats'
import { BarChart, LineChart } from '../components/Charts'

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Home() {
  const navigate = useNavigate()
  const unit = useUnit()
  const exercises = useExerciseMap()
  const [now] = useState(() => Date.now())
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  const next = useLiveQuery(() => nextPlanWorkout(), [])
  const finished = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt && s.entries.length > 0).toArray(), [])
  const body = useLiveQuery(() => db.body.orderBy('date').toArray(), []) ?? []
  const daily = useLiveQuery(() => db.daily.orderBy('date').reverse().limit(2).toArray(), []) ?? []

  if (!finished || !exercises) return null
  const today = daily[0]

  const weekly = weeklyStats(finished, 8, now)
  const thisWeek = weekly[weekly.length - 1]
  const streak = weeklyStreak(finished.map((s) => s.finishedAt!), now)
  const prs = recentPRs(finished, exercises, 30, now).slice(0, 5)
  const recent = [...finished].sort((a, b) => b.finishedAt! - a.finishedAt!).slice(0, 3)
  const weights = body.filter((b) => b.weight).map((b) => ({ x: b.date, y: b.weight! }))
  const latestWeight = weights.at(-1)
  const weekAgoWeight = weights.filter((w) => w.x <= now - 7 * 86400000).at(-1)
  const lastFeel = [...body].reverse().find((b) => b.feel)
  const latestFat = [...body].reverse().find((b) => b.bodyFat !== undefined)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="muted small">{greeting(new Date(now))}</div>
          <h1>{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
        </div>
      </div>

      {active ? (
        <div className="hero">
          <div className="hero__eyebrow">In progress</div>
          <div className="hero__title">{active.name}</div>
          <div className="hero__meta">Started {formatDuration(now - active.startedAt)} ago</div>
          <Link className="btn btn--primary btn--block btn--lg" to="/workout">
            Continue workout
          </Link>
        </div>
      ) : next && !next.complete && next.routine ? (
        <div className="hero">
          <div className="hero__eyebrow">
            {next.plan.name} · Week {next.week}
          </div>
          <div className="hero__title">{next.routine.name}</div>
          <div className="hero__meta">
            {next.label} · {next.routine.items.length} exercises
            {next.isDeload ? ' · deload week' : ''}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button
              type="button"
              className="btn btn--primary btn--lg grow"
              onClick={async () => {
                await startRoutineSession(next.routine!, { plan: next.plan, unit })
                navigate('/workout')
              }}
            >
              Start workout
            </button>
            <button type="button" className="btn btn--lg" onClick={() => skipPlanDay(next.plan)}>
              Skip
            </button>
          </div>
        </div>
      ) : next && !next.complete ? (
        <div className="hero">
          <div className="hero__eyebrow">{next.plan.name}</div>
          <div className="hero__title">Rest day</div>
          <div className="hero__meta">{next.label}. Nothing scheduled.</div>
          <button type="button" className="btn btn--block" onClick={() => skipPlanDay(next.plan)}>
            Mark rest day done
          </button>
        </div>
      ) : (
        <div className="hero">
          <div className="hero__eyebrow">No active plan</div>
          <div className="hero__title">Ready when you are</div>
          <div className="hero__meta">Start a routine, or generate a program in a minute.</div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Link className="btn btn--primary btn--lg grow" to="/workout">
              Start workout
            </Link>
            <Link className="btn btn--lg" to="/generate">
              Generate
            </Link>
          </div>
        </div>
      )}

      <div>
        <div className="section">This week</div>
        <div className="stats">
          <div className="stat">
            <div className="stat__value">{thisWeek?.sessions ?? 0}</div>
            <div className="stat__label">workouts</div>
          </div>
          <div className="stat">
            <div className="stat__value">{Math.round(thisWeek?.volume ?? 0).toLocaleString()}</div>
            <div className="stat__label">{unit} lifted</div>
          </div>
          <div className="stat">
            <div className="stat__value">{streak}</div>
            <div className="stat__label">week streak</div>
          </div>
        </div>
      </div>

      {today ? (
        <div>
          <div className="section">Today</div>
          <div className="stats">
            <div className="stat">
              <div className="stat__value">{today.steps !== undefined ? today.steps.toLocaleString() : '—'}</div>
              <div className="stat__label">steps</div>
            </div>
            <div className="stat">
              <div className="stat__value">{today.sleepMin !== undefined ? `${Math.floor(today.sleepMin / 60)}h ${String(today.sleepMin % 60).padStart(2, '0')}` : '—'}</div>
              <div className="stat__label">sleep</div>
            </div>
            <div className="stat">
              <div className="stat__value">{today.restingHr !== undefined ? Math.round(today.restingHr) : '—'}</div>
              <div className="stat__label">resting bpm</div>
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <div className="section">Volume · last 8 weeks</div>
        <div className="card">
          <BarChart bars={weekly.map((w, i) => ({ label: new Date(w.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: w.volume, highlight: i === weekly.length - 1 }))} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString())} />
        </div>
      </div>

      <div>
        <div className="section">Recent PRs</div>
        {prs.length === 0 ? (
          <div className="empty small">Log a few sessions and your best estimated one-rep maxes show up here.</div>
        ) : (
          <ul className="list">
            {prs.map((p) => (
              <li key={p.exerciseId}>
                <Link className="list__item" to={`/exercises/${p.exerciseId}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    <span className="list__title">{p.name}</span>
                    <br />
                    <span className="list__meta">
                      {p.reps} × {formatWeight(p.weight, unit)} · {relativeDay(p.date)}
                    </span>
                  </span>
                  <span className="mono" style={{ fontWeight: 650 }}>
                    {Math.round(p.e1rm)} <span className="muted small">e1RM</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="section">Body</div>
        <Link to="/body" className="card" style={{ display: 'block', color: 'inherit' }}>
          <div className="row row--between">
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{latestWeight ? formatWeight(latestWeight.y, unit) : '—'}</div>
              <div className="muted small">
                {latestWeight && weekAgoWeight ? `${latestWeight.y - weekAgoWeight.y >= 0 ? '+' : ''}${(latestWeight.y - weekAgoWeight.y).toFixed(1)} vs last week` : 'No weigh-ins yet'}
                {latestFat ? ` · ${latestFat.bodyFat}% fat` : ''}
                {lastFeel ? ` · feel ${lastFeel.feel}/5` : ''}
              </div>
            </div>
            <ChevronRight size={20} className="muted" />
          </div>
          {weights.length >= 2 ? <LineChart points={weights.slice(-30)} height={100} /> : null}
        </Link>
      </div>

      <div>
        <div className="row row--between" style={{ marginBottom: 8 }}>
          <div className="section" style={{ margin: 0 }}>Recent workouts</div>
          <Link to="/history" className="small">
            See all
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
