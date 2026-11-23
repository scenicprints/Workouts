import { describe, expect, it } from 'vitest'
import { buildNumberFromTag, checkForUpdate, updateAvailable } from '../lib/update'

describe('update checks', () => {
  it('reads the build number from a release tag', () => {
    expect(buildNumberFromTag('android-v0.2.17')).toBe(17)
    expect(buildNumberFromTag('v1.0.3')).toBe(3)
    expect(buildNumberFromTag('nightly')).toBeNull()
  })
  it('only flags newer builds', () => {
    const base = { current: 10, currentName: '0.2.10', latest: 10, latestName: '0.2.10', checkedAt: 1, checking: false, installing: false, needsPermission: false, error: null, webUpdateReady: false, reloadWeb: null }
    expect(updateAvailable(base)).toBe(false)
    expect(updateAvailable({ ...base, latest: 11 })).toBe(true)
    expect(updateAvailable({ ...base, current: 0, latest: 11 })).toBe(false)
    expect(updateAvailable({ ...base, webUpdateReady: true })).toBe(true)
  })
  it('does nothing on the web', async () => {
    const s = await checkForUpdate(true)
    expect(s.latest).toBeNull()
    expect(s.checking).toBe(false)
  })
})
