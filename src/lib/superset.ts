/**
 * Supersets are entries that share a `group` id. These helpers turn a flat list of entries
 * into blocks (single exercises or supersets) and interleave their sets.
 */
export interface Grouped {
  /** Indices into the original list, in order. One index = plain exercise, two or more = superset. */
  indices: number[]
  group?: string
}

export function groupEntries(entries: { group?: string }[]): Grouped[] {
  const blocks: Grouped[] = []
  const seen = new Map<string, Grouped>()
  entries.forEach((e, i) => {
    if (e.group) {
      const existing = seen.get(e.group)
      if (existing) {
        existing.indices.push(i)
        return
      }
      const block: Grouped = { indices: [i], group: e.group }
      seen.set(e.group, block)
      blocks.push(block)
    } else {
      blocks.push({ indices: [i] })
    }
  })
  // A group with a single member is not a superset; drop the id so it renders plainly.
  return blocks.map((b) => (b.indices.length === 1 ? { indices: b.indices } : b))
}

/** Round-robin the sets of several entries: A1, B1, A2, B2… Shorter lists just run out early. */
export function interleaveSets(lengths: number[]): { entry: number; set: number }[] {
  const out: { entry: number; set: number }[] = []
  const max = Math.max(0, ...lengths)
  for (let s = 0; s < max; s++) {
    lengths.forEach((len, entry) => {
      if (s < len) out.push({ entry, set: s })
    })
  }
  return out
}

export function newGroupId(): string {
  return `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
