import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '../db'
import { useExerciseMap, useUnit } from '../hooks/useSettings'
import { sessionSetCount, sessionVolume } from '../lib/progression'
import { formatDuration } from '../lib/format'
import { bestLifts } from '../lib/stats'

function dayStart(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function History() {
  const unit = useUnit()
  const exercises = useExerciseMap()
  const [now] = useState(() => Date.now())
  const [month, setMonth] = useState(() => {
    const d = new Date(now)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const thisMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime()
  const sessions = useLiveQuery(() => db.sessions.orderBy('finishedAt').reverse().filter((s) => !!s.finishedAt && s.entries.length > 0).toArray(), [])
  if (!sessions || !exercises) return null

  // PR dates: the day each exercise's best lift was set.
  const prDays = new Map<number, number>()
  for (const r of bestLifts(sessions, exercises)) prDays.set(r.sessionId, (prDays.get(r.sessionId) ?? 0) + 1)

  const doneDays = new Set(sessions.map((s) => dayStart(s.finishedAt!)))
  const today = dayStart(now)
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const inMonth = sessions.filter((s) => {
    const d = new Date(s.finishedAt!)
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
  })
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>History</h1>
        <span className="muted small">{sessions.length} workouts</span>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row row--between">
          <button type="button" className="btn btn--icon" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600 }}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <div className="muted small">{inMonth.length} this month</div>
          </div>
          <button type="button" className="btn btn--icon" onClick={() => shift(1)} aria-label="Next month" disabled={month.getTime() >= thisMonth}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="cal">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="cal__dow">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const ts = new Date(month.getFullYear(), month.getMonth(), i + 1).getTime()
            const cls = ['cal__day']
            if (doneDays.has(ts)) cls.push('cal__day--done')
            else if (ts === today) cls.push('cal__day--today')
            else if (ts > today) cls.push('cal__day--future')
            return (
              <span key={ts} className={cls.join(' ')}>
                {i + 1}
              </span>
            )
          })}
        </div>
      </div>

      {inMonth.length === 0 ? <div className="empty">No workouts this month.</div> : null}
      {inMonth.map((s) => {
        const prs = prDays.get(s.id!) ?? 0
        return (
          <Link key={s.id} to={`/history/${s.id}`} className="card hcard">
            <div className="row row--between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="display" style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.name}</div>
                <div className="muted small">
                  {new Date(s.finishedAt!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatDuration(s.finishedAt! - s.startedAt)}
                </div>
              </div>
              {prs > 0 ? <span className="pill pill--good">{prs} PR{prs > 1 ? 's' : ''}</span> : null}
            </div>
            <div className="hcard__figs">
              <div className="hcard__fig">
                <span>{sessionSetCount(s)}</span>
                <span>sets</span>
              </div>
              <div className="hcard__fig">
                <span>{Math.round(sessionVolume(s)).toLocaleString()}</span>
                <span>{unit}</span>
              </div>
              {s.hrAvg !== undefined ? (
                <div className="hcard__fig">
                  <span>{Math.round(s.hrAvg)}</span>
                  <span>avg bpm</span>
                </div>
              ) : null}
              {s.calories !== undefined ? (
                <div className="hcard__fig">
                  <span>{Math.round(s.calories)}</span>
                  <span>kcal</span>
                </div>
              ) : null}
            </div>
            <div className="hcard__ex">{s.entries.map((e) => exercises.get(e.exerciseId)?.name ?? 'Exercise').join(' · ')}</div>
          </Link>
        )
      })}
    </div>
  )
}
