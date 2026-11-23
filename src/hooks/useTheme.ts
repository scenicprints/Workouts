import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { db } from '../db'

export type ThemeChoice = 'light' | 'dark' | 'system'

export function useThemeChoice(): ThemeChoice {
  return useLiveQuery(async () => ((await db.settings.get('theme'))?.value as ThemeChoice | undefined) ?? 'dark', [], 'dark' as ThemeChoice)
}

/** Applies the chosen theme to <html data-theme> and keeps the Android bars in step. Dark is the default. */
export function useApplyTheme(): void {
  const choice = useThemeChoice()
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      const color = dark ? '#0e0f12' : '#f6f5f2'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
      if (Capacitor.isNativePlatform()) {
        StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
        StatusBar.setBackgroundColor({ color }).catch(() => {})
      }
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [choice])
}
