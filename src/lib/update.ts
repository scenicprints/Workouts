import { useSyncExternalStore } from 'react'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor, registerPlugin } from '@capacitor/core'

interface UpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>
  openInstallSettings(): Promise<void>
  download(o: { url: string }): Promise<{ bytes: number }>
}
const Updater = registerPlugin<UpdaterPlugin>('Updater')

/**
 * Update checks for both builds.
 * - Android: compare this APK's build number with the latest GitHub release and offer the download.
 * - Web: the service worker reports when a new version is waiting; offer a reload.
 */
export const RELEASES_API = 'https://api.github.com/repos/scenicprints/Workouts/releases/latest'
export const APK_URL = 'https://github.com/scenicprints/Workouts/releases/latest/download/workouts.apk'
export const WEB_URL = 'https://scenicprints.github.io/Workouts/'

export interface UpdateState {
  /** Installed build number (Android) or 0 on the web. */
  current: number
  currentName: string
  /** Newest build number on GitHub, once checked. */
  latest: number | null
  latestName: string | null
  checkedAt: number | null
  checking: boolean
  /** Android: an APK is being downloaded for install. */
  installing: boolean
  /** Android: the OS has not yet allowed this app to install packages. */
  needsPermission: boolean
  error: string | null
  /** Web only: a fresh service worker is waiting. */
  webUpdateReady: boolean
  reloadWeb: (() => void) | null
}

let state: UpdateState = { current: 0, currentName: '', latest: null, latestName: null, checkedAt: null, checking: false, installing: false, needsPermission: false, error: null, webUpdateReady: false, reloadWeb: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch }
  emit()
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export const updateAvailable = (s: UpdateState) => (s.latest !== null && s.current > 0 && s.latest > s.current) || s.webUpdateReady

/** "android-v0.2.17" → 17. Anything unparseable → null. */
export function buildNumberFromTag(tag: string): number | null {
  const m = /(\d+)\s*$/.exec(tag.trim())
  return m ? Number(m[1]) : null
}

const CACHE_KEY = 'workouts.update'

export async function checkForUpdate(force = false): Promise<UpdateState> {
  if (!Capacitor.isNativePlatform()) return state
  if (state.current === 0) {
    try {
      const info = await App.getInfo()
      set({ current: Number(info.build) || 0, currentName: info.version })
    } catch {
      // keep 0; the compare below is skipped
    }
  }
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { latest: number; latestName: string; at: number } | null
    if (!force && cached && Date.now() - cached.at < 6 * 3600000) {
      set({ latest: cached.latest, latestName: cached.latestName, checkedAt: cached.at })
      return state
    }
  } catch {
    // ignore cache
  }
  set({ checking: true, error: null })
  try {
    const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) throw new Error(`GitHub ${r.status}`)
    const json = (await r.json()) as { tag_name: string }
    const latest = buildNumberFromTag(json.tag_name)
    if (latest === null) throw new Error(`Unexpected tag ${json.tag_name}`)
    const at = Date.now()
    localStorage.setItem(CACHE_KEY, JSON.stringify({ latest, latestName: json.tag_name, at }))
    set({ latest, latestName: json.tag_name.replace(/^android-v/, ''), checkedAt: at, checking: false })
  } catch (err) {
    set({ checking: false, error: (err as Error).message })
  }
  return state
}

/**
 * Android: download the APK into the app cache and open the installer; the file is deleted on the
 * next launch so nothing accumulates. Falls back to the browser if the native updater is missing.
 */
export async function installUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(APK_URL, '_blank', 'noopener')
    return
  }
  set({ error: null })
  try {
    const { allowed } = await Updater.canInstall()
    if (!allowed) {
      set({ needsPermission: true })
      await Updater.openInstallSettings()
      return
    }
    set({ installing: true, needsPermission: false })
    await Updater.download({ url: APK_URL })
  } catch (err) {
    set({ error: (err as Error).message })
    try {
      await Browser.open({ url: APK_URL })
    } catch {
      // nothing more we can do
    }
  } finally {
    set({ installing: false })
  }
}

/** Called by the service worker registration on the web. */
export function markWebUpdate(reload: () => void): void {
  set({ webUpdateReady: true, reloadWeb: reload })
}
