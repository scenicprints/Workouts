import type { SessionReadiness } from '../db'
import { readinessEffect, type Readiness } from '../lib/readiness'

type Read = Pick<Readiness, 'level' | 'score' | 'reasons'> | SessionReadiness

const LABEL = { green: 'Green', amber: 'Amber', red: 'Red' } as const

export function ReadinessPill({ level }: { level: Read['level'] }) {
  return <span className={`pill ${level === 'green' ? 'pill--good' : 'pill--warn'}`}>{LABEL[level]}</span>
}

/** The readiness read as a card: level, score, and the lines behind it. */
export function ReadinessCard({ readiness, title = 'Readiness', when }: { readiness: Read & { earlyDeload?: boolean }; title?: string; when?: string }) {
  return (
    <div className="card">
      <div className="row row--between">
        <div className="card__title">{title}</div>
        <span className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          {when ? <span className="muted small">{when}</span> : null}
          <ReadinessPill level={readiness.level} />
          <span className="muted small">{readiness.score}</span>
        </span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {readinessEffect(readiness)[0].toUpperCase() + readinessEffect(readiness).slice(1)}.
        {readiness.reasons.length === 0 ? ' Resting heart rate, sleep, your last sessions and the scale are all in their lanes.' : ''}
      </p>
      {readiness.reasons.length ? (
        <ul className="list">
          {readiness.reasons.map((r) => (
            <li key={r} className="list__item" style={{ display: 'block' }}>
              <span className="small">{r}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
