import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise } from '../db'
import { useExerciseMap } from '../hooks/useSettings'
import { ExercisePicker } from '../components/ExercisePicker'

type Tab = 'exercises' | 'routines' | 'plans'
const NONE: Exercise[] = []

export function Library() {
  const { tab = 'routines' } = useParams()
  const navigate = useNavigate()
  const current = (['exercises', 'routines', 'plans'].includes(tab) ? tab : 'routines') as Tab
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Library</h1>
      </div>
      <div className="segmented" role="tablist">
        {(['routines', 'plans', 'exercises'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-pressed={current === t} onClick={() => navigate(`/library/${t}`)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {current === 'exercises' ? <ExercisesTab /> : current === 'routines' ? <RoutinesTab /> : <PlansTab />}
    </div>
  )
}

function ExercisesTab() {
  const navigate = useNavigate()
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? NONE
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? exercises.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q)) : exercises
    const map = new Map<string, typeof list>()
    for (const e of list) map.set(e.muscle, [...(map.get(e.muscle) ?? []), e])
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [exercises, query])
  return (
    <>
      <div className="row">
        <input className="search grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search exercises" />
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          + New
        </button>
      </div>
      {groups.map(([muscle, list]) => (
        <div key={muscle}>
          <h2 className="muted" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {muscle}
          </h2>
          <ul className="list">
            {list.map((e) => (
              <li key={e.id}>
                <Link className="list__item" to={`/exercises/${e.id}`}>
                  <span className="list__title">{e.name}</span>
                  <span className="list__meta">
                    {e.equipment}
                    {e.custom ? ' · custom' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {adding ? <ExercisePicker title="New exercise" onPick={(e) => navigate(`/exercises/${e.id}`)} onClose={() => setAdding(false)} /> : null}
    </>
  )
}

function RoutinesTab() {
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? []
  const exercises = useExerciseMap()
  return (
    <>
      <Link to="/routines/new" className="btn btn--primary btn--block">
        + New routine
      </Link>
      {routines.length === 0 ? <div className="empty">A routine is a list of exercises with set, rep, rest and weight targets. Start one and the app tracks your progression.</div> : null}
      <ul className="list">
        {routines.map((r) => (
          <li key={r.id}>
            <Link className="list__item" to={`/routines/${r.id}/edit`}>
              <span className="list__title">{r.name}</span>
              <span className="list__meta">{r.items.map((i) => exercises?.get(i.exerciseId)?.name ?? '…').join(' · ') || 'No exercises yet'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function PlansTab() {
  const plans = useLiveQuery(() => db.plans.orderBy('createdAt').reverse().toArray(), []) ?? []
  return (
    <>
      <Link to="/plans/new" className="btn btn--primary btn--block">
        + New plan
      </Link>
      {plans.length === 0 ? <div className="empty">A plan strings routines into a weekly schedule over several weeks, with automatic progression and optional deloads.</div> : null}
      <ul className="list">
        {plans.map((p) => (
          <li key={p.id}>
            <Link className="list__item" to={`/plans/${p.id}`}>
              <span className="row row--between">
                <span className="list__title">{p.name}</span>
                {p.active ? <span className="pill pill--accent">Active</span> : null}
              </span>
              <span className="list__meta">
                {p.weeks} weeks · {p.days.length} days/week
                {p.deloadEvery ? ` · deload every ${p.deloadEvery}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
