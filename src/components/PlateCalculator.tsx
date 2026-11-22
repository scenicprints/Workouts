import { useState } from 'react'
import type { Unit } from '../db'
import { BARS, platesPerSide } from '../lib/plates'
import { formatWeight } from '../lib/format'
import { NumberField } from './NumberField'

export function PlateCalculator({ weight, unit, onClose }: { weight: number; unit: Unit; onClose: () => void }) {
  const [bar, setBar] = useState(BARS[unit])
  const result = platesPerSide(weight, unit, bar)
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Plate calculator">
        <div className="sheet__head">
          <h2>Plates for {formatWeight(weight, unit)}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <NumberField label={`Bar (${unit})`} value={bar} onChange={setBar} step={unit === 'kg' ? 5 : 10} compact />
        {result === null ? (
          <p className="muted">Lighter than the bar.</p>
        ) : (
          <>
            <div className="plates">
              {result.plates.length === 0 ? <span className="muted">Empty bar</span> : null}
              {result.plates.map((p, i) => (
                <span key={i} className="plate" style={{ height: 36 + Math.min(p, 25) * 1.6 }}>
                  {p}
                </span>
              ))}
            </div>
            <p className="muted small">Per side. {result.remainder > 0 ? `${formatWeight(result.remainder, unit)} per side cannot be loaded with standard plates.` : ''}</p>
          </>
        )}
      </div>
    </div>
  )
}
