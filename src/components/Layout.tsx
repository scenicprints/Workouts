import { NavLink, Outlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Dumbbell, History, House, MoreHorizontal, PersonStanding } from 'lucide-react'
import { db } from '../db'
import { RestTimerBar } from './RestTimerBar'
import { NumberPad } from './NumberPad'
import { UpdateBanner } from './UpdateBanner'
import { unlockAudio } from '../lib/alerts'
import { useHealthAutoSync } from '../hooks/useHealthAutoSync'
import { useApplyTheme } from '../hooks/useTheme'

const tabs = [
  { to: '/', label: 'Home', icon: House, end: true, cls: 'tab--home' },
  { to: '/workout', label: 'Workout', icon: Dumbbell, cls: 'tab--workout' },
  { to: '/history', label: 'History', icon: History, cls: 'tab--history' },
  { to: '/body', label: 'Body', icon: PersonStanding, cls: 'tab--body' },
  { to: '/more', label: 'More', icon: MoreHorizontal, cls: 'tab--more' },
]

export function Layout() {
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  useHealthAutoSync()
  useApplyTheme()
  return (
    <div className="app" onPointerDown={unlockAudio}>
      <main className="page">
        <UpdateBanner />
        <Outlet />
      </main>
      <RestTimerBar />
      <NumberPad />
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${t.cls}${isActive ? ' tab--active' : ''}`}>
            <span className="tab__icon">
              <t.icon size={24} strokeWidth={2} aria-hidden="true" />
              {t.to === '/workout' && active ? <span className="tab__dot" aria-label="Workout in progress" /> : null}
            </span>
            <span className="tab__label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
