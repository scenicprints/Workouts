/**
 * Store behind the shared numeric keypad. Any field opens it with openPad(); the NumberPad
 * component renders whatever request is current.
 */
export interface PadRequest {
  value: number
  label: string
  unit?: string
  /** Quick-adjust amount for the −/+ chips. */
  step?: number
  min?: number
  allowDecimal?: boolean
  onChange: (v: number) => void
  /** Label and handler for the primary button, e.g. "Next" or "Log set". */
  primary?: { label: string; onPress: () => void }
  /** Quick-pick chips above the keys, e.g. last time's weight. */
  chips?: { label: string; value: number }[]
}

interface PadState {
  req: PadRequest | null
  seq: number
}

let state: PadState = { req: null, seq: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openPad(req: PadRequest) {
  state = { req, seq: state.seq + 1 }
  emit()
}
export function closePad() {
  if (!state.req) return
  state = { req: null, seq: state.seq + 1 }
  emit()
}
export const padIsOpen = () => state.req !== null

export function subscribePad(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const getPadState = () => state
