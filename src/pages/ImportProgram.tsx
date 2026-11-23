import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnit } from '../hooks/useSettings'
import { importProgram, validateProgram, type ImportResult } from '../lib/importProgram'

const EXAMPLE = `{
  "name": "Upper / Lower · 8 weeks",
  "weeks": 8,
  "deloadEvery": 4,
  "unit": "lb",
  "days": [
    { "label": "Mon", "routine": "Upper A" },
    { "label": "Tue", "routine": "Lower A" },
    { "label": "Thu", "routine": "Upper B" },
    { "label": "Fri", "routine": "Lower B" }
  ],
  "routines": [
    { "name": "Upper A", "exercises": [
      { "exercise": "Bench Press", "sets": 4, "reps": 6, "weight": 185, "increment": 5 },
      { "exercise": "Barbell Row", "sets": 4, "reps": 8, "weight": 155, "increment": 5 },
      { "exercise": "Lateral Raise", "sets": 3, "reps": 15, "weight": 20, "increment": 2.5, "superset": "S1" },
      { "exercise": "Face Pull", "sets": 3, "reps": 15, "weight": 40, "increment": 2.5, "superset": "S1" }
    ]}
  ]
}`

export function ImportProgram() {
  const navigate = useNavigate()
  const unit = useUnit()
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setErrors([])
    setResult(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      setErrors([`That is not valid JSON: ${(err as Error).message}`])
      return
    }
    const v = validateProgram(parsed)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }
    setBusy(true)
    try {
      const r = await importProgram(v.program, { unit })
      setResult(r)
    } catch (err) {
      setErrors([(err as Error).message])
    } finally {
      setBusy(false)
    }
  }

  async function paste() {
    try {
      setText(await navigator.clipboard.readText())
    } catch {
      setErrors(['Could not read the clipboard. Paste into the box instead.'])
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Import a program</h1>
      </div>
      <p className="muted small">
        Paste a program in the app's JSON format. A coach, a spreadsheet or an AI can write one. Exercise names are matched to the library; anything new is added as a custom exercise. The plan becomes your active plan.
      </p>
      <div className="field">
        <span>Program JSON</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={EXAMPLE} spellCheck={false} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
      </div>
      <div className="row">
        <button type="button" className="btn btn--primary" onClick={run} disabled={busy || !text.trim()}>
          {busy ? 'Importing…' : 'Import'}
        </button>
        <button type="button" className="btn" onClick={paste}>
          Paste from clipboard
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setText(EXAMPLE)}>
          Show example
        </button>
      </div>
      {errors.length ? (
        <ul className="list" style={{ color: 'var(--bad)' }}>
          {errors.map((e, i) => (
            <li key={i} className="small" style={{ padding: '8px 0' }}>
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      {result ? (
        <div className="stack" style={{ gap: 12 }}>
          <div className="section">Imported</div>
          <p className="small">
            {result.routineIds.length} routine{result.routineIds.length === 1 ? '' : 's'} and the plan were created.
            {result.createdExercises.length ? ` New exercises: ${result.createdExercises.join(', ')}.` : ''}
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} className="small muted">
              {w}
            </p>
          ))}
          <button type="button" className="btn btn--primary" onClick={() => navigate(`/plans/${result.planId}`)}>
            Open the plan
          </button>
        </div>
      ) : null}
    </div>
  )
}
