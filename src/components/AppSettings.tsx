import { Capacitor } from '@capacitor/core'
import { checkForUpdate, installUpdate, updateAvailable, useUpdateState, WEB_URL } from '../lib/update'
import { relativeDay } from '../lib/format'

export function AppSettings() {
  const s = useUpdateState()
  const native = Capacitor.isNativePlatform()
  return (
    <div className="card">
      <div className="row row--between">
        <div className="card__title">App</div>
        <span className="muted small">{native ? `Android build ${s.currentName || '…'}` : 'Web app'}</span>
      </div>
      {native ? (
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted small">
            {s.latest === null ? 'Not checked yet.' : updateAvailable(s) ? `Version ${s.latestName} is available.` : `You are on the latest version.`}
            {s.checkedAt ? ` Checked ${relativeDay(s.checkedAt).toLowerCase()}.` : ''}
            {s.error ? ` Last check failed: ${s.error}.` : ''}
          </p>
          <div className="row">
            {updateAvailable(s) ? (
              <button type="button" className="btn btn--primary" onClick={() => installUpdate()}>
                Download update
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={() => checkForUpdate(true)} disabled={s.checking}>
              {s.checking ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
          <p className="muted small">Updates download from GitHub Releases and install over this version. Your data stays on the phone.</p>
        </div>
      ) : (
        <p className="muted small">
          The web app updates itself. When a new version is ready you get a Reload prompt at the top of the page. Install it from Chrome's menu with "Add to Home screen" to use it like an app. {''}
          <a href={WEB_URL}>{WEB_URL}</a>
        </p>
      )}
    </div>
  )
}
