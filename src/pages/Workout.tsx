import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type Session, type SessionEntry, type SetEntry, type Unit } from '../db'
import { useDefaultRest, useExerciseMap, useUnit } from '../hooks/useSettings'
import { restTimer } from '../hooks/useRestTimer'
import { discardSession, finishSession, nextPlanWorkout, startEmptySession, startRoutineSession } from '../lib/sessions'
import { latestEntryFor, roundToPlate } from '../lib/progression'
import { formatDuration, formatWeight } from '../lib/format'
import { ExercisePicker } from '../components/ExercisePicker'
import { NumberField } from '../components/NumberField'
import { closePad, openPad } from '../lib/pad'
import { PlateCalculator } from '../components/PlateCalculator'
import { onSessionFinished } from '../lib/health'

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
            {next.plan.name} · Week {next.week}, {next.label}
          </div>
          <p className="muted">
            {next.routine.name}
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
            No routines yet. <Link to="/generate">Generate a program</Link> or <Link to="/routines/new">build a routine</Link>.
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
  const [picking, setPicking] = useState<'add' | 'swap' | null>(null)
  const [index, setIndex] = useState(() => firstUnfinished(session))
  const [now, setNow] = useState(() => Date.now())
  const history = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt).toArray(), []) ?? NO_SESSIONS

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const id = session.id!
  const save = (entries: SessionEntry[]) => db.sessions.update(id, { entries })
  const current = Math.min(index, Math.max(session.entries.length - 1, 0))
  const entry = session.entries[current]

  function updateSet(ei: number, si: number, patch: Partial<SetEntry>) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e)))
  }
  /** Log a set: mark done, start rest, and let untouched upcoming sets follow what you just did. */
  function logSet(ei: number, si: number) {
    const e = session.entries[ei]
    const set = e.sets[si]
    const done = !set.done
    const sets = e.sets.map((s, j) => {
      if (j === si) return { ...s, done }
      if (done && j > si && !s.done && s.kind !== 'warmup' && s.weight === (s.targetWeight ?? s.weight) && set.kind !== 'warmup') return { ...s, weight: set.weight }
      return s
    })
    void save(session.entries.map((x, i) => (i === ei ? { ...x, sets } : x)))
    if (done) restTimer.start(set.kind === 'warmup' ? Math.min(60, e.restSec || defaultRest) : e.restSec || defaultRest)
  }
  function addSet(ei: number, kind: 'work' | 'warmup' = 'work') {
    const e = session.entries[ei]
    const work = e.sets.filter((s) => s.kind !== 'warmup')
    const last = work[work.length - 1]
    let next: SetEntry
    if (kind === 'warmup') {
      // Base warm-ups on the heaviest working weight on screen, so they still make sense on a
      // first session where the plan target is 0 and you typed the weight in yourself.
      const target = Math.max(0, ...work.map((s) => s.weight), ...work.map((s) => s.targetWeight ?? 0))
      const n = e.sets.filter((s) => s.kind === 'warmup').length
      const pct = [0.4, 0.6, 0.8][n] ?? 0.9
      next = { reps: n === 0 ? 8 : 5, weight: roundToPlate(target * pct, unit), done: false, kind: 'warmup' }
      const warmups = e.sets.filter((s) => s.kind === 'warmup')
      void save(session.entries.map((x, i) => (i === ei ? { ...x, sets: [...warmups, next, ...work] } : x)))
      return
    }
    next = last ? { ...last, done: false } : { reps: 8, weight: 0, done: false, kind: 'work' }
    void save(session.entries.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, next] } : x)))
  }
  function removeSet(ei: number, si: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)))
  }
  function removeExercise(ei: number) {
    void save(session.entries.filter((_, i) => i !== ei))
    setIndex((f) => Math.max(0, Math.min(f, session.entries.length - 2)))
  }
  function setRest(ei: number, restSec: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, restSec } : e)))
  }
  function addExercise(ex: Exercise) {
    const prev = latestEntryFor(history, ex.id!)
    const template = prev?.sets.filter((s) => s.kind !== 'warmup').at(-1)
    const sets: SetEntry[] = Array.from({ length: prev?.sets.filter((s) => s.kind !== 'warmup').length || 3 }, () => ({
      reps: template?.reps ?? 8,
      weight: template?.weight ?? 0,
      done: false,
      kind: 'work',
    }))
    void save([...session.entries, { exerciseId: ex.id!, restSec: prev?.restSec ?? defaultRest, increment: prev?.increment ?? (unit === 'kg' ? 2.5 : 5), sets }])
    setPicking(null)
    setIndex(session.entries.length)
  }
  function swapExercise(ex: Exercise) {
    const prev = latestEntryFor(history, ex.id!)
    const template = prev?.sets.filter((s) => s.kind !== 'warmup').at(-1)
    void save(
      session.entries.map((e, i) =>
        i === current
          ? {
              ...e,
              exerciseId: ex.id!,
              increment: prev?.increment ?? e.increment,
              sets: e.sets.map((s) => (s.done ? s : { ...s, weight: template?.weight ?? 0, reps: template?.reps ?? s.reps, targetWeight: template?.weight ?? 0, targetReps: template?.reps ?? s.targetReps })),
            }
          : e,
      ),
    )
    setPicking(null)
  }
  async function finish() {
    const doneSets = session.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
    if (doneSets === 0 && !confirm('No sets were completed. Finish anyway? The workout will be saved as empty.')) return
    restTimer.stop()
    await finishSession(id)
    void onSessionFinished(id)
    navigate(`/history/${id}`, { replace: true })
  }
  async function discard() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return
    restTimer.stop()
    await discardSession(id)
    navigate('/', { replace: true })
  }

  const doneSets = session.entries.reduce((a, e) => a + e.sets.filter((s) => s.done && s.kind !== 'warmup').length, 0)
  const totalSets = session.entries.reduce((a, e) => a + e.sets.filter((s) => s.kind !== 'warmup').length, 0)
  const currentMuscle = entry ? exercises?.get(entry.exerciseId)?.muscle : undefined

  return (
    <div className="stack">
      <div className="session-head">
        <div>
          <div className="session-head__clock">{formatDuration(now - session.startedAt)}</div>
          <div className="session-head__meta">
            <span>{session.name}</span>
            <span className="session-head__dot" />
            <span>
              {doneSets}/{totalSets} sets
            </span>
          </div>
        </div>
        <button type="button" className="btn btn--primary btn--pill" onClick={finish}>
          Finish
        </button>
      </div>
      <div className="session-progress" aria-hidden="true">
        <div style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
      </div>

      {/* Exercise bar: one exercise at a time, swipe-free tabs. */}
      <div className="exbar" role="tablist" aria-label="Exercises">
        {session.entries.map((e, i) => {
          const work = e.sets.filter((s) => s.kind !== 'warmup')
          const done = work.filter((s) => s.done).length
          const complete = work.length > 0 && done === work.length
          return (
            <button key={`${e.exerciseId}-${i}`} type="button" role="tab" aria-selected={i === current} className={`exbar__tab${i === current ? ' exbar__tab--active' : ''}${complete ? ' exbar__tab--done' : ''}`} onClick={() => setIndex(i)}>
              <span className="exbar__name">{exercises?.get(e.exerciseId)?.name ?? 'Exercise'}</span>
              <span className="exbar__meta">
                {complete ? '✓ ' : ''}
                {done}/{work.length}
              </span>
              <span className="exbar__bar">
                <span style={{ width: `${work.length ? (done / work.length) * 100 : 0}%` }} />
              </span>
            </button>
          )
        })}
        <button type="button" className="exbar__tab exbar__tab--add" onClick={() => setPicking('add')} aria-label="Add exercise">
          +
        </button>
      </div>

      {!entry ? (
        <div className="empty">Add an exercise to get going.</div>
      ) : (
        <ExercisePanel
          key={`${entry.exerciseId}-${current}`}
          entry={entry}
          exercise={exercises?.get(entry.exerciseId)}
          unit={unit}
          previous={latestEntryFor(history, entry.exerciseId)}
          isLast={current >= session.entries.length - 1}
          onLog={(si) => logSet(current, si)}
          onUpdate={(si, patch) => updateSet(current, si, patch)}
          onAddSet={(kind) => addSet(current, kind)}
          onRemoveSet={(si) => removeSet(current, si)}
          onRemove={() => removeExercise(current)}
          onRest={(r) => setRest(current, r)}
          onSwap={() => setPicking('swap')}
          onNext={() => setIndex(current + 1)}
        />
      )}

      <button type="button" className="btn btn--ghost btn--danger btn--block" onClick={discard}>
        Discard workout
      </button>

      {picking === 'add' ? <ExercisePicker onPick={addExercise} onClose={() => setPicking(null)} /> : null}
      {picking === 'swap' && entry ? <ExercisePicker title="Swap exercise" prefer={(e) => e.muscle === currentMuscle} excludeId={entry.exerciseId} onPick={swapExercise} onClose={() => setPicking(null)} /> : null}
    </div>
  )
}

function formatNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

function firstUnfinished(session: Session): number {
  const i = session.entries.findIndex((e) => e.sets.some((s) => !s.done))
  return i === -1 ? Math.max(0, session.entries.length - 1) : i
}

interface PanelProps {
  entry: SessionEntry
  exercise: Exercise | undefined
  unit: Unit
  previous: SessionEntry | undefined
  isLast: boolean
  onLog: (si: number) => void
  onUpdate: (si: number, patch: Partial<SetEntry>) => void
  onAddSet: (kind?: 'work' | 'warmup') => void
  onRemoveSet: (si: number) => void
  onRemove: () => void
  onRest: (sec: number) => void
  onSwap: () => void
  onNext: () => void
}

function ExercisePanel({ entry, exercise, unit, previous, isLast, onLog, onUpdate, onAddSet, onRemoveSet, onRemove, onRest, onSwap, onNext }: PanelProps) {
  const [menu, setMenu] = useState(false)
  const [plates, setPlates] = useState<number | null>(null)
  const step = unit === 'kg' ? 2.5 : 5
  const prevWork = previous?.sets.filter((s) => s.kind !== 'warmup') ?? []
  const allDone = entry.sets.length > 0 && entry.sets.every((s) => s.done)
  const nextUp = entry.sets.findIndex((s) => !s.done)
  // Labels: warm-ups count as W1, W2…; working sets as 1, 2… and map onto last time's working sets.
  const labels: { label: string; prev: SetEntry | undefined }[] = []
  for (let work = 0, warm = 0, i = 0; i < entry.sets.length; i++) {
    if (entry.sets[i].kind === 'warmup') labels.push({ label: `W${++warm}`, prev: undefined })
    else labels.push({ label: `${++work}`, prev: prevWork[work - 1] })
  }
  return (
    <div className="card card--exercise">
      <div className="exercise__head">
        <div>
          <h2 className="exercise__title">
            <Link to={`/exercises/${entry.exerciseId}`}>{exercise?.name ?? 'Exercise'}</Link>
          </h2>
          <span className="muted small">
            {exercise?.muscle ? `${exercise.muscle} · ` : ''}rest {entry.restSec}s
            {prevWork.length ? ` · last ${prevWork.map((s) => `${s.reps}×${s.weight}`).join(', ')}` : ''}
          </span>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMenu((m) => !m)} aria-label="Exercise options" aria-expanded={menu}>
          ⋯
        </button>
      </div>
      {menu ? (
        <div className="stack" style={{ marginBottom: 12 }}>
          <div className="row">
            <NumberField label="Rest" suffix="s" value={entry.restSec} onChange={onRest} step={15} compact integer />
            <button type="button" className="btn btn--sm" onClick={() => onAddSet('warmup')}>
              + Warm-up set
            </button>
          </div>
          <div className="row">
            <button type="button" className="btn btn--sm" onClick={onSwap}>
              Swap exercise
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setPlates(entry.sets[nextUp === -1 ? entry.sets.length - 1 : nextUp]?.weight ?? 0)}>
              Plates
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      ) : null}

      <div className="setgrid" role="table">
        <div className="setgrid__head" role="row">
          <span>Set</span>
          <span>{unit}</span>
          <span>Reps</span>
          <span />
        </div>
        {entry.sets.map((set, si) => {
          const isWarm = set.kind === 'warmup'
          const { label, prev } = labels[si]
          const isNext = si === nextUp
          const hint = prev ? `last ${prev.reps} × ${prev.weight}` : set.targetWeight ? `target ${set.targetReps} × ${set.targetWeight}` : isWarm ? 'warm-up' : 'first time'
          const openReps = () =>
            openPad({
              value: set.reps,
              label: `Set ${label} · reps`,
              step: 1,
              allowDecimal: false,
              onChange: (reps) => onUpdate(si, { reps }),
              primary: {
                label: set.done ? 'Done' : 'Log set',
                onPress: () => {
                  closePad()
                  if (!set.done) onLog(si)
                },
              },
            })
          const openWeight = () =>
            openPad({
              value: set.weight,
              label: `Set ${label} · ${unit}`,
              unit,
              step,
              allowDecimal: true,
              onChange: (weight) => onUpdate(si, { weight }),
              primary: { label: 'Next', onPress: openReps },
            })
          return (
            <div key={si} className={`setgrid__row${set.done ? ' setgrid__row--done' : ''}${isNext ? ' setgrid__row--next' : ''}${isWarm ? ' setgrid__row--warm' : ''}`} role="row">
              <button type="button" className="setgrid__lead" onClick={() => (prev ? onUpdate(si, { weight: prev.weight, reps: prev.reps }) : onRemoveSet(si))} title={prev ? 'Use last time' : 'Remove set'}>
                <span className="setgrid__num">{label}</span>
                <span className="setgrid__hint">{hint}</span>
              </button>
              <button type="button" className="setgrid__val" onClick={openWeight} aria-label={`Set ${label} weight`}>
                {formatNum(set.weight)}
                <span className="setgrid__unit">{unit}</span>
              </button>
              <button type="button" className="setgrid__val" onClick={openReps} aria-label={`Set ${label} reps`}>
                {set.reps}
                <span className="setgrid__unit">reps</span>
              </button>
              <button type="button" className="set__check" aria-pressed={set.done} onClick={() => onLog(si)} aria-label={set.done ? 'Mark set not done' : 'Log set'}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5L20 7" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAddSet('work')}>
          + Add set
        </button>
        <span className="grow" />
        {allDone && !isLast ? (
          <button type="button" className="btn btn--primary btn--sm btn--pill" onClick={onNext}>
            Next exercise ›
          </button>
        ) : allDone && isLast ? (
          <span className="muted small">All done. Hit Finish.</span>
        ) : nextUp >= 0 ? (
          <span className="muted small">
            Up next: {entry.sets[nextUp].reps} × {formatWeight(entry.sets[nextUp].weight, unit)}
          </span>
        ) : null}
      </div>
      {plates !== null ? <PlateCalculator weight={plates} unit={unit} onClose={() => setPlates(null)} /> : null}
    </div>
  )
}
