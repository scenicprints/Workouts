import { restTimer, useRestTimer } from '../hooks/useRestTimer'
import { formatClock } from '../lib/format'

export function RestTimerBar() {
  const { active, remaining, total, finished } = useRestTimer()
  if (!active) return null
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
  return (
    <div className={`rest-bar${finished ? ' rest-bar--done' : ''}`} role="status" aria-live="polite">
      <div className="rest-bar__fill" style={{ width: `${pct}%` }} />
      <div className="rest-bar__row">
        <span className="rest-bar__label">{finished ? 'Go!' : 'Rest'}</span>
        <span className="rest-bar__clock">{formatClock(remaining)}</span>
        <div className="rest-bar__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => restTimer.add(-15)} aria-label="Fifteen seconds less">
            −15
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => restTimer.add(30)} aria-label="Thirty seconds more">
            +30
          </button>
          <button type="button" className="btn btn--sm" onClick={() => restTimer.stop()}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
