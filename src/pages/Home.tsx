import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { currentReadiness, nextPlanWorkout, skipPlanDay, startRoutineSession } from '../lib/sessions'
import { readinessEffect } from '../lib/readiness'
import { sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDuration, relativeDay, weeklyStreak } from '../lib/format'
import { weeklyStats } from '../lib/stats'

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function short(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString()
}

export function Home() {
  const navigate = useNavigate()
  const unit = useUnit()
  const exercises = useExerciseMap()
  const [now] = useState(() => Date.now())
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  const next = useLiveQuery(() => nextPlanWorkout(), [])
  const readiness = useLiveQuery(() => currentReadiness(unit), [unit])
  const finished = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt && s.entries.length > 0).toArray(), [])
  const body = useLiveQuery(() => db.body.orderBy('date').toArray(), []) ?? []
  const name = useLiveQuery(async () => ((await db.settings.get('name'))?.value as string | undefined) ?? '', [], '')

  if (!finished || !exercises) return null

  const weekly = weeklyStats(finished, 8, now)
  const thisWeek = weekly[weekly.length - 1]
  const streak = weeklyStreak(finished.map((s) => s.finishedAt!), now)
  const recent = [...finished].sort((a, b) => b.finishedAt! - a.finishedAt!).slice(0, 3)
  const weights = body.filter((b) => b.weight).map((b) => ({ x: b.date, y: b.weight! }))
  const latestWeight = weights.at(-1)
  const monthAgo = weights.filter((w) => w.x <= now - 30 * 86400000).at(-1) ?? weights[0]
  const change = latestWeight && monthAgo && latestWeight !== monthAgo ? latestWeight.y - monthAgo.y : null
  const maxVol = Math.max(...weekly.map((w) => w.volume), 1)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="muted small">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1>
            {greeting(new Date(now))}
            {name ? `, ${name}` : ''}
          </h1>
        </div>
        <Link to="/more" className="avatar" aria-label="Profile and more">
          {(name || 'W').slice(0, 1).toUpperCase()}
        </Link>
      </div>

      {active ? (
        <div className="hero">
          <div className="hero__eyebrow">In progress</div>
          <div className="hero__title">{active.name}</div>
          <div className="hero__meta">Started {formatDuration(now - active.startedAt)} ago</div>
          <Link className="btn btn--primary btn--block btn--lg" to="/workout">
            Continue workout
            <Arrow />
          </Link>
        </div>
      ) : next && !next.complete && next.routine ? (
        <div className="hero">
          <div className="row row--between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="hero__eyebrow">
                Up next · Week {next.week}
              </div>
              <div className="hero__title">{next.routine.name}</div>
              <div className="hero__meta">
                {next.routine.items.length} exercises · {next.routine.items.reduce((a, i) => a + i.sets, 0)} sets
                {next.isDeload ? ' · deload' : ''}
              </div>
              {readiness ? (
                <div className="hero__meta">
                  Readiness {readiness.level} {readiness.score} · {readinessEffect({ ...readiness, earlyDeload: readiness.rules.deload && !next.isDeload })}
                </div>
              ) : null}
            </div>
            <span className="pill pill--accent">{next.label}</span>
          </div>
          <div className="hero__chips">
            {next.routine.items.slice(0, 3).map((i) => (
              <span key={i.exerciseId} className="hero__chip">
                {exercises.get(i.exerciseId)?.name ?? '…'}
              </span>
            ))}
            {next.routine.items.length > 3 ? <span className="hero__chip">+{next.routine.items.length - 3}</span> : null}
          </div>
          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            onClick={async () => {
              await startRoutineSession(next.routine!, { plan: next.plan, unit })
              navigate('/workout')
            }}
          >
            Start workout
            <Arrow />
          </button>
          <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'center' }} onClick={() => skipPlanDay(next.plan)}>
            Skip this day
          </button>
        </div>
      ) : next && !next.complete ? (
        <div className="hero">
          <div className="hero__eyebrow">{next.plan.name}</div>
          <div className="hero__title">Rest day</div>
          <div className="hero__meta">{next.label}. Nothing scheduled.</div>
          <button type="button" className="btn btn--primary btn--block" onClick={() => skipPlanDay(next.plan)}>
            Mark rest day done
          </button>
        </div>
      ) : (
        <div className="hero">
          <div className="hero__eyebrow">No active plan</div>
          <div className="hero__title">Ready when you are</div>
          <div className="hero__meta">Start a routine, or generate a program in a minute.</div>
          <Link className="btn btn--primary btn--block btn--lg" to="/workout">
            Start workout
            <Arrow />
          </Link>
          <Link className="btn btn--ghost btn--sm" style={{ alignSelf: 'center' }} to="/generate">
            Generate a program
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link to="/progress" className="section--eyebrow section" style={{ margin: 0, display: 'block' }}>
            This week →
          </Link>
          <div className="display c-sky" style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
            {short(thisWeek?.volume ?? 0)} <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 500, letterSpacing: 0 }}>{unit}</span>
          </div>
          <div className="bars" aria-label="Weekly volume, last 8 weeks">
            {weekly.map((w, i) => (
              <span key={w.weekStart} className={i === weekly.length - 1 ? 'is-now' : ''} style={{ height: `${Math.max(4, (w.volume / maxVol) * 100)}%` }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
            <div className="display c-lime" style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1 }}>{thisWeek?.sessions ?? 0}</div>
            <div className="muted small">
              workouts · <span className="c-amber">{streak} wk streak</span>
            </div>
          </div>
          <Link to="/body" className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
            <div className="display c-coral" style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1 }}>{latestWeight ? latestWeight.y : '—'}</div>
            <div className="muted small">
              {unit} body{change !== null ? <span className={change <= 0 ? ' good' : ''}> · {change > 0 ? '+' : ''}{change.toFixed(1)}</span> : ''}
            </div>
          </Link>
        </div>
      </div>

      <div>
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <div className="section" style={{ margin: 0 }}>Recent</div>
          <Link to="/history" className="small muted">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty">Your finished workouts will show up here.</div>
        ) : (
          <ul className="list">
            {recent.map((s) => (
              <li key={s.id}>
                <Link className="list__item" to={`/history/${s.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="list__title">{s.name}</span>
                    <span className="list__meta">
                      {relativeDay(s.finishedAt!)} · {sessionSetCount(s)} sets · {formatDuration(s.finishedAt! - s.startedAt)}
                    </span>
                  </span>
                  <span className="mono c-sky" style={{ fontWeight: 600 }}>
                    {Math.round(sessionVolume(s)).toLocaleString()} <span className="muted small">{unit}</span>
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

function Arrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

