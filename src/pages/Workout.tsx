import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type Session, type SessionEntry, type SetEntry } from '../db'
import { useDefaultRest, useExerciseMap, useUnit } from '../hooks/useSettings'
import { restTimer } from '../hooks/useRestTimer'
import { discardSession, finishSession, nextPlanWorkout, startEmptySession, startRoutineSession } from '../lib/sessions'
import { latestEntryFor } from '../lib/progression'
import { formatDuration, formatWeight } from '../lib/format'
import { ExercisePicker } from '../components/ExercisePicker'
import { NumberField } from '../components/NumberField'

const NO_SESSIONS: Session[] = []

export function Workout() {
  // null = no active session, undefined = still loading
  const session = useLiveQuery(async () => (await db.sessions.where('finishedAt').equals(0).first()) ?? null, [])
  if (session === undefined) return null
  return session ? <ActiveWorkout session={session} /> : <StartWorkout />
}

function StartWorkout() {
  const unit = useUnit()
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? []
  const next = useLiveQuery(() => nextPlanWorkout(), [])
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Start a workout</h1>
      </div>
      {next && !next.complete && next.routine ? (
        <div className="card card--accent">
          <div className="card__title">
            {next.plan.name} · Week {next.week}, Day {next.day}
          </div>
          <p className="muted">
            {next.label} · {next.routine.name}
            {next.isDeload ? ' · deload week' : ''}
          </p>
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => startRoutineSession(next.routine!, { plan: next.plan, unit })}>
            Start plan workout
          </button>
        </div>
      ) : null}
      <div className="card">
        <div className="card__title">Routines</div>
        {routines.length === 0 ? (
          <p className="muted small">
            No routines yet. <Link to="/routines/new">Create one</Link> to get set targets, progression and rest timers.
          </p>
        ) : (
          <div className="stack">
            {routines.map((r) => (
              <button key={r.id} type="button" className="btn" onClick={() => startRoutineSession(r, { unit })}>
                <span className="grow" style={{ textAlign: 'left' }}>
                  {r.name}
                </span>
                <span className="muted small">{r.items.length} exercises</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="btn btn--ghost btn--block" onClick={() => startEmptySession()}>
        Start empty workout
      </button>
    </div>
  )
}

function ActiveWorkout({ session }: { session: Session }) {
  const navigate = useNavigate()
  const unit = useUnit()
  const defaultRest = useDefaultRest()
  const exercises = useExerciseMap()
  const [picking, setPicking] = useState(false)
  const [mode, setMode] = useState<'list' | 'focus'>(() => (localStorage.getItem('workouts.mode') as 'list' | 'focus') || 'list')
  const [focusIndex, setFocusIndex] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const history = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt).toArray(), []) ?? NO_SESSIONS

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    localStorage.setItem('workouts.mode', mode)
  }, [mode])

  const id = session.id!
  const save = (entries: SessionEntry[]) => db.sessions.update(id, { entries })

  function updateSet(ei: number, si: number, patch: Partial<SetEntry>) {
    const entries = session.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e))
    void save(entries)
  }
  function toggleDone(ei: number, si: number) {
    const set = session.entries[ei].sets[si]
    const done = !set.done
    updateSet(ei, si, { done })
    if (done) restTimer.start(session.entries[ei].restSec || defaultRest)
  }
  function addSet(ei: number) {
    const entry = session.entries[ei]
    const last = entry.sets[entry.sets.length - 1]
    const next: SetEntry = last ? { ...last, done: false } : { reps: 8, weight: 0, done: false }
    void save(session.entries.map((e, i) => (i === ei ? { ...e, sets: [...e.sets, next] } : e)))
  }
  function removeSet(ei: number, si: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)))
  }
  function removeExercise(ei: number) {
    void save(session.entries.filter((_, i) => i !== ei))
    setFocusIndex((f) => Math.max(0, Math.min(f, session.entries.length - 2)))
  }
  function setRest(ei: number, restSec: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, restSec } : e)))
  }
  function addExercise(ex: Exercise) {
    const prev = latestEntryFor(history, ex.id!)
    const template = prev?.sets.at(-1)
    const sets: SetEntry[] = Array.from({ length: prev?.sets.length || 3 }, () => ({
      reps: template?.reps ?? 8,
      weight: template?.weight ?? 0,
      done: false,
    }))
    void save([...session.entries, { exerciseId: ex.id!, restSec: prev?.restSec ?? defaultRest, increment: prev?.increment ?? (unit === 'kg' ? 2.5 : 5), sets }])
    setPicking(false)
    setFocusIndex(session.entries.length)
  }
  async function finish() {
    const doneSets = session.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
    if (doneSets === 0 && !confirm('No sets were completed. Finish anyway? The workout will be saved as empty.')) return
    restTimer.stop()
    await finishSession(id)
    navigate(`/history/${id}`, { replace: true })
  }
  async function discard() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return
    restTimer.stop()
    await discardSession(id)
    navigate('/', { replace: true })
  }

  const doneSets = session.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
  const totalSets = session.entries.reduce((a, e) => a + e.sets.length, 0)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{session.name}</h1>
          <span className="muted small mono">
            {formatDuration(now - session.startedAt)} · {doneSets}/{totalSets} sets
          </span>
        </div>
        <button type="button" className="btn btn--primary" onClick={finish}>
          Finish
        </button>
      </div>

      {session.entries.length > 0 ? (
        <div className="segmented" role="group" aria-label="View mode">
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            List
          </button>
          <button type="button" aria-pressed={mode === 'focus'} onClick={() => setMode('focus')}>
            Guided
          </button>
        </div>
      ) : null}

      {session.entries.length === 0 ? <div className="empty">Add an exercise to get going.</div> : null}

      {mode === 'focus' && session.entries.length > 0 ? (
        <FocusView
          session={session}
          index={Math.min(focusIndex, session.entries.length - 1)}
          setIndex={setFocusIndex}
          exercises={exercises}
          unit={unit}
          history={history}
          onToggle={toggleDone}
          onUpdate={updateSet}
          onAddSet={addSet}
          onRemoveSet={removeSet}
        />
      ) : (
        session.entries.map((entry, ei) => (
          <ExerciseCard
            key={`${entry.exerciseId}-${ei}`}
            entry={entry}
            exercise={exercises?.get(entry.exerciseId)}
            unit={unit}
            previous={latestEntryFor(history, entry.exerciseId)}
            onToggle={(si) => toggleDone(ei, si)}
            onUpdate={(si, patch) => updateSet(ei, si, patch)}
            onAddSet={() => addSet(ei)}
            onRemoveSet={(si) => removeSet(ei, si)}
            onRemove={() => removeExercise(ei)}
            onRest={(r) => setRest(ei, r)}
          />
        ))
      )}

      <button type="button" className="btn btn--block" onClick={() => setPicking(true)}>
        + Add exercise
      </button>
      <button type="button" className="btn btn--ghost btn--danger btn--block" onClick={discard}>
        Discard workout
      </button>

      {picking ? <ExercisePicker onPick={addExercise} onClose={() => setPicking(false)} /> : null}
    </div>
  )
}

