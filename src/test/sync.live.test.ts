import { describe, expect, it } from 'vitest'
import { pullFromGitHub, pushToGitHub, testSync, type SyncConfig } from '../lib/sync'
import { buildSummary } from '../lib/stats'

/**
 * Live check against the real GitHub API. Skipped unless WORKOUTS_SYNC_TOKEN is set, so CI
 * never needs a secret. Run locally with:  WORKOUTS_SYNC_TOKEN=$(gh auth token) npm test
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const token = env.WORKOUTS_SYNC_TOKEN
const cfg: SyncConfig = { owner: env.WORKOUTS_SYNC_OWNER ?? 'scenicprints', repo: env.WORKOUTS_SYNC_REPO ?? 'Workouts-data', name: 'test-bot', token: token ?? '' }

describe.skipIf(!token)('GitHub sync (live)', () => {
  it('sees a private repo, pushes a summary, and pulls it back', async () => {
    expect(await testSync(cfg)).toBe('private')
    const summary = buildSummary('test-bot', 'kg', [], new Map(), [])
    await pushToGitHub(cfg, summary, false)
    // Push again to exercise the update-with-sha path.
    await pushToGitHub(cfg, { ...summary, totalSessions: 1 }, false)
    const files = await pullFromGitHub(cfg)
    const mine = files.find((f) => f.file === 'test-bot.json')
    expect(mine?.data.summary).toMatchObject({ name: 'test-bot', totalSessions: 1 })

    // Clean up so the repo only holds real people.
    const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/users/test-bot.json`, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } })
    const { sha } = (await r.json()) as { sha: string }
    const del = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/users/test-bot.json`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Remove sync test file', sha }),
    })
    expect(del.ok).toBe(true)
  }, 30000)
})
