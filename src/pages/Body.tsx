import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyEntry } from '../db'
import { useUnit } from '../hooks/useSettings'
import { formatDate, formatWeight } from '../lib/format'
import { LineChart } from '../components/Charts'
import { NumberField } from '../components/NumberField'

const MEASURES = ['Neck', 'Shoulders', 'Chest', 'Waist', 'Hips', 'Left arm', 'Right arm', 'Left thigh', 'Right thigh', 'Left calf', 'Right calf']
const FEELS = ['Rough', 'Meh', 'Okay', 'Good', 'Great']

function today(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function Body() {
  const unit = useUnit()
  const entries = useLiveQuery(() => db.body.orderBy('date').toArray(), [])
  const [editing, setEditing] = useState<BodyEntry | null>(null)
  const [now] = useState(() => Date.now())
  if (!entries) return null

  const todayEntry = entries.find((e) => e.date === today())
  const weights = entries.filter((e) => e.weight).map((e) => ({ x: e.date, y: e.weight! }))
  const latest = weights.at(-1)
  const oldestRecent = weights.filter((w) => w.x >= now - 30 * 86400000)[0]
  const avg7 = weights.filter((w) => w.x >= now - 7 * 86400000)
  const avg = avg7.length ? avg7.reduce((a, w) => a + w.y, 0) / avg7.length : null
  const lastMeasure = [...entries].reverse().find((e) => e.measurements && Object.keys(e.measurements).length > 0)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Body</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing(todayEntry ?? { date: today() })}>
          {todayEntry ? 'Edit today' : '+ Log today'}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__value">{latest ? formatWeight(latest.y, unit) : '—'}</div>
          <div className="stat__label">latest</div>
        </div>
        <div className="stat">
          <div className="stat__value">{avg ? formatWeight(Math.round(avg * 10) / 10, unit) : '—'}</div>
          <div className="stat__label">7-day avg</div>
        </div>
        <div className="stat">
          <div className="stat__value">{latest && oldestRecent && latest !== oldestRecent ? `${latest.y - oldestRecent.y >= 0 ? '+' : ''}${(latest.y - oldestRecent.y).toFixed(1)}` : '—'}</div>
          <div className="stat__label">30-day change</div>
        </div>
      </div>

      {weights.length >= 2 ? (
        <div className="card">
          <div className="card__title">Bodyweight</div>
          <LineChart points={weights.slice(-90)} />
        </div>
      ) : null}

      {lastMeasure ? (
        <div className="card">
          <div className="row row--between">
            <div className="card__title">Measurements</div>
            <span className="muted small">{formatDate(lastMeasure.date)}</span>
          </div>
          <div className="measure-grid">
            {Object.entries(lastMeasure.measurements!).map(([k, v]) => {
              const prev = [...entries].reverse().find((e) => e.date < lastMeasure.date && e.measurements?.[k] !== undefined)?.measurements?.[k]
              return (
                <div key={k} className="measure">
                  <span className="muted small">{k}</span>
                  <span className="mono">
                    {v} {prev !== undefined ? <span className={`small ${v - prev >= 0 ? 'good' : 'bad'}`}>{v - prev >= 0 ? '+' : ''}{(v - prev).toFixed(1)}</span> : null}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div>
        <h2>Log</h2>
        {entries.length === 0 ? <div className="empty">Nothing logged yet. Weigh in, measure up, or just say how you feel.</div> : null}
        <ul className="list">
          {[...entries].reverse().map((e) => (
            <li key={e.id}>
              <button type="button" className="list__item" onClick={() => setEditing(e)}>
                <span className="row row--between">
                  <span className="list__title">{formatDate(e.date)}</span>
                  <span className="mono">{e.weight ? formatWeight(e.weight, unit) : ''}</span>
                </span>
                <span className="list__meta">
                  {e.feel ? `Felt ${FEELS[e.feel - 1].toLowerCase()}` : ''}
                  {e.measurements && Object.keys(e.measurements).length ? ` · ${Object.keys(e.measurements).length} measurements` : ''}
                  {e.notes ? ` · ${e.notes}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editing ? <BodyEditor entry={editing} unit={unit} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function BodyEditor({ entry, unit, onClose }: { entry: BodyEntry; unit: string; onClose: () => void }) {
  const [draft, setDraft] = useState<BodyEntry>({ ...entry, measurements: { ...(entry.measurements ?? {}) } })
  const [showMeasures, setShowMeasures] = useState(!!entry.measurements && Object.keys(entry.measurements).length > 0)
  const measureUnit = unit === 'kg' ? 'cm' : 'in'

  async function save() {
    const measurements = Object.fromEntries(Object.entries(draft.measurements ?? {}).filter(([, v]) => v > 0))
    const clean: BodyEntry = { ...draft, measurements: Object.keys(measurements).length ? measurements : undefined, weight: draft.weight || undefined, notes: draft.notes?.trim() || undefined }
    await db.body.put(clean)
    onClose()
  }
  async function remove() {
    if (entry.id && confirm('Delete this entry?')) {
      await db.body.delete(entry.id)
      onClose()
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Log body">
        <div className="sheet__head">
          <h2>{formatDate(draft.date)}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={new Date(draft.date - new Date(draft.date).getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split('-').map(Number)
              if (y && m && d) setDraft({ ...draft, date: new Date(y, m - 1, d).getTime() })
            }}
          />
        </label>
        <NumberField label={`Bodyweight (${unit})`} value={draft.weight ?? 0} onChange={(weight) => setDraft({ ...draft, weight })} step={0.1} />
        <div className="field">
          <span>How do you feel?</span>
          <div className="segmented">
            {FEELS.map((f, i) => (
              <button key={f} type="button" aria-pressed={draft.feel === i + 1} onClick={() => setDraft({ ...draft, feel: draft.feel === i + 1 ? undefined : i + 1 })}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {showMeasures ? (
          <div className="field">
            <span>Measurements ({measureUnit})</span>
            <div className="measure-grid">
              {MEASURES.map((m) => (
                <NumberField key={m} label={m} value={draft.measurements?.[m] ?? 0} onChange={(v) => setDraft({ ...draft, measurements: { ...draft.measurements, [m]: v } })} step={0.5} compact />
              ))}
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowMeasures(true)}>
            + Add measurements
          </button>
        )}
        <label className="field">
          <span>Notes</span>
          <input value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Slept badly, sore quads…" />
        </label>
        <div className="row">
          <button type="button" className="btn btn--primary grow" onClick={save}>
            Save
          </button>
          {entry.id ? (
            <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
