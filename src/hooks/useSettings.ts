import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Unit } from '../db'

export const DEFAULT_REST = 90

export const DEFAULT_UNIT: Unit = 'lb'

export function useUnit(): Unit {
  return useLiveQuery(async () => ((await db.settings.get('unit'))?.value as Unit | undefined) ?? DEFAULT_UNIT, [], DEFAULT_UNIT)
}

/**
 * New installs default to pounds. Anyone who already logged weights before this default existed
 * keeps kilograms, pinned explicitly, so nothing they entered gets relabelled.
 */
export async function ensureUnitDefault(): Promise<void> {
  const existing = await db.settings.get('unit')
  if (existing) return
  const logged = await db.sessions.filter((s) => s.entries.some((e) => e.sets.some((x) => x.weight > 0))).count()
  const routines = await db.routines.filter((r) => r.items.some((i) => i.weight > 0)).count()
  await db.settings.put({ key: 'unit', value: logged + routines > 0 ? 'kg' : DEFAULT_UNIT })
}

export function useDefaultRest(): number {
  return useLiveQuery(
    async () => ((await db.settings.get('defaultRest'))?.value as number | undefined) ?? DEFAULT_REST,
    [],
    DEFAULT_REST,
  )
}

export function useExerciseMap() {
  return useLiveQuery(async () => {
    const all = await db.exercises.toArray()
    return new Map(all.map((e) => [e.id!, e]))
  }, [])
}
