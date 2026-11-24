import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, Link2, MoreHorizontal } from 'lucide-react'
import { db, type Exercise, type Gear, type Session, type SessionEntry, type SetEntry, type Unit } from '../db'
import { useDefaultRest, useExerciseMap, useRestTimerEnabled, useUnit } from '../hooks/useSettings'
import { restTimer } from '../hooks/useRestTimer'
import { discardSession, finishSession, nextPlanWorkout, startEmptySession, startRoutineSession } from '../lib/sessions'
import { latestEntryFor, roundToPlate } from '../lib/progression'
import { formatDuration, formatWeight } from '../lib/format'
import { ExercisePicker } from '../components/ExercisePicker'
import { NumberField } from '../components/NumberField'
import { closePad, openPad } from '../lib/pad'
import { PlateCalculator } from '../components/PlateCalculator'
import { EquipmentSheet } from '../components/EquipmentSheet'
import { onSessionFinished } from '../lib/health'
import { groupEntries, interleaveSets, newGroupId } from '../lib/superset'

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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const [linking, setLinking] = useState<number | null>(null)
  const [open, setOpen] = useState(() => firstUnfinished(session))
  const [now, setNow] = useState(() => Date.now())
  const history = useLiveQuery(() => db.sessions.filter((s) => !!s.finishedAt).toArray(), []) ?? NO_SESSIONS
  const gearById = useLiveQuery(async () => new Map((await db.gear.toArray()).map((g) => [g.id!, g])), [])

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
  /** Put two entries in the same superset. Joins an existing group if either has one. */
  function linkSuperset(ei: number, other: number) {
    const g = session.entries[ei].group ?? session.entries[other].group ?? newGroupId()
    void save(session.entries.map((e, i) => (i === ei || i === other ? { ...e, group: g } : e)))
    setLinking(null)
  }
  function unlinkSuperset(ei: number) {
    void save(session.entries.map((e, i) => (i === ei ? { ...e, group: undefined } : e)))
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
  const blocks = groupEntries(session.entries)
  const name = (ei: number) => exercises?.get(session.entries[ei].exerciseId)?.name ?? 'Exercise'

  const panelProps = (ei: number) => ({
    entry: session.entries[ei],
    exercise: exercises?.get(session.entries[ei].exerciseId),
    gear: gearById?.get(exercises?.get(session.entries[ei].exerciseId)?.gearId ?? -1),
    unit,
    previous: latestEntryFor(history, session.entries[ei].exerciseId),
    timerOn,
    onLog: (si: number) => logSet(ei, si),
    onUpdate: (si: number, patch: Partial<SetEntry>) => updateSet(ei, si, patch),
    onAddSet: (kind?: 'work' | 'warmup') => addSet(ei, kind),
    onRemoveSet: (si: number) => removeSet(ei, si),
    onRemove: () => removeExercise(ei),
    onRest: (r: number) => setRest(ei, r),
    onSwap: () => setPicking(ei),
    onSuperset: () => setLinking(ei),
    onUnlink: session.entries[ei].group ? () => unlinkSuperset(ei) : undefined,
  })

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
            {session.readiness ? (
              <>
                <span className="session-head__dot" />
                <span title={session.readiness.reasons.join('\n')}>{session.readiness.earlyDeload ? 'Early deload' : `Readiness ${session.readiness.level}`}</span>
              </>
            ) : null}
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

      {blocks.map((block) => {
        const isOpen = block.indices.includes(open)
        const key = block.indices.join('-')
        if (!isOpen) {
          const work = block.indices.flatMap((ei) => session.entries[ei].sets.filter((s) => s.kind !== 'warmup'))
          const done = work.filter((s) => s.done).length
          const complete = work.length > 0 && done === work.length
          const first = session.entries[block.indices[0]].sets.filter((s) => s.kind !== 'warmup')[0]
          return (
            <button key={key} type="button" className="card exercise--pending" onClick={() => setOpen(block.indices[0])} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="exercise__title">{block.indices.map(name).join(' + ')}</span>
                <span className="muted small">
                  {block.group ? 'Superset · ' : ''}
                  {complete ? `Done · ${done} sets` : `${work.length} sets${first ? ` · ${first.reps} × ${formatWeight(first.weight, unit)}` : ''}${done ? ` · ${done} done` : ''}`}
                </span>
              </span>
              {complete ? (
                <span className="set__check" aria-pressed="true" style={{ width: 32, height: 32 }}>
                  <Check size={16} strokeWidth={2} />
                </span>
              ) : (
                <ChevronDown size={18} className="muted" />
              )}
            </button>
          )
        }
        if (block.group) {
          return <SupersetPanel key={key} panels={block.indices.map(panelProps)} names={block.indices.map(name)} />
        }
        return <ExercisePanel key={key} {...panelProps(block.indices[0])} />
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
      {linking !== null ? (
        <div className="sheet-backdrop" onClick={() => setLinking(null)} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Superset with">
            <div className="sheet__head">
              <h2>Superset {name(linking)} with…</h2>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLinking(null)}>
                Close
              </button>
            </div>
            <ul className="list">
              {session.entries.map((e, i) =>
                i === linking ? null : (
                  <li key={i}>
                    <button type="button" className="list__item" onClick={() => linkSuperset(linking, i)}>
                      <span className="list__title">{name(i)}</span>
                      <span className="list__meta">
                        {e.sets.filter((s) => s.kind !== 'warmup').length} sets{e.group ? ' · already in a superset' : ''}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
            {session.entries.length < 2 ? <p className="muted small">Add another exercise first.</p> : null}
          </div>
        </div>
      ) : null}
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
  /** The equipment the exercise is linked to, when any. */
  gear: Gear | undefined
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
  onSuperset: () => void
  onUnlink?: () => void
}

/** Labels for each set (W1, W2, 1, 2…) and the matching set from last time. */
function labelSets(entry: SessionEntry, previous: SessionEntry | undefined) {
  const prevWork = previous?.sets.filter((s) => s.kind !== 'warmup') ?? []
  const out: { label: string; prev: SetEntry | undefined }[] = []
  for (let work = 0, warm = 0, i = 0; i < entry.sets.length; i++) {
    if (entry.sets[i].kind === 'warmup') out.push({ label: `W${++warm}`, prev: undefined })
    else out.push({ label: `${++work}`, prev: prevWork[work - 1] })
  }
  return { labels: out, prevWork }
}

function SetRowView({ p, si, label, prev, prefix }: { p: PanelProps; si: number; label: string; prev: SetEntry | undefined; prefix?: string }) {
  const set = p.entry.sets[si]
  const unit = p.unit
  // Nudge by what this equipment moves in (set on the gear, else learned from the log), not a generic plate.
  const step = p.gear?.step || p.entry.increment || (unit === 'kg' ? 2.5 : 5)
  const nextUp = p.entry.sets.findIndex((s) => !s.done)
  const isWarm = set.kind === 'warmup'
  const isNext = si === nextUp
  const hint = prev ? `${formatNum(prev.weight)} × ${prev.reps}` : set.targetWeight ? `${formatNum(set.targetWeight)} × ${set.targetReps}` : isWarm ? 'warm-up' : '—'
  const chips = [prev ? { label: `${formatNum(prev.weight)} · last`, value: prev.weight } : null, set.targetWeight && set.targetWeight !== prev?.weight ? { label: `${formatNum(set.targetWeight)} · target`, value: set.targetWeight } : null].filter(Boolean) as { label: string; value: number }[]
  const openReps = () =>
    openPad({
      value: set.reps,
      label: `${prefix ?? ''}Set ${label} · reps`,
      step: 1,
      allowDecimal: false,
      onChange: (reps) => p.onUpdate(si, { reps }),
      chips: prev ? [{ label: `${prev.reps} · last`, value: prev.reps }] : undefined,
      primary: {
        label: set.done ? 'Done' : 'Log set',
        onPress: () => {
          closePad()
          if (!set.done) p.onLog(si)
        },
      },
    })
  const openWeight = () =>
    openPad({
      value: set.weight,
      label: `${prefix ?? ''}Set ${label} · ${unit}`,
      unit,
      step,
      allowDecimal: true,
      onChange: (weight) => p.onUpdate(si, { weight }),
      chips: chips.length ? chips : undefined,
      primary: { label: 'Next', onPress: openReps },
    })
  return (
    <div className={`setgrid__row${set.done ? ' setgrid__row--done' : ''}${isNext ? ' setgrid__row--next' : ''}${isWarm ? ' setgrid__row--warm' : ''}`} role="row">
      <button type="button" className="setgrid__num" onClick={() => p.onRemoveSet(si)} title="Remove set" aria-label={`Remove set ${label}`}>
        {prefix}
        {label}
      </button>
      <button type="button" className="setgrid__prev" onClick={() => prev && p.onUpdate(si, { weight: prev.weight, reps: prev.reps })} disabled={!prev} title={prev ? 'Use last time' : undefined}>
        {hint}
      </button>
      <button type="button" className="setgrid__val" onClick={openWeight} aria-label={`${prefix ?? ''}Set ${label} weight`}>
        {formatNum(set.weight)}
      </button>
      <button type="button" className="setgrid__val" onClick={openReps} aria-label={`${prefix ?? ''}Set ${label} reps`}>
        {set.reps}
      </button>
      <button type="button" className="set__check" aria-pressed={set.done} onClick={() => p.onLog(si)} aria-label={set.done ? 'Mark set not done' : 'Log set'}>
        <Check size={20} strokeWidth={2} />
      </button>
    </div>
  )
}

function ExerciseMenu({ p, open, onToggle, onPlates, onEquipment }: { p: PanelProps; open: boolean; onToggle: () => void; onPlates: () => void; onEquipment: () => void }) {
  return (
    <>
      <button type="button" className="btn btn--icon" onClick={onToggle} aria-label="Exercise options" aria-expanded={open}>
        <MoreHorizontal size={20} />
      </button>
      {open ? (
        <div className="row" style={{ marginBottom: 12, width: '100%' }}>
          {p.timerOn ? <NumberField label="Rest" suffix="s" value={p.entry.restSec} onChange={p.onRest} step={15} compact integer /> : null}
          <button type="button" className="btn btn--sm" onClick={() => p.onAddSet('warmup')}>
            + Warm-up
          </button>
          <button type="button" className="btn btn--sm" onClick={p.onSwap}>
            Swap
          </button>
          {p.onUnlink ? (
            <button type="button" className="btn btn--sm" onClick={p.onUnlink}>
              Break superset
            </button>
          ) : (
            <button type="button" className="btn btn--sm" onClick={p.onSuperset}>
              <Link2 size={14} /> Superset
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={onPlates}>
            Plates
          </button>
          {p.exercise ? (
            <button type="button" className="btn btn--sm" onClick={onEquipment}>
              Equipment
            </button>
          ) : null}
          <button type="button" className="btn btn--sm btn--danger" onClick={p.onRemove}>
            Remove
          </button>
        </div>
      ) : null}
    </>
  )
}

function ExercisePanel(p: PanelProps) {
  const [menu, setMenu] = useState(false)
  const [plates, setPlates] = useState<number | null>(null)
  const [equip, setEquip] = useState(false)
  const { labels, prevWork } = labelSets(p.entry, p.previous)
  const nextUp = p.entry.sets.findIndex((s) => !s.done)
  return (
    <div className="card card--exercise">
      <div className="exercise__head">
        <div style={{ minWidth: 0 }}>
          <h2 className="exercise__title">
            <Link to={`/exercises/${p.entry.exerciseId}`}>{p.exercise?.name ?? 'Exercise'}</Link>
          </h2>
          <span className="muted small">
            {[p.exercise?.muscle, p.timerOn ? `rest ${p.entry.restSec}s` : null, prevWork.length ? `last ${prevWork.map((s) => `${formatNum(s.weight)}×${s.reps}`).join(', ')}` : null].filter(Boolean).join(' · ')}
          </span>
          {p.entry.note ? <span className="small" style={{ display: 'block' }}>{p.entry.note}</span> : null}
        </div>
        <ExerciseMenu p={p} open={false} onToggle={() => setMenu((m) => !m)} onPlates={() => setPlates(p.entry.sets[nextUp === -1 ? p.entry.sets.length - 1 : nextUp]?.weight ?? 0)} onEquipment={() => setEquip(true)} />
      </div>
      {menu ? <ExerciseMenu p={p} open onToggle={() => setMenu(false)} onPlates={() => setPlates(p.entry.sets[nextUp === -1 ? p.entry.sets.length - 1 : nextUp]?.weight ?? 0)} onEquipment={() => setEquip(true)} /> : null}
      {equip && p.exercise ? <EquipmentSheet exercise={p.exercise} unit={p.unit} onClose={() => setEquip(false)} /> : null}

      <div className="setgrid" role="table">
        <div className="setgrid__head" role="row">
          <span>Set</span>
          <span>Previous</span>
          <span>{p.unit}</span>
          <span>Reps</span>
          <span />
        </div>
        {p.entry.sets.map((_, si) => (
          <SetRowView key={si} p={p} si={si} label={labels[si].label} prev={labels[si].prev} />
        ))}
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn--ghost btn--sm" style={{ paddingInline: 0 }} onClick={() => p.onAddSet('work')}>
          + Add set
        </button>
      </div>
      {plates !== null ? <PlateCalculator weight={plates} unit={p.unit} onClose={() => setPlates(null)} /> : null}
    </div>
  )
}

/** Two or more exercises alternating set by set: A1, B1, A2, B2… */
function SupersetPanel({ panels, names }: { panels: PanelProps[]; names: string[] }) {
  const [menu, setMenu] = useState<number | null>(null)
  const [plates, setPlates] = useState<number | null>(null)
  const [equip, setEquip] = useState<number | null>(null)
  const letters = 'ABCDEF'
  const labelled = panels.map((p) => labelSets(p.entry, p.previous))
  const order = interleaveSets(panels.map((p) => p.entry.sets.length))
  return (
    <div className="card card--exercise">
      <div className="section--eyebrow section" style={{ marginBottom: 8 }}>
        Superset
      </div>
      {panels.map((p, i) => (
        <div key={i} className="exercise__head" style={{ marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="exercise__title" style={{ fontSize: '1.05rem' }}>
              <span className="muted">{letters[i]} </span>
              <Link to={`/exercises/${p.entry.exerciseId}`}>{names[i]}</Link>
            </h2>
            <span className="muted small">{labelled[i].prevWork.length ? `last ${labelled[i].prevWork.map((s) => `${formatNum(s.weight)}×${s.reps}`).join(', ')}` : p.exercise?.muscle}</span>
            {p.entry.note ? <span className="small" style={{ display: 'block' }}>{p.entry.note}</span> : null}
          </div>
          <ExerciseMenu p={p} open={false} onToggle={() => setMenu((m) => (m === i ? null : i))} onPlates={() => setPlates(p.entry.sets.find((s) => !s.done)?.weight ?? 0)} onEquipment={() => setEquip(i)} />
        </div>
      ))}
      {menu !== null ? <ExerciseMenu p={panels[menu]} open onToggle={() => setMenu(null)} onPlates={() => setPlates(panels[menu].entry.sets.find((s) => !s.done)?.weight ?? 0)} onEquipment={() => setEquip(menu)} /> : null}
      {equip !== null && panels[equip]?.exercise ? <EquipmentSheet exercise={panels[equip].exercise!} unit={panels[equip].unit} onClose={() => setEquip(null)} /> : null}

      <div className="setgrid" role="table">
        <div className="setgrid__head" role="row">
          <span>Set</span>
          <span>Previous</span>
          <span>{panels[0].unit}</span>
          <span>Reps</span>
          <span />
        </div>
        {order.map(({ entry, set }) => (
          <SetRowView key={`${entry}-${set}`} p={panels[entry]} si={set} label={labelled[entry].labels[set].label} prev={labelled[entry].labels[set].prev} prefix={letters[entry]} />
        ))}
      </div>

      <div className="row" style={{ marginTop: 8, gap: 12 }}>
        {panels.map((p, i) => (
          <button key={i} type="button" className="btn btn--ghost btn--sm" style={{ paddingInline: 0 }} onClick={() => p.onAddSet('work')}>
            + Set {letters[i]}
          </button>
        ))}
      </div>
      {plates !== null ? <PlateCalculator weight={plates} unit={panels[0].unit} onClose={() => setPlates(null)} /> : null}
    </div>
  )
}
