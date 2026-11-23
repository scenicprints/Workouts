import { closePad, openPad } from '../lib/pad'

interface Props {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  label?: string
  suffix?: string
  compact?: boolean
  /** Whole numbers only (reps, sets, seconds). */
  integer?: boolean
}

function format(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

/** A tappable number that opens the shared keypad. Replaces the old stepper everywhere. */
export function NumberField({ value, onChange, step = 1, min = 0, label, suffix, compact, integer }: Props) {
  const open = () =>
    openPad({
      value,
      label: label ?? suffix ?? 'Value',
      unit: suffix,
      step,
      min,
      allowDecimal: !integer,
      onChange,
      primary: { label: 'Done', onPress: closePad },
    })
  return (
    <div className={`numfield${compact ? ' numfield--compact' : ''}`}>
      {label ? <span className="numfield__label">{label}</span> : null}
      <button type="button" className="numfield__value" onClick={open} aria-label={label}>
        {format(value)}
        {suffix ? <span className="numfield__suffix">{suffix}</span> : null}
      </button>
    </div>
  )
}
