import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Unit } from '../db'

export const DEFAULT_REST = 90

export function useUnit(): Unit {
  return useLiveQuery(async () => ((await db.settings.get('unit'))?.value as Unit | undefined) ?? 'kg', [], 'kg' as Unit)
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
