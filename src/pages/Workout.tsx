import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, MoreHorizontal } from 'lucide-react'
import { db, type Exercise, type Session, type SessionEntry, type SetEntry, type Unit } from '../db'
import { useDefaultRest, useExerciseMap, useRestTimerEnabled, useUnit } from '../hooks/useSettings'
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
        <h1>Workout</h1>
      </div>
      {next && !next.complete && next.routine ? (
        <div className="hero">
          <div className="hero__eyebrow">
            {next.plan.name} · Week {next.week}
          </div>
          <div className="hero__title">{next.routine.name}</div>
          <div className="hero__meta">
            {next.label} · {next.routine.items.length} exercises
            {next.isDeload ? ' · deload week' : ''}
          </div>
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => startRoutineSession(next.routine!, { plan: next.plan, unit })}>
            Start workout
            <Arrow />
          </button>
        </div>
      ) : null}
      <div>
        <div className="section">Routines</div>
        {routines.length === 0 ? (
          <div className="empty">
            No routines yet. <Link to="/generate">Generate a program</Link> or <Link to="/routines/new">build one</Link>.
          </div>
        ) : (
          <ul className="list">
            {routines.map((r) => (
              <li key={r.id}>
                <button type="button" className="list__item" onClick={() => startRoutineSession(r, { unit })}>
                  <span className="list__title">{r.name}</span>
                  <span className="list__meta">{r.items.length} exercises</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn btn--block" onClick={() => startEmptySession()}>
        Start an empty workout
      </button>
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

function ActiveWorkout({ session }: { session: Session }) {
  const navigate = useNavigate()
  const unit = useUnit()
  const defaultRest = useDefaultRest()
  const timerOn = useRestTimerEnabled()
  const exercises = useExerciseMap()
  const [picking, setPicking] = useState<'add' | number | null>(null)
  const [open, setOpen] = useState(() => firstUnfinished(session))
  const [now, setNow] = useState(() => Date.now())
  const history = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt).toArray(), []) ?? NO_SESSIONS

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const id = session.id!
  const save = (entries: SessionEntry[]) => db.sessions.update(id, { entries })

  function updateSet(ei: number, si: number, patch: Partial<SetEntry>) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e)))
  }
  /** Log a set: mark done and let untouched upcoming sets follow what you just did. */
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
    if (done && timerOn) restTimer.start(set.kind === 'warmup' ? Math.min(60, e.restSec || defaultRest) : e.restSec || defaultRest)
    // When the last set of an exercise is logged, open the next unfinished one.
    if (done && sets.every((s) => s.done)) {
      const next = session.entries.findIndex((x, i) => i > ei && x.sets.some((s) => !s.done))
      if (next !== -1) setOpen(next)
    }
  }
  function addSet(ei: number, kind: 'work' | 'warmup' = 'work') {
    const e = session.entries[ei]
    const work = e.sets.filter((s) => s.kind !== 'warmup')
    const last = work[work.length - 1]
    if (kind === 'warmup') {
      const target = Math.max(0, ...work.map((s) => s.weight), ...work.map((s) => s.targetWeight ?? 0))
      const n = e.sets.filter((s) => s.kind === 'warmup').length
      const pct = [0.4, 0.6, 0.8][n] ?? 0.9
      const next: SetEntry = { reps: n === 0 ? 8 : 5, weight: roundToPlate(target * pct, unit), done: false, kind: 'warmup' }
      const warmups = e.sets.filter((s) => s.kind === 'warmup')
      void save(session.entries.map((x, i) => (i === ei ? { ...x, sets: [...warmups, next, ...work] } : x)))
      return
    }
    const next: SetEntry = last ? { ...last, done: false } : { reps: 8, weight: 0, done: false, kind: 'work' }
    void save(session.entries.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, next] } : x)))
  }
  function removeSet(ei: number, si: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)))
  }
  function removeExercise(ei: number) {
    void save(session.entries.filter((_, i) => i !== ei))
    setOpen((o) => Math.max(0, Math.min(o, session.entries.length - 2)))
  }
  function setRest(ei: number, restSec: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, restSec } : e)))
  }
  function addExercise(ex: Exercise) {
    const prev = latestEntryFor(history, ex.id!)
    const template = prev?.sets.filter((s) => s.kind !== 'warmup').at(-1)
    const sets: SetEntry[] = Array.from({ length: prev?.sets.filter((s) => s.kind !== 'warmup').length || 3 }, () => ({ reps: template?.reps ?? 8, weight: template?.weight ?? 0, done: false, kind: 'work' }))
    void save([...session.entries, { exerciseId: ex.id!, restSec: prev?.restSec ?? defaultRest, increment: prev?.increment ?? (unit === 'kg' ? 2.5 : 5), sets }])
    setPicking(null)
    setOpen(session.entries.length)
  }
  function swapExercise(ei: number, ex: Exercise) {
    const prev = latestEntryFor(history, ex.id!)
    const template = prev?.sets.filter((s) => s.kind !== 'warmup').at(-1)
    void save(
      session.entries.map((e, i) =>
        i === ei
          ? { ...e, exerciseId: ex.id!, increment: prev?.increment ?? e.increment, sets: e.sets.map((s) => (s.done ? s : { ...s, weight: template?.weight ?? 0, reps: template?.reps ?? s.reps, targetWeight: template?.weight ?? 0, targetReps: template?.reps ?? s.targetReps })) }
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
  const swapping = typeof picking === 'number' ? session.entries[picking] : null
  const swapMuscle = swapping ? exercises?.get(swapping.exerciseId)?.muscle : undefined

  return (
    <div className="stack">
      <div className="session-head">
        <div>
          <div className="session-head__clock">{formatDuration(now - session.startedAt)}</div>
          <div className="session-head__meta">
            <span>{session.name}</span>
            <span className="session-head__dot" />
            <span>
              {doneSets} of {totalSets} sets
            </span>
          </div>
        </div>
        <button type="button" className="btn btn--primary" onClick={finish}>
          Finish
        </button>
      </div>
      <div className="session-progress" aria-hidden="true">
        <div style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
      </div>

      {session.entries.length === 0 ? <div className="empty">Add an exercise to get going.</div> : null}

      {session.entries.map((entry, ei) => {
        const ex = exercises?.get(entry.exerciseId)
        const work = entry.sets.filter((s) => s.kind !== 'warmup')
        const done = work.filter((s) => s.done).length
        const complete = work.length > 0 && done === work.length
        if (ei !== open) {
          const first = work[0]
          return (
            <button key={`${entry.exerciseId}-${ei}`} type="button" className="card exercise--pending" onClick={() => setOpen(ei)} style={{ textAlign: 'left', border: 0, cursor: 'pointer', font: 'inherit' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="exercise__title">{ex?.name ?? 'Exercise'}</span>
                <span className="muted small">
                  {complete ? `Done · ${work.map((s) => `${formatNum(s.weight)}×${s.reps}`).join(', ')}` : `${work.length} × ${first?.reps ?? '–'} · ${first ? formatWeight(first.weight, unit) : ''}${done ? ` · ${done} of ${work.length} done` : ''}`}
                </span>
              </span>
              {complete ? (
                <span className="set__check" aria-pressed="true" style={{ width: 36, height: 36 }}>
                  <Check size={16} strokeWidth={2} />
                </span>
              ) : (
                <ChevronDown size={20} className="muted" />
              )}
            </button>
          )
        }
        return (
          <ExercisePanel
            key={`${entry.exerciseId}-${ei}`}
            entry={entry}
            exercise={ex}
            unit={unit}
            previous={latestEntryFor(history, entry.exerciseId)}
            timerOn={timerOn}
            onLog={(si) => logSet(ei, si)}
            onUpdate={(si, patch) => updateSet(ei, si, patch)}
            onAddSet={(kind) => addSet(ei, kind)}
            onRemoveSet={(si) => removeSet(ei, si)}
            onRemove={() => removeExercise(ei)}
            onRest={(r) => setRest(ei, r)}
            onSwap={() => setPicking(ei)}
          />
        )
      })}

      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <button type="button" className="btn" onClick={() => setPicking('add')}>
          + Add exercise
        </button>
        <button type="button" className="btn btn--ghost btn--danger btn--sm" onClick={discard}>
          Discard
        </button>
      </div>

      {picking === 'add' ? <ExercisePicker onPick={addExercise} onClose={() => setPicking(null)} /> : null}
      {swapping ? <ExercisePicker title="Swap exercise" prefer={(e) => e.muscle === swapMuscle} excludeId={swapping.exerciseId} onPick={(ex) => swapExercise(picking as number, ex)} onClose={() => setPicking(null)} /> : null}
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
  timerOn: boolean
  onLog: (si: number) => void
  onUpdate: (si: number, patch: Partial<SetEntry>) => void
  onAddSet: (kind?: 'work' | 'warmup') => void
  onRemoveSet: (si: number) => void
  onRemove: () => void
  onRest: (sec: number) => void
  onSwap: () => void
}

function ExercisePanel({ entry, exercise, unit, previous, timerOn, onLog, onUpdate, onAddSet, onRemoveSet, onRemove, onRest, onSwap }: PanelProps) {
  const [menu, setMenu] = useState(false)
  const [plates, setPlates] = useState<number | null>(null)
  const step = unit === 'kg' ? 2.5 : 5
  const prevWork = previous?.sets.filter((s) => s.kind !== 'warmup') ?? []
  const nextUp = entry.sets.findIndex((s) => !s.done)
  const labels: { label: string; prev: SetEntry | undefined }[] = []
  for (let work = 0, warm = 0, i = 0; i < entry.sets.length; i++) {
    if (entry.sets[i].kind === 'warmup') labels.push({ label: `W${++warm}`, prev: undefined })
    else labels.push({ label: `${++work}`, prev: prevWork[work - 1] })
  }
  return (
    <div className="card card--exercise">
      <div className="exercise__head">
        <div style={{ minWidth: 0 }}>
          <h2 className="exercise__title">
            <Link to={`/exercises/${entry.exerciseId}`}>{exercise?.name ?? 'Exercise'}</Link>
          </h2>
          <span className="muted small">
            {[exercise?.muscle, timerOn ? `rest ${entry.restSec}s` : null, prevWork.length ? `last ${prevWork.map((s) => `${formatNum(s.weight)}×${s.reps}`).join(', ')}` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button type="button" className="btn btn--icon" onClick={() => setMenu((m) => !m)} aria-label="Exercise options" aria-expanded={menu}>
          <MoreHorizontal size={20} />
        </button>
      </div>
      {menu ? (
        <div className="row" style={{ marginBottom: 12, padding: '0 4px' }}>
          {timerOn ? <NumberField label="Rest" suffix="s" value={entry.restSec} onChange={onRest} step={15} compact integer /> : null}
          <button type="button" className="btn btn--sm" onClick={() => onAddSet('warmup')}>
            + Warm-up
          </button>
          <button type="button" className="btn btn--sm" onClick={onSwap}>
            Swap
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setPlates(entry.sets[nextUp === -1 ? entry.sets.length - 1 : nextUp]?.weight ?? 0)}>
            Plates
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : null}

      <div className="setgrid" role="table">
        <div className="setgrid__head" role="row">
          <span>Set</span>
          <span>Previous</span>
          <span>{unit}</span>
          <span>Reps</span>
          <span />
        </div>
        {entry.sets.map((set, si) => {
          const isWarm = set.kind === 'warmup'
          const { label, prev } = labels[si]
          const isNext = si === nextUp
          const hint = prev ? `${formatNum(prev.weight)} × ${prev.reps}` : set.targetWeight ? `${formatNum(set.targetWeight)} × ${set.targetReps}` : isWarm ? 'warm-up' : '—'
          const chips = [prev ? { label: `${formatNum(prev.weight)} · last`, value: prev.weight } : null, set.targetWeight && set.targetWeight !== prev?.weight ? { label: `${formatNum(set.targetWeight)} · target`, value: set.targetWeight } : null].filter(Boolean) as { label: string; value: number }[]
          const openReps = () =>
            openPad({
              value: set.reps,
              label: `Set ${label} · reps`,
              step: 1,
              allowDecimal: false,
              onChange: (reps) => onUpdate(si, { reps }),
              chips: prev ? [{ label: `${prev.reps} · last`, value: prev.reps }] : undefined,
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
              chips: chips.length ? chips : undefined,
              primary: { label: 'Next', onPress: openReps },
            })
          return (
            <div key={si} className={`setgrid__row${set.done ? ' setgrid__row--done' : ''}${isNext ? ' setgrid__row--next' : ''}${isWarm ? ' setgrid__row--warm' : ''}`} role="row">
              <button type="button" className="setgrid__num" onClick={() => onRemoveSet(si)} title="Remove set" aria-label={`Remove set ${label}`}>
                {label}
              </button>
              <button type="button" className="setgrid__prev" onClick={() => prev && onUpdate(si, { weight: prev.weight, reps: prev.reps })} disabled={!prev} title={prev ? 'Use last time' : undefined}>
                {hint}
              </button>
              <button type="button" className="setgrid__val" onClick={openWeight} aria-label={`Set ${label} weight`}>
                {formatNum(set.weight)}
              </button>
              <button type="button" className="setgrid__val" onClick={openReps} aria-label={`Set ${label} reps`}>
                {set.reps}
              </button>
              <button type="button" className="set__check" aria-pressed={set.done} onClick={() => onLog(si)} aria-label={set.done ? 'Mark set not done' : 'Log set'}>
                <Check size={20} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 8, padding: '0 4px' }}>
        <button type="button" className="btn btn--ghost btn--sm" style={{ paddingInline: 4 }} onClick={() => onAddSet('work')}>
          + Add set
        </button>
      </div>
      {plates !== null ? <PlateCalculator weight={plates} unit={unit} onClose={() => setPlates(null)} /> : null}
    </div>
  )
}
