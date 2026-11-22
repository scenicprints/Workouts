interface Props {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  label?: string
  suffix?: string
  compact?: boolean
}

export function NumberField({ value, onChange, step = 1, min = 0, label, suffix, compact }: Props) {
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 100) / 100))
  return (
    <div className={`numfield${compact ? ' numfield--compact' : ''}`}>
      {label ? <span className="numfield__label">{label}</span> : null}
      <div className="numfield__row">
        <button type="button" className="numfield__btn" onClick={() => set(value - step)} aria-label={`Decrease ${label ?? ''}`}>
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          className="numfield__input"
          value={Number.isNaN(value) ? '' : value}
          min={min}
          step={step}
          onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          aria-label={label}
        />
        <button type="button" className="numfield__btn" onClick={() => set(value + step)} aria-label={`Increase ${label ?? ''}`}>
          +
        </button>
      </div>
      {suffix ? <span className="numfield__suffix">{suffix}</span> : null}
    </div>
  )
}
