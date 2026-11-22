export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function relativeDay(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff} days ago`
  return formatDate(ts)
}

export function formatWeight(w: number, unit: string): string {
  const n = Number.isInteger(w) ? w.toString() : w.toFixed(1).replace(/\.0$/, '')
  return `${n} ${unit}`
}

/** Count consecutive weeks (ending this week) that contain at least one finished session. */
export function weeklyStreak(timestamps: number[], now = Date.now()): number {
  if (timestamps.length === 0) return 0
  const weekOf = (ts: number) => {
    const d = new Date(ts)
    const day = (d.getDay() + 6) % 7 // Monday = 0
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
    return monday.getTime()
  }
  const weeks = new Set(timestamps.map(weekOf))
  let streak = 0
  let cursor = weekOf(now)
  while (weeks.has(cursor)) {
    streak++
    cursor = weekOf(cursor - 7 * 86400000 + 12 * 3600000)
  }
  return streak
}
