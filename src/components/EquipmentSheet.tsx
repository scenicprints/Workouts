import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type LoadLimits, type Unit } from '../db'
import { cleanLimits, equipmentStep, learnStep, loggedWeights } from '../lib/loadStep'
import { formatWeight } from '../lib/format'
import { NumberField } from './NumberField'

/**
 * Set what the equipment for an exercise can load: its lightest and heaviest weight and what one
 * notch moves it by. Anything left blank stays automatic: the step is learned from the log, and
 * there is no floor or ceiling. Saved on the exercise, so it applies in every routine from the
 * next session on.
 */
export function EquipmentSheet({ exercise, unit, onClose }: { exercise: Exercise; unit: Unit; onClose: () => void }) {
  const current = cleanLimits(exercise.load)
  const [min, setMin] = useState(current.min ?? 0)
  const [max, setMax] = useState(current.max ?? 0)
  const [noMax, setNoMax] = useState(current.max === undefined)
  const [step, setStep] = useState(current.step ?? 0)
  const learned = useLiveQuery(async () => learnStep(loggedWeights(await db.sessions.toArray(), exercise.id!), unit), [exercise.id, unit])
  const fallback = equipmentStep(exercise, unit)
  const nudge = unit === 'kg' ? 1.25 : 2.5

  async function save() {
    const load: LoadLimits = cleanLimits({ min: min || undefined, max: noMax ? undefined : max || undefined, step: step || undefined })
    await db.exercises.update(exercise.id!, { load: Object.keys(load).length ? load : undefined })
    onClose()
  }
  async function clear() {
    await db.exercises.update(exercise.id!, { load: undefined })
    onClose()
  }

  const ceilingUnderFloor = !noMax && max > 0 && min > 0 && max < min
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Equipment for ${exercise.name}`}>
        <div className="sheet__head">
          <h2>{exercise.name}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          What this equipment can load. Leave a field at 0 to keep it automatic. Changes apply from the next session.
        </p>
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
          {step > 0 ? `Weights move in ${formatWeight(step, unit)} steps.` : learned ? `Step left automatic: learned ${formatWeight(learned.step, unit)} from your log.` : `Step left automatic: ${fallback > 0 ? `${formatWeight(fallback, unit)} until two different weights are logged` : 'no load on this exercise'}.`}
          {noMax ? ' No ceiling: weight keeps climbing.' : max > 0 ? ` At ${formatWeight(max, unit)} the weight stops and reps climb instead.` : ''}
          {min > 0 ? ` Never below ${formatWeight(min, unit)}.` : ''}
        </p>
        {ceilingUnderFloor ? <p className="small" style={{ margin: 0, color: 'var(--danger)' }}>Max is below min; the max will be ignored.</p> : null}
        <div className="row">
          <button type="button" className="btn btn--primary grow" onClick={save}>
            Save
          </button>
          {exercise.load ? (
            <button type="button" className="btn btn--ghost" onClick={clear}>
              Back to automatic
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
