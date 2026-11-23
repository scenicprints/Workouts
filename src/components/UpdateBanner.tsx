import { useEffect } from 'react'
import { checkForUpdate, installUpdate, updateAvailable, useUpdateState } from '../lib/update'

/** Slim banner at the top of every page when a newer build exists. */
export function UpdateBanner() {
  const s = useUpdateState()
  useEffect(() => {
    void checkForUpdate()
  }, [])
  if (!updateAvailable(s)) return null
  if (s.webUpdateReady) {
    return (
      <div className="update">
        <span className="grow">A new version is ready.</span>
        <button type="button" className="btn btn--sm btn--primary btn--pill" onClick={() => s.reloadWeb?.()}>
          Reload
        </button>
      </div>
    )
  }
  return (
    <div className="update">
      <span className="grow">
        Update available: {s.latestName}
        {s.currentName ? <span className="muted"> (you have {s.currentName})</span> : null}
      </span>
      <button type="button" className="btn btn--sm btn--primary btn--pill" onClick={() => installUpdate()} disabled={s.installing}>
        {s.installing ? 'Downloading…' : 'Update'}
      </button>
    </div>
  )
}
