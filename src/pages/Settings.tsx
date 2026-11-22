import { useRef, useState } from 'react'
import { db, exportAll, importAll, setSetting, wipeAll, type ExportBundle, type Unit } from '../db'
import { useDefaultRest, useUnit } from '../hooks/useSettings'
import { convertWeight } from '../lib/progression'
import { NumberField } from '../components/NumberField'
import { beep, vibrate } from '../lib/alerts'
import { loadSyncConfig, saveSyncConfig, testSync, type SyncConfig } from '../lib/sync'

export function Settings() {
  const unit = useUnit()
  const defaultRest = useDefaultRest()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function changeUnit(to: Unit) {
    if (to === unit) return
    if (!confirm(`Switch to ${to}? All stored weights will be converted.`)) return
    await db.transaction('rw', [db.sessions, db.routines, db.body, db.settings], async () => {
      const sessions = await db.sessions.toArray()
      for (const s of sessions) {
        await db.sessions.update(s.id!, {
          entries: s.entries.map((e) => ({
            ...e,
            increment: convertWeight(e.increment, unit, to),
            sets: e.sets.map((x) => ({ ...x, weight: convertWeight(x.weight, unit, to), targetWeight: x.targetWeight === undefined ? undefined : convertWeight(x.targetWeight, unit, to) })),
          })),
        })
      }
      const routines = await db.routines.toArray()
      for (const r of routines) {
        await db.routines.update(r.id!, { items: r.items.map((i) => ({ ...i, weight: convertWeight(i.weight, unit, to), increment: convertWeight(i.increment, unit, to) })) })
      }
      const body = await db.body.toArray()
      for (const b of body) {
        if (b.weight) await db.body.update(b.id!, { weight: convertWeight(b.weight, unit, to) })
      }
      await db.settings.put({ key: 'unit', value: to })
    })
    setStatus(`Switched to ${to}. Body measurements were not converted.`)
  }

  async function doExport() {
    const bundle = await exportAll()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workouts-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus(`Exported ${bundle.sessions.length} sessions.`)
  }

  async function doImport(file: File) {
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle
      if (!confirm(`Replace everything on this device with the backup from ${new Date(bundle.exportedAt).toLocaleString()}?`)) return
      await importAll(bundle)
      setStatus(`Imported ${bundle.sessions?.length ?? 0} sessions.`)
    } catch (err) {
      setStatus(`Import failed: ${(err as Error).message}`)
    }
  }

  async function wipe() {
    if (!confirm('Delete every workout, routine, plan, body entry and custom exercise on this device? This cannot be undone.')) return
    if (!confirm('Really delete everything?')) return
    await wipeAll()
    setStatus('All data deleted.')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <div className="card">
        <div className="card__title">Units</div>
        <div className="segmented" role="group" aria-label="Weight unit">
          <button type="button" aria-pressed={unit === 'kg'} onClick={() => changeUnit('kg')}>
            kg
          </button>
          <button type="button" aria-pressed={unit === 'lb'} onClick={() => changeUnit('lb')}>
            lb
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card__title">Rest timer</div>
        <div className="row row--between">
          <NumberField label="Default rest (seconds)" value={defaultRest} onChange={(v) => setSetting('defaultRest', Math.max(0, v))} step={15} />
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              beep()
              vibrate()
            }}
          >
            Test alert
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Used for freeform exercises. Routines set their own rest per exercise.
        </p>
      </div>

      <SyncSettings onStatus={setStatus} />

      <div className="card">
        <div className="card__title">Your data</div>
        <p className="muted small">Everything lives in this browser on this device. Export a backup before clearing site data or switching devices.</p>
        <div className="row">
          <button type="button" className="btn" onClick={doExport}>
            Export backup
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </div>
      </div>

      {status ? <p className="small card">{status}</p> : null}

      <div className="card">
        <div className="card__title">Danger zone</div>
        <button type="button" className="btn btn--ghost btn--danger" onClick={wipe}>
          Delete all data
        </button>
      </div>

      <p className="muted small center">
        Workouts · open source on{' '}
        <a href="https://github.com/scenicprints/Workouts" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </div>
  )
}

function SyncSettings({ onStatus }: { onStatus: (s: string) => void }) {
  const existing = loadSyncConfig()
  const [cfg, setCfg] = useState<SyncConfig>(existing ?? { owner: 'scenicprints', repo: 'Workouts-data', name: '', token: '' })
  const [open, setOpen] = useState(!existing)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!cfg.name.trim() || !cfg.token.trim()) {
      onStatus('Sync needs a name and a token.')
      return
    }
    setBusy(true)
    try {
      const visibility = await testSync(cfg)
      saveSyncConfig({ ...cfg, name: cfg.name.trim(), token: cfg.token.trim() })
      onStatus(visibility === 'private' ? 'Sync connected to a private repo.' : 'Connected, but that repo is PUBLIC. Your lifts and bodyweight would be visible to anyone.')
      setOpen(false)
    } catch (err) {
      onStatus(`Sync failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  function disconnect() {
    if (!confirm('Disconnect sync and forget the token on this device?')) return
    saveSyncConfig(null)
    localStorage.removeItem('workouts.friends')
    setCfg({ ...cfg, token: '' })
    setOpen(true)
    onStatus('Sync disconnected.')
  }

  return (
    <div className="card">
      <div className="row row--between">
        <div className="card__title">Sync with friends via GitHub</div>
        {existing && !open ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
            Edit
          </button>
        ) : null}
      </div>
      {existing && !open ? (
        <>
          <p className="small">
            Connected as <strong>{existing.name}</strong> to {existing.owner}/{existing.repo}.
          </p>
          <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={disconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <div className="stack">
          <p className="muted small">Each person's numbers go into one file in a private repo. You need a fine-grained personal access token with Contents read and write on that repo only. The token stays on this device.</p>
          <label className="field">
            <span>Your name (shown to friends)</span>
            <input value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} placeholder="e.g. Kevin" autoComplete="off" />
          </label>
          <div className="row">
            <label className="field grow">
              <span>Repo owner</span>
              <input value={cfg.owner} onChange={(e) => setCfg({ ...cfg, owner: e.target.value })} autoComplete="off" />
            </label>
            <label className="field grow">
              <span>Repo name</span>
              <input value={cfg.repo} onChange={(e) => setCfg({ ...cfg, repo: e.target.value })} autoComplete="off" />
            </label>
          </div>
          <label className="field">
            <span>Personal access token</span>
            <input type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder="github_pat_…" autoComplete="off" />
          </label>
          <p className="muted small">
            Create one at github.com → Settings → Developer settings → Fine-grained tokens. Repository access: only {cfg.owner}/{cfg.repo}. Permission: Contents, read and write.
          </p>
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
              {busy ? 'Checking…' : 'Connect'}
            </button>
            {existing ? (
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
