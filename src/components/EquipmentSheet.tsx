import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type Gear, type Unit } from '../db'
import { cleanLimits, equipmentStep, learnStep, loggedWeights } from '../lib/loadStep'
import { formatWeight } from '../lib/format'
import { NumberField } from './NumberField'

/**
 * Link an exercise to a piece of equipment set up once and shared: "Cable stack", "Dumbbells",
 * "Leg press". Pick one from the list to link it on the spot, or set one up here with its step,
 * lightest and heaviest weight. Anything left at 0 stays automatic: the step is learned from every
 * weight logged on that equipment, and there is no floor or ceiling. Changes apply from the next
 * session.
 */
export function EquipmentSheet({ exercise, unit, onClose }: { exercise: Exercise; unit: Unit; onClose: () => void }) {
  const gear = useLiveQuery(() => db.gear.orderBy('name').toArray(), []) ?? []
  const linked = useLiveQuery(async () => {
    const all = await db.exercises.toArray()
    const counts = new Map<number, number>()
    for (const e of all) if (e.gearId) counts.set(e.gearId, (counts.get(e.gearId) ?? 0) + 1)
    return counts
  }, [])
  const learned = useLiveQuery(async () => learnStep(loggedWeights(await db.sessions.toArray(), exercise.id!), unit), [exercise.id, unit])
  const [editing, setEditing] = useState<Gear | 'new' | null>(null)

  async function link(gearId: number | undefined) {
    await db.exercises.update(exercise.id!, { gearId })
  }

  const fallback = equipmentStep(exercise, unit)
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Equipment for ${exercise.name}`}>
        <div className="sheet__head">
          <h2>{editing ? (editing === 'new' ? 'New equipment' : editing.name) : exercise.name}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => (editing ? setEditing(null) : onClose())}>
            {editing ? 'Back' : 'Close'}
          </button>
        </div>
        {editing ? (
          <GearForm
            gear={editing === 'new' ? undefined : editing}
            unit={unit}
            linkedCount={editing === 'new' ? 0 : (linked?.get(editing.id!) ?? 0)}
            onSaved={async (id) => {
              if (editing === 'new') await link(id)
              setEditing(null)
            }}
            onDeleted={() => setEditing(null)}
          />
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              What is this exercise done on? Set a piece of equipment up once and every exercise linked to it shares its step, lightest and heaviest weight. Changes apply from the next session.
            </p>
            <ul className="list">
              <li>
                <button type="button" className="list__item" aria-pressed={!exercise.gearId} onClick={() => link(undefined)}>
                  <span className="list__title">{!exercise.gearId ? '● ' : '○ '}Automatic</span>
                  <span className="list__meta">{learned ? `step ${formatWeight(learned.step, unit)} learned from your log` : fallback > 0 ? `step ${formatWeight(fallback, unit)} until two different weights are logged` : 'no load on this exercise'}; no floor or ceiling</span>
                </button>
              </li>
              {gear.map((g) => {
                const l = cleanLimits(g)
                const n = linked?.get(g.id!) ?? 0
                const on = exercise.gearId === g.id
                return (
                  <li key={g.id} className="row" style={{ gap: 0 }}>
                    <button type="button" className="list__item grow" aria-pressed={on} onClick={() => link(g.id)}>
                      <span className="list__title">
                        {on ? '● ' : '○ '}
                        {g.name}
                      </span>
                      <span className="list__meta">
                        {l.step ? `${formatWeight(l.step, unit)} steps` : 'step learned'}
                        {l.min !== undefined ? ` · from ${formatWeight(l.min, unit)}` : ''}
                        {l.max !== undefined ? ` · up to ${formatWeight(l.max, unit)}` : ' · no max'}
                        {n ? ` · ${n} exercise${n === 1 ? '' : 's'}` : ''}
                      </span>
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`}>
                      Edit
                    </button>
                  </li>
                )
              })}
            </ul>
            <button type="button" className="btn btn--block" onClick={() => setEditing('new')}>
              + Set up equipment
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** The fields of one piece of equipment. Saving an existing one changes every exercise linked to it. */
function GearForm({ gear, unit, linkedCount, onSaved, onDeleted }: { gear: Gear | undefined; unit: Unit; linkedCount: number; onSaved: (id: number) => void | Promise<void>; onDeleted: () => void }) {
  const current = cleanLimits(gear)
  const [name, setName] = useState(gear?.name ?? '')
  const [step, setStep] = useState(current.step ?? 0)
  const [min, setMin] = useState(current.min ?? 0)
  const [max, setMax] = useState(current.max ?? 0)
  const [noMax, setNoMax] = useState(current.max === undefined)
  const nudge = unit === 'kg' ? 1.25 : 2.5
  const ceilingUnderFloor = !noMax && max > 0 && min > 0 && max < min

  async function save() {
    const n = name.trim()
    if (!n) return
    const limits = cleanLimits({ step: step || undefined, min: min || undefined, max: noMax ? undefined : max || undefined })
    const fields: Omit<Gear, 'id'> = { name: n, step: limits.step, min: limits.min, max: limits.max, createdAt: gear?.createdAt ?? Date.now() }
    if (gear?.id) {
      await db.gear.update(gear.id, fields)
      await onSaved(gear.id)
    } else {
      await onSaved((await db.gear.add(fields)) as number)
    }
  }
  async function remove() {
    if (!gear?.id) return
    if (!confirm(`Delete ${gear.name}?${linkedCount ? ` ${linkedCount} exercise${linkedCount === 1 ? ' goes' : 's go'} back to automatic.` : ''}`)) return
    await db.transaction('rw', db.gear, db.exercises, async () => {
      await db.exercises.where('gearId').equals(gear.id!).modify({ gearId: undefined })
      await db.gear.delete(gear.id!)
    })
    onDeleted()
  }

  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Cable stack" aria-label="Equipment name" autoFocus={!gear} />
      <div className="row">
        <NumberField label={`Step (${unit})`} value={step} onChange={setStep} step={nudge} compact />
        <NumberField label={`Min (${unit})`} value={min} onChange={setMin} step={step || nudge} compact />
        <NumberField label={noMax ? 'Max' : `Max (${unit})`} value={noMax ? 0 : max} onChange={(v) => { setMax(v); setNoMax(false) }} step={step || nudge} compact />
      </div>
      <label className="check">
        <input type="checkbox" checked={noMax} onChange={(e) => setNoMax(e.target.checked)} />
        No maximum (infinite)
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        {step > 0 ? `Weights move in ${formatWeight(step, unit)} steps.` : 'Step left at 0: learned from every weight logged on this equipment.'}
        {noMax ? ' No ceiling: weight keeps climbing.' : max > 0 ? ` At ${formatWeight(max, unit)} the weight stops and reps climb instead.` : ''}
        {min > 0 ? ` Never below ${formatWeight(min, unit)}.` : ''}
        {linkedCount > 1 ? ` Applies to all ${linkedCount} exercises on it.` : ''}
      </p>
      {ceilingUnderFloor ? <p className="small" style={{ margin: 0, color: 'var(--danger)' }}>Max is below min; the max will be ignored.</p> : null}
      <div className="row">
        <button type="button" className="btn btn--primary grow" onClick={save} disabled={!name.trim()}>
          {gear ? 'Save' : 'Save and link'}
        </button>
        {gear ? (
          <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
            Delete
          </button>
        ) : null}
      </div>
    </>
  )
}