interface CardProps {
  entry: SessionEntry
  exercise: Exercise | undefined
  unit: string
  previous: SessionEntry | undefined
  onToggle: (si: number) => void
  onUpdate: (si: number, patch: Partial<SetEntry>) => void
  onAddSet: () => void
  onRemoveSet: (si: number) => void
  onRemove: () => void
  onRest: (sec: number) => void
}

function ExerciseCard({ entry, exercise, unit, previous, onToggle, onUpdate, onAddSet, onRemoveSet, onRemove, onRest }: CardProps) {
  const [menu, setMenu] = useState(false)
  const step = unit === 'kg' ? 2.5 : 5
  return (
    <div className="card exercise">
      <div className="exercise__head">
        <div>
          <h3>
            <Link to={`/exercises/${entry.exerciseId}`}>{exercise?.name ?? 'Exercise'}</Link>
          </h3>
          <span className="muted small">
            Rest {entry.restSec}s
            {previous ? ` · last: ${previous.sets.map((s) => `${s.reps}×${s.weight}`).join(', ')}` : ''}
          </span>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMenu((m) => !m)} aria-label="Exercise options">
          ⋯
        </button>
      </div>
      {menu ? (
        <div className="row" style={{ marginBottom: 10 }}>
          <NumberField label="Rest (s)" value={entry.restSec} onChange={onRest} step={15} compact />
          <button type="button" className="btn btn--sm btn--danger" onClick={onRemove}>
            Remove exercise
          </button>
        </div>
      ) : null}
      <div className="sets">
        {entry.sets.map((set, si) => (
          <SetRow key={si} index={si} set={set} unit={unit} step={step} onToggle={() => onToggle(si)} onUpdate={(p) => onUpdate(si, p)} onRemove={() => onRemoveSet(si)} />
        ))}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={onAddSet}>
        + Add set
      </button>
    </div>
  )
}

