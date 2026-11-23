import { useState, useSyncExternalStore } from 'react'
import { Delete, X } from 'lucide-react'
import { closePad, getPadState, subscribePad, type PadRequest } from '../lib/pad'

function format(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

/** The one keypad for the whole app. Slides up above the tab bar; no steppers anywhere. */
export function NumberPad() {
  const { req, seq } = useSyncExternalStore(subscribePad, getPadState)
  if (!req) return null
  // Keyed on the request so the typing buffer resets whenever a different field opens the pad.
  return <PadSheet key={seq} req={req} />
}

function PadSheet({ req }: { req: PadRequest }) {
  const [text, setText] = useState(() => format(req.value))
  const [fresh, setFresh] = useState(true)

  const commit = (next: string) => {
    setText(next)
    const n = next === '' || next === '.' ? 0 : Number(next)
    if (!Number.isNaN(n)) req.onChange(Math.max(req.min ?? 0, n))
  }
  const typeKey = (k: string) => {
    let next = fresh ? '' : text
    if (k === '.') {
      if (!req.allowDecimal || next.includes('.')) return
      next = next === '' ? '0.' : next + '.'
    } else {
      if (next === '0') next = ''
      next = next + k
    }
    setFresh(false)
    commit(next)
  }
  const backspace = () => {
    const next = fresh ? '' : text.slice(0, -1)
    setFresh(false)
    commit(next)
  }
  const nudge = (d: number) => {
    const n = Math.max(req.min ?? 0, (Number(text) || 0) + d)
    setFresh(true)
    commit(format(n))
  }
  const step = req.step ?? 1

  return (
    <div className="keypad" role="dialog" aria-label={`Enter ${req.label}`}>
      <div className="keypad__head">
        <div>
          <div className="keypad__label">{req.label}</div>
          <div className="keypad__value">
            {text === '' ? '0' : text}
            {req.unit ? <span className="keypad__unit">{req.unit}</span> : null}
          </div>
        </div>
        <button type="button" className="keypad__close" onClick={closePad} aria-label="Close keypad">
          <X size={18} />
        </button>
      </div>
      <div className="keypad__grid">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => (
          <button key={k} type="button" className="keypad__key" onClick={() => typeKey(k)}>
            {k}
          </button>
        ))}
        <button type="button" className="keypad__key" onClick={() => typeKey('.')} disabled={!req.allowDecimal}>
          .
        </button>
        <button type="button" className="keypad__key" onClick={() => typeKey('0')}>
          0
        </button>
        <button type="button" className="keypad__key" onClick={backspace} aria-label="Backspace">
          <Delete size={22} />
        </button>
        <div className="keypad__side">
          <button type="button" className="keypad__key keypad__key--chip" onClick={() => nudge(-step)}>
            −{format(step)}
          </button>
          <button type="button" className="keypad__key keypad__key--chip" onClick={() => nudge(step)}>
            +{format(step)}
          </button>
          <button
            type="button"
            className="keypad__key keypad__key--primary"
            onClick={() => {
              if (req.primary) req.primary.onPress()
              else closePad()
            }}
          >
            {req.primary?.label ?? 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
