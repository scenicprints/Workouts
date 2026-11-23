import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type Routine, type RoutineItem } from '../db'
import { useDefaultRest, useExerciseMap, useUnit } from '../hooks/useSettings'
import { ExercisePicker } from '../components/ExercisePicker'
import { NumberField } from '../components/NumberField'
import { newGroupId } from '../lib/superset'

export function RoutineEdit() {
  const { id } = useParams()
  // Load once; the editor below keeps its own draft state keyed on the record.
  const loaded = useLiveQuery(async () => {
    if (!id) return { name: '', items: [], createdAt: Date.now(), updatedAt: Date.now() } as Routine
    return (await db.routines.get(Number(id))) ?? null
  }, [id])
  if (loaded === undefined) return null
  if (loaded === null) return <div className="empty">Routine not found.</div>
  return <RoutineEditor key={loaded.id ?? 'new'} initial={loaded} />
}

function RoutineEditor({ initial }: { initial: Routine }) {
  const navigate = useNavigate()
  const unit = useUnit()
  const defaultRest = useDefaultRest()
  const exercises = useExerciseMap()
  const [routine, setRoutine] = useState<Routine>(initial)
  const [picking, setPicking] = useState(false)

  const step = unit === 'kg' ? 2.5 : 5
  const patchItem = (i: number, patch: Partial<RoutineItem>) => setRoutine({ ...routine, items: routine.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= routine.items.length) return
    const items = [...routine.items]
    ;[items[i], items[j]] = [items[j], items[i]]
    setRoutine({ ...routine, items })
  }
  function add(ex: Exercise) {
    setRoutine({ ...routine, items: [...routine.items, { exerciseId: ex.id!, sets: 3, reps: ex.bodyweight ? 10 : 8, restSec: defaultRest, weight: 0, increment: ex.bodyweight ? 0 : step }] })
    setPicking(false)
  }
  async function save() {
    const name = routine.name.trim() || 'Untitled routine'
    const now = Date.now()
    if (routine.id) {
      await db.routines.update(routine.id, { name, items: routine.items, notes: routine.notes, updatedAt: now })
    } else {
      await db.routines.add({ ...routine, name, updatedAt: now })
    }
    navigate('/library/routines', { replace: true })
  }
  async function remove() {
    const rid = routine.id
    if (!rid) return
    const plans = await db.plans.filter((p) => p.days.some((d) => d.routineId === rid)).count()
    if (plans > 0 && !confirm(`This routine is used in ${plans} plan${plans === 1 ? '' : 's'}. Those days will become rest days. Delete anyway?`)) return
    await db.transaction('rw', [db.routines, db.plans], async () => {
      const affected = await db.plans.filter((p) => p.days.some((d) => d.routineId === rid)).toArray()
      for (const p of affected) await db.plans.update(p.id!, { days: p.days.map((d) => (d.routineId === rid ? { ...d, routineId: null } : d)) })
      await db.routines.delete(rid)
    })
    navigate('/library/routines', { replace: true })
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{routine.id ? 'Edit routine' : 'New routine'}</h1>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>
            Save
          </button>
        </div>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={routine.name} onChange={(e) => setRoutine({ ...routine, name: e.target.value })} placeholder="e.g. Upper A" autoFocus={!routine.id} />
      </label>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea value={routine.notes ?? ''} onChange={(e) => setRoutine({ ...routine, notes: e.target.value })} placeholder="Warm-up, cues, anything you want to see before you start." />
      </label>

      {routine.items.map((item, i) => {
        const ex = exercises?.get(item.exerciseId)
        return (
          <div className="card" key={`${item.exerciseId}-${i}`}>
            <div className="item-row">
              <div>
                <h3 style={{ margin: 0 }}>{ex?.name ?? 'Exercise'}</h3>
                <span className="muted small">{ex?.muscle}</span>
              </div>
              <div className="row" style={{ gap: 2 }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => move(i, 1)} disabled={i === routine.items.length - 1} aria-label="Move down">
                  ↓
                </button>
                <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => setRoutine({ ...routine, items: routine.items.filter((_, j) => j !== i) })} aria-label="Remove">
                  ✕
                </button>
              </div>
            </div>
            {i < routine.items.length - 1 ? (
              <label className="check" style={{ marginTop: 8, borderBottom: 0, padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={!!item.group && item.group === routine.items[i + 1].group}
                  onChange={(e) => {
                    const next = routine.items[i + 1]
                    if (e.target.checked) {
                      const g = item.group ?? next.group ?? newGroupId()
                      setRoutine({ ...routine, items: routine.items.map((it, j) => (j === i || j === i + 1 ? { ...it, group: g } : it)) })
                    } else {
                      setRoutine({ ...routine, items: routine.items.map((it, j) => (j === i + 1 ? { ...it, group: undefined } : it)) })
                    }
                  }}
                />
                <span className="small muted">Superset with {exercises?.get(routine.items[i + 1].exerciseId)?.name ?? 'next'}</span>
              </label>
            ) : null}
            <div className="item-row__fields">
              <NumberField label="Sets" value={item.sets} onChange={(sets) => patchItem(i, { sets: Math.max(1, sets) })} min={1} compact integer />
              <NumberField label={item.minReps ? 'Top reps' : 'Reps'} value={item.reps} onChange={(reps) => patchItem(i, { reps: Math.max(1, reps), minReps: item.minReps && item.minReps < Math.max(1, reps) ? item.minReps : undefined })} min={1} compact integer />
              <NumberField label="Min reps" value={item.minReps ?? 0} onChange={(minReps) => patchItem(i, { minReps: minReps > 0 && minReps < item.reps ? minReps : undefined })} min={0} compact integer />
              <NumberField label="Rest" suffix="s" value={item.restSec} onChange={(restSec) => patchItem(i, { restSec })} step={15} compact integer />
              <NumberField label={`Start (${unit})`} value={item.weight} onChange={(weight) => patchItem(i, { weight })} step={step} compact />
              <NumberField label={`Step (${unit})`} value={item.increment} onChange={(increment) => patchItem(i, { increment })} step={unit === 'kg' ? 1.25 : 2.5} compact />
            </div>
          </div>
        )
      })}

      <button type="button" className="btn btn--block" onClick={() => setPicking(true)}>
        + Add exercise
      </button>
      <p className="muted small">
        Progression: hit the target reps on every set and the next time this routine runs the weight goes up by the “+ per win” amount. Miss, and it repeats; miss twice at the same weight and it drops 10%. Set “Min reps” for a rep range: reps climb from there to the top one at a time, then the weight goes up and reps start over. A start weight of 0 gets a suggestion from anything you have logged for that exercise.
      </p>
      {routine.id ? (
        <button type="button" className="btn btn--ghost btn--danger btn--block" onClick={remove}>
          Delete routine
        </button>
      ) : null}
      {picking ? <ExercisePicker onPick={add} onClose={() => setPicking(false)} /> : null}
    </div>
  )
}
