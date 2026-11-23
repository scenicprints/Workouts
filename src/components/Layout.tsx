import { NavLink, Outlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { RestTimerBar } from './RestTimerBar'
import { NumberPad } from './NumberPad'
import { unlockAudio } from '../lib/alerts'
import { useHealthAutoSync } from '../hooks/useHealthAutoSync'

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/workout', label: 'Workout', icon: BoltIcon },
  { to: '/history', label: 'History', icon: ClockIcon },
  { to: '/body', label: 'Body', icon: BodyIcon },
  { to: '/more', label: 'More', icon: DotsIcon },
]

export function Layout() {
  const active = useLiveQuery(() => db.sessions.where('finishedAt').equals(0).first(), [])
  useHealthAutoSync()
  return (
    <div className="app" onPointerDown={unlockAudio}>
      <main className="page">
        <Outlet />
      </main>
      <RestTimerBar />
      <NumberPad />
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? ' tab--active' : ''}`}>
            <span className="tab__icon">
              <t.icon />
              {t.to === '/workout' && active ? <span className="tab__dot" aria-label="Workout in progress" /> : null}
            </span>
            <span className="tab__label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

const svgProps = { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

function HomeIcon() {
  return (
    <svg {...svgProps}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}
function BoltIcon() {
  return (
    <svg {...svgProps}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function BodyIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M8 10h8l-1 5h-6z" />
      <path d="M10 15v6M14 15v6" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  )
}
