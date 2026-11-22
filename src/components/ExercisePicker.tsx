import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise } from '../db'

interface Props {
  onPick: (exercise: Exercise) => void
  onClose: () => void
  title?: string
}

const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Other']
const NONE: Exercise[] = []

export function ExercisePicker({ onPick, onClose, title = 'Add exercise' }: Props) {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? NONE
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMuscle, setNewMuscle] = useState('Other')
  const [newBodyweight, setNewBodyweight] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return exercises
    return exercises.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q))
  }, [exercises, query])

  async function create() {
    const name = newName.trim()
    if (!name) return
    const id = await db.exercises.add({ name, muscle: newMuscle, equipment: newBodyweight ? 'Bodyweight' : 'Other', bodyweight: newBodyweight, custom: true, createdAt: Date.now() })
    const ex = await db.exercises.get(id)
    if (ex) onPick(ex)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        {creating ? (
          <div className="stack">
            <label className="field">
              <span>Name</span>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cable Fly" />
            </label>
            <label className="field">
              <span>Muscle group</span>
              <select value={newMuscle} onChange={(e) => setNewMuscle(e.target.value)}>
                {MUSCLES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={newBodyweight} onChange={(e) => setNewBodyweight(e.target.checked)} />
              <span>Bodyweight exercise</span>
            </label>
            <div className="row">
              <button type="button" className="btn btn--primary" onClick={create} disabled={!newName.trim()}>
                Create and add
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setCreating(false)}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <>
            <input className="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
            <ul className="list list--scroll">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button type="button" className="list__item" onClick={() => onPick(e)}>
                    <span className="list__title">{e.name}</span>
                    <span className="list__meta">
                      {e.muscle} · {e.equipment}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? <li className="muted pad">No matches.</li> : null}
            </ul>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setNewName(query.trim())
                setCreating(true)
              }}
            >
              + New custom exercise
            </button>
          </>
        )}
      </div>
    </div>
  )
}
