import { describe, expect, it } from 'vitest'
import { healthStatus, isNativeApp, onSessionFinished, syncHealth } from '../lib/health'

describe('health bridge on the web', () => {
  it('reports not native and never touches Health Connect', async () => {
    expect(isNativeApp()).toBe(false)
    expect(await healthStatus()).toMatchObject({ native: false, granted: false })
    expect(await syncHealth()).toMatchObject({ body: 0, daily: 0, vitals: 0, written: 0 })
    await expect(onSessionFinished(1)).resolves.toBeUndefined()
  })
})
