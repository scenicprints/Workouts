import { db, exportAll, type ExportBundle } from '../db'
import type { Summary } from './stats'

/**
 * Sync through a private GitHub repo. Each person writes users/<name>.json with a fine-grained
 * personal access token that has Contents read/write on that one repo. Nothing else is needed.
 */
export interface SyncConfig {
  owner: string
  repo: string
  name: string
  token: string
}

export interface SyncFile {
  summary: Summary
  bundle?: ExportBundle
}

const CONFIG_KEY = 'workouts.sync'

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as SyncConfig
    return c.token && c.owner && c.repo && c.name ? c : null
  } catch {
    return null
  }
}

export function saveSyncConfig(cfg: SyncConfig | null): void {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CONFIG_KEY)
}

function headers(cfg: SyncConfig, accept = 'application/vnd.github+json'): HeadersInit {
  return { Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
}

function fileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'me'
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function getSha(cfg: SyncConfig, path: string): Promise<string | null> {
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, { headers: headers(cfg) })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`)
  const json = (await r.json()) as { sha: string }
  return json.sha
}

/** Upload this device's summary and full backup. */
export async function pushToGitHub(cfg: SyncConfig, summary: Summary, includeBackup = true): Promise<void> {
  const path = `users/${fileName(cfg.name)}.json`
  const file: SyncFile = { summary, bundle: includeBackup ? await exportAll(db) : undefined }
  const sha = await getSha(cfg, path)
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    headers: headers(cfg),
    body: JSON.stringify({ message: `Sync ${cfg.name} ${new Date().toISOString()}`, content: toBase64(JSON.stringify(file)), sha: sha ?? undefined }),
  })
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`)
}

/** Download everyone's summaries (and backups) from the repo. */
export async function pullFromGitHub(cfg: SyncConfig): Promise<{ file: string; data: SyncFile }[]> {
  const list = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/users`, { headers: headers(cfg) })
  if (list.status === 404) return []
  if (!list.ok) throw new Error(`GitHub ${list.status}: ${await list.text()}`)
  const entries = (await list.json()) as { name: string; path: string; type: string }[]
  const out: { file: string; data: SyncFile }[] = []
  for (const e of entries) {
    if (e.type !== 'file' || !e.name.endsWith('.json')) continue
    const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${e.path}`, { headers: headers(cfg, 'application/vnd.github.raw+json') })
    if (!r.ok) continue
    try {
      out.push({ file: e.name, data: (await r.json()) as SyncFile })
    } catch {
      // skip files that are not ours
    }
  }
  return out
}

/** Quick check that the token can see the repo. Returns the repo's visibility. */
export async function testSync(cfg: SyncConfig): Promise<'private' | 'public'> {
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, { headers: headers(cfg) })
  if (!r.ok) throw new Error(r.status === 404 ? 'Repo not found or token has no access' : `GitHub ${r.status}`)
  const json = (await r.json()) as { private: boolean }
  return json.private ? 'private' : 'public'
}
