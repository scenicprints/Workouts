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
  const daily = useLiveQuery(() => db.daily.orderBy('date').reverse().limit(1).toArray(), []) ?? []
  const [editing, setEditing] = useState<BodyEntry | null>(null)
  const [now] = useState(() => Date.now())
  if (!entries) return null

  const todayEntry = entries.find((e) => e.date === today())
  const weights = entries.filter((e) => e.weight).map((e) => ({ x: e.date, y: e.weight! }))
  const latest = weights.at(-1)
  const monthAgo = weights.filter((w) => w.x <= now - 30 * 86400000).at(-1) ?? weights[0]
  const change = latest && monthAgo && latest !== monthAgo ? latest.y - monthAgo.y : null
  const fats = entries.filter((e) => e.bodyFat !== undefined).map((e) => ({ x: e.date, y: e.bodyFat! }))
  const latestFat = fats.at(-1)
  const latestLean = [...entries].reverse().find((e) => e.leanMass !== undefined)
  const lastMeasure = [...entries].reverse().find((e) => e.measurements && Object.keys(e.measurements).length > 0)
  const todayHealth = daily[0]
  const feel = todayEntry?.feel ?? [...entries].reverse().find((e) => e.feel)?.feel

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Body</h1>
        <button type="button" className="btn btn--sm" onClick={() => setEditing(todayEntry ?? { date: today() })}>
          {todayEntry ? 'Edit today' : 'Log'}
        </button>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="bigfig">
          <div>
            <div className="section--eyebrow section" style={{ margin: '0 0 6px' }}>Weight</div>
            <div className="bigfig__value c-coral">
              {latest ? latest.y : '—'} <span className="bigfig__unit">{unit}</span>
            </div>
          </div>
          {change !== null ? (
            <div style={{ textAlign: 'right' }}>
              <div className={change <= 0 ? 'good' : ''} style={{ fontWeight: 600 }}>
                {change > 0 ? '+' : ''}
                {change.toFixed(1)} {unit}
              </div>
              <div className="muted small">last 30 days</div>
            </div>
          ) : null}
        </div>
        {weights.length >= 2 ? (
          <div className="chart--coral">
            <LineChart points={weights.slice(-90)} height={130} />
          </div>
        ) : (
          <p className="muted small">Log a few weigh-ins, or connect Health Connect, to see the trend.</p>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__value c-violet">{latestFat ? `${latestFat.y}%` : '—'}</div>
          <div className="stat__label">Body fat</div>
        </div>
        <div className="stat">
          <div className="stat__value c-sky">{latestLean?.leanMass !== undefined ? latestLean.leanMass : '—'}</div>
          <div className="stat__label">Lean {unit}</div>
        </div>
        <div className="stat">
          <div className="stat__value c-pink">{todayHealth?.restingHr !== undefined ? Math.round(todayHealth.restingHr) : '—'}</div>
          <div className="stat__label">Resting bpm</div>
        </div>
      </div>

      <div>
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <div className="section section--eyebrow" style={{ margin: 0 }}>Today</div>
          {todayHealth ? <span className="muted small">Health Connect</span> : null}
        </div>
        <ul className="list">
          <li className="row row--between small" style={{ padding: '13px 18px' }}>
            <span>Steps</span>
            <span className="mono" style={{ fontWeight: 600 }}>{todayHealth?.steps !== undefined ? todayHealth.steps.toLocaleString() : '—'}</span>
          </li>
          <li className="row row--between small" style={{ padding: '13px 18px' }}>
            <span>Sleep</span>
            <span className="mono" style={{ fontWeight: 600 }}>{todayHealth?.sleepMin !== undefined ? `${Math.floor(todayHealth.sleepMin / 60)}h ${String(todayHealth.sleepMin % 60).padStart(2, '0')}m` : '—'}</span>
          </li>
          <li className="row row--between small" style={{ padding: '13px 18px' }}>
            <span>Feel</span>
            <span className="feelbar" aria-label={feel ? `Feel ${feel} of 5` : 'Not logged'}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={feel && i <= feel ? 'on' : ''} />
              ))}
            </span>
          </li>
        </ul>
      </div>

      {lastMeasure ? (
        <div>
          <div className="row row--between" style={{ marginBottom: 10 }}>
            <div className="section section--eyebrow" style={{ margin: 0 }}>Measurements</div>
            <span className="muted small">{formatDate(lastMeasure.date)}</span>
          </div>
          <ul className="list">
            {Object.entries(lastMeasure.measurements!).map(([k, v]) => {
              const prev = [...entries].reverse().find((e) => e.date < lastMeasure.date && e.measurements?.[k] !== undefined)?.measurements?.[k]
              return (
                <li key={k} className="row row--between small" style={{ padding: '13px 18px' }}>
                  <span>{k}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {v} {prev !== undefined ? <span className={`small ${v - prev <= 0 ? 'good' : 'muted'}`}>{v - prev >= 0 ? '+' : ''}{(v - prev).toFixed(1)}</span> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="section section--eyebrow">Log</div>
        {entries.length === 0 ? <div className="empty">Nothing logged yet.</div> : null}
        <ul className="list">
          {[...entries].reverse().slice(0, 30).map((e) => (
            <li key={e.id}>
              <button type="button" className="list__item" onClick={() => setEditing(e)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="list__title">{formatDate(e.date)}</span>
                  <span className="list__meta">
                    {[e.bodyFat !== undefined ? `${e.bodyFat}% fat` : null, e.source === 'health' ? 'scale' : null, e.feel ? `felt ${FEELS[e.feel - 1].toLowerCase()}` : null, e.notes].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>{e.weight ? formatWeight(e.weight, unit) : ''}</span>
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
    const clean: BodyEntry = { ...draft, measurements: Object.keys(measurements).length ? measurements : undefined, weight: draft.weight || undefined, bodyFat: draft.bodyFat || undefined, notes: draft.notes?.trim() || undefined, source: draft.source ?? 'manual' }
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
        <div className="row">
          <NumberField label={`Bodyweight (${unit})`} value={draft.weight ?? 0} onChange={(weight) => setDraft({ ...draft, weight })} step={0.1} />
          <NumberField label="Body fat %" value={draft.bodyFat ?? 0} onChange={(bodyFat) => setDraft({ ...draft, bodyFat })} step={0.1} compact />
        </div>
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
