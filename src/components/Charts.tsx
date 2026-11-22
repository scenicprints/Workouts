import { formatDate } from '../lib/format'

export function LineChart({ points, height = 160 }: { points: { x: number; y: number }[]; height?: number }) {
  const w = 320
  const h = height
  const pad = { l: 36, r: 8, t: 8, b: 20 }
  if (points.length === 0) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.floor(Math.min(...ys) * 0.95)
  const maxY = Math.ceil(Math.max(...ys) * 1.05)
  const sx = (x: number) => pad.l + ((x - minX) / Math.max(maxX - minX, 1)) * (w - pad.l - pad.r)
  const sy = (y: number) => h - pad.b - ((y - minY) / Math.max(maxY - minY, 1)) * (h - pad.t - pad.b)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const ticks = [minY, (minY + maxY) / 2, maxY]
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Line chart" style={{ height }}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="chart__grid" x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} />
          <text className="chart__label" x={pad.l - 4} y={sy(t) + 3} textAnchor="end">
            {Math.round(t)}
          </text>
        </g>
      ))}
      <path className="chart__line" d={d} />
      {points.map((p, i) => (
        <circle key={i} className="chart__dot" cx={sx(p.x)} cy={sy(p.y)} r={3} />
      ))}
      <text className="chart__label" x={pad.l} y={h - 6}>
        {formatDate(minX)}
      </text>
      <text className="chart__label" x={w - pad.r} y={h - 6} textAnchor="end">
        {formatDate(maxX)}
      </text>
    </svg>
  )
}

export function BarChart({ bars, height = 120, format = (v: number) => Math.round(v).toLocaleString() }: { bars: { label: string; value: number; highlight?: boolean }[]; height?: number; format?: (v: number) => string }) {
  const w = 320
  const h = height
  const pad = { l: 4, r: 4, t: 18, b: 18 }
  const max = Math.max(...bars.map((b) => b.value), 1)
  const bw = (w - pad.l - pad.r) / bars.length
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Bar chart" style={{ height }}>
      {bars.map((b, i) => {
        const bh = (b.value / max) * (h - pad.t - pad.b)
        const x = pad.l + i * bw + bw * 0.15
        const y = h - pad.b - bh
        return (
          <g key={i}>
            <rect className={`chart__bar${b.highlight ? ' chart__bar--hi' : ''}`} x={x} y={y} width={bw * 0.7} height={Math.max(bh, b.value > 0 ? 2 : 0)} rx={3} />
            {b.value > 0 ? (
              <text className="chart__label" x={x + bw * 0.35} y={y - 4} textAnchor="middle">
                {format(b.value)}
              </text>
            ) : null}
            <text className="chart__label" x={x + bw * 0.35} y={h - 5} textAnchor="middle">
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