function SetRow({ index, set, unit, step, onToggle, onUpdate, onRemove }: { index: number; set: SetEntry; unit: string; step: number; onToggle: () => void; onUpdate: (p: Partial<SetEntry>) => void; onRemove: () => void }) {
  return (
    <div className={`set${set.done ? ' set--done' : ''}`}>
      <div className="set__lead">
        <button type="button" className="set__num" onClick={onRemove} title="Remove set" aria-label={`Remove set ${index + 1}`}>
          Set {index + 1}
        </button>
        <span className="set__target">{set.targetWeight !== undefined ? `${set.targetReps} × ${formatWeight(set.targetWeight, unit)}` : 'free'}</span>
      </div>
      <NumberField value={set.weight} onChange={(weight) => onUpdate({ weight })} step={step} suffix={unit} compact />
      <NumberField value={set.reps} onChange={(reps) => onUpdate({ reps })} step={1} suffix="reps" compact />
      <button type="button" className="set__check" aria-pressed={set.done} onClick={onToggle} aria-label={set.done ? 'Mark set not done' : 'Mark set done'}>
        ✓
      </button>
    </div>
  )
}

interface FocusProps {
  session: Session
  index: number
  setIndex: (i: number) => void
  exercises: Map<number, Exercise> | undefined
  unit: string
  history: Session[]
  onToggle: (ei: number, si: number) => void
  onUpdate: (ei: number, si: number, patch: Partial<SetEntry>) => void
  onAddSet: (ei: number) => void
  onRemoveSet: (ei: number, si: number) => void
}

function FocusView({ session, index, setIndex, exercises, unit, history, onToggle, onUpdate, onAddSet, onRemoveSet }: FocusProps) {
  const entry = session.entries[index]
  const exercise = exercises?.get(entry.exerciseId)
  const previous = latestEntryFor(history, entry.exerciseId)
  const current = entry.sets.findIndex((s) => !s.done)
  const step = unit === 'kg' ? 2.5 : 5
  const allDone = current === -1
  return (
    <div className="card focus">
      <div className="focus__nav">
        <button type="button" className="btn btn--ghost btn--sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ‹ Prev
        </button>
        <span className="muted small">
          {index + 1} / {session.entries.length}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" disabled={index >= session.entries.length - 1} onClick={() => setIndex(index + 1)}>
          Next ›
        </button>
      </div>
      <h2>
        <Link to={`/exercises/${entry.exerciseId}`}>{exercise?.name ?? 'Exercise'}</Link>
      </h2>
      {previous ? <p className="muted small">Last time: {previous.sets.map((s) => `${s.reps}×${s.weight}`).join(', ')}</p> : null}
      {allDone ? (
        <>
          <div className="focus__big">Done</div>
          <p className="muted">All {entry.sets.length} sets logged.</p>
          {index < session.entries.length - 1 ? (
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => setIndex(index + 1)}>
              Next exercise
            </button>
          ) : (
            <p className="muted small">That was the last exercise. Hit Finish at the top when you are done.</p>
          )}
        </>
      ) : (
        <>
          <div className="muted small">
            Set {current + 1} of {entry.sets.length}
          </div>
          <div className="focus__big">
            {entry.sets[current].reps} × {formatWeight(entry.sets[current].weight, unit)}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <NumberField label="Weight" value={entry.sets[current].weight} onChange={(weight) => onUpdate(index, current, { weight })} step={step} suffix={unit} />
            <NumberField label="Reps" value={entry.sets[current].reps} onChange={(reps) => onUpdate(index, current, { reps })} step={1} />
          </div>
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => onToggle(index, current)}>
            Log set {current + 1}
          </button>
        </>
      )}
      <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
        {entry.sets.map((s, si) => (
          <button key={si} type="button" className={`pill${s.done ? ' pill--good' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => (s.done ? onToggle(index, si) : onRemoveSet(index, si))} title={s.done ? 'Undo this set' : 'Remove this set'}>
            {s.done ? `${s.reps}×${s.weight}` : `set ${si + 1}`}
          </button>
        ))}
        <button type="button" className="pill" style={{ border: 0, cursor: 'pointer' }} onClick={() => onAddSet(index)}>
          + set
        </button>
      </div>
    </div>
  )
}
