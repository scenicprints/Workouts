import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { isNativeApp, syncHealth } from '../lib/health'

/** In the Android app, pull from Health Connect on launch and whenever the app comes back to the foreground. */
export function useHealthAutoSync() {
  useEffect(() => {
    if (!isNativeApp()) return
    let last = 0
    const run = () => {
      if (Date.now() - last < 60000) return
      last = Date.now()
      syncHealth().catch(() => {})
    }
    run()
    const sub = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) run()
    })
    return () => {
      void sub.then((s) => s.remove())
    }
  }, [])
}
