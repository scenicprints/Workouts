import { useEffect, useSyncExternalStore } from 'react'
import { beep, vibrate } from '../lib/alerts'

interface TimerState {
  endAt: number | null
  total: number
}

const KEY = 'workouts.restTimer'
let state: TimerState = load()
let fired = false
const listeners = new Set<() => void>()

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TimerState
      if (typeof parsed.endAt === 'number' && parsed.endAt > Date.now()) return parsed
    }
  } catch {
    // ignore corrupt storage
  }
  return { endAt: null, total: 0 }
}

function commit(next: TimerState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage is optional
  }
  listeners.forEach((l) => l())
}

export const restTimer = {
  start(seconds: number) {
    fired = false
    commit({ endAt: Date.now() + seconds * 1000, total: seconds })
  },
  add(seconds: number) {
    if (!state.endAt) return
    const endAt = Math.max(Date.now(), state.endAt) + seconds * 1000
    commit({ endAt, total: state.total + seconds })
  },
  stop() {
    commit({ endAt: null, total: 0 })
  },
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useRestTimer() {
  const snap = useSyncExternalStore(subscribe, () => state)
  const now = useNow(snap.endAt !== null)
  const remaining = snap.endAt ? (snap.endAt - now) / 1000 : 0

  useEffect(() => {
    if (snap.endAt && remaining <= 0 && !fired) {
      fired = true
      beep()
      vibrate()
      const t = setTimeout(() => restTimer.stop(), 1500)
      return () => clearTimeout(t)
    }
  }, [snap.endAt, remaining])

  return {
    active: snap.endAt !== null,
    remaining: Math.max(0, remaining),
    total: snap.total,
    finished: snap.endAt !== null && remaining <= 0,
  }
}

/** Current time, re-read four times a second while enabled. Quantised so renders stay stable. */
function useNow(enabled: boolean): number {
  return useSyncExternalStore(
    (cb) => {
      if (!enabled) return () => {}
      const id = setInterval(cb, 250)
      return () => clearInterval(id)
    },
    () => (enabled ? Math.floor(Date.now() / 250) * 250 : 0),
  )
}
