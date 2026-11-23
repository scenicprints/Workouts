import { useEffect } from 'react'
import { checkForUpdate, installUpdate, updateAvailable, useUpdateState, watchForResume } from '../lib/update'

/** Slim banner at the top of every page when a newer build exists. */
export function UpdateBanner() {
  const s = useUpdateState()
  useEffect(() => {
    void checkForUpdate()
    watchForResume()
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
    <div className="update update--stack">
      <div className="row row--between" style={{ flexWrap: 'nowrap' }}>
        <span className="grow">
          Update {s.latestName} available
          {s.currentName ? <span className="muted"> · you have {s.currentName}</span> : null}
        </span>
        <button type="button" className="btn btn--sm btn--primary btn--pill" onClick={() => installUpdate()} disabled={s.installing}>
          {s.installing ? 'Downloading…' : s.needsPermission ? 'Continue' : 'Update'}
        </button>
      </div>
      {s.needsPermission ? (
        <div className="small muted">Android asks once to allow Workouts to install updates. Turn the switch on, then come back here and the download continues by itself.</div>
      ) : s.installing ? (
        <div className="small muted">Downloading inside the app. The install sheet opens when it finishes.</div>
      ) : s.error ? (
        <div className="small bad">Could not install automatically ({s.error}). Opened the download in your browser instead.</div>
      ) : (
        <div className="small muted">Downloads inside the app and installs over this version. Your data stays put.</div>
      )}
    </div>
  )
}
