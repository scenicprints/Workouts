import type { Unit } from '../db'

export const BARS: Record<Unit, number> = { kg: 20, lb: 45 }
export const PLATES: Record<Unit, number[]> = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] }

/** Plates per side to load a barbell to `total`. Returns null when the total is below the bar. */
export function platesPerSide(total: number, unit: Unit, bar = BARS[unit], available = PLATES[unit]): { plates: number[]; remainder: number } | null {
  if (total < bar) return null
  let side = (total - bar) / 2
  const plates: number[] = []
  for (const p of available) {
    while (side + 1e-9 >= p) {
      plates.push(p)
      side -= p
    }
  }
  return { plates, remainder: Math.round(side * 100) / 100 }
}
