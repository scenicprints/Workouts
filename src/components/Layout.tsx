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
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/workout', label: 'Workout', icon: Dumbbell },
  { to: '/history', label: 'History', icon: History },
  { to: '/body', label: 'Body', icon: PersonStanding },
  { to: '/more', label: 'More', icon: MoreHorizontal },
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
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? ' tab--active' : ''}`}>
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
