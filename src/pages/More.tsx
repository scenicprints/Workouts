import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Calendar, ChevronRight, Dumbbell, Download, HeartPulse, ListChecks, Settings as SettingsIcon, Sparkles, Users } from 'lucide-react'
import { db } from '../db'
import { useUnit, useRestTimerEnabled } from '../hooks/useSettings'
import { useUpdateState } from '../lib/update'
import { loadSyncConfig } from '../lib/sync'
import { weeklyStreak, relativeDay } from '../lib/format'
import { healthPrefs } from '../lib/health'

export function More() {
  const unit = useUnit()
  const timerOn = useRestTimerEnabled()
  const update = useUpdateState()
  const name = useLiveQuery(async () => ((await db.settings.get('name'))?.value as string | undefined) ?? '', [], '')
  const counts = useLiveQuery(async () => {
    const [routines, exercises, plan, sessions, prefs, lastSync] = await Promise.all([
      db.routines.count(),
      db.exercises.count(),
      db.plans.filter((p) => p.active).first(),
      db.sessions.filter((s) => !!s.finishedAt && s.entries.length > 0).toArray(),
      healthPrefs.get(),
      db.settings.get('health.lastSync'),
    ])
    return { routines, exercises, plan, total: sessions.length, streak: weeklyStreak(sessions.map((s) => s.finishedAt!)), health: prefs.enabled, lastSync: lastSync?.value as number | undefined }
  }, [])
  const sync = loadSyncConfig()

  const row = (to: string, Icon: typeof Calendar, title: string, value?: string, tint = 't-lime') => (
    <li key={to + title}>
      <Link className="list__item" to={to} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <span className={`list__icon ${tint}`}>
          <Icon size={18} />
        </span>
        <span className="grow list__title" style={{ fontWeight: 500 }}>
          {title}
        </span>
        {value ? <span className="muted small">{value}</span> : null}
        <ChevronRight size={18} className="muted" />
      </Link>
    </li>
  )

  return (
    <div className="stack">
      <div className="row" style={{ gap: 14, padding: '10px 0 0' }}>
        <span className="avatar">{(name || 'W').slice(0, 1).toUpperCase()}</span>
        <div>
          <h1 style={{ fontSize: '1.4rem' }}>{name || 'Workouts'}</h1>
          <div className="muted small">
            {counts ? `${counts.total} workouts · ${counts.streak} week streak` : ''}
          </div>
        </div>
      </div>

      <div>
        <div className="section section--eyebrow">Training</div>
        <ul className="list">
          {row(counts?.plan ? `/plans/${counts.plan.id}` : '/library/plans', Calendar, 'Plan', counts?.plan?.name ?? 'None', 't-violet')}
          {row('/library/routines', ListChecks, 'Routines', counts ? String(counts.routines) : undefined, 't-lime')}
          {row('/library/exercises', Dumbbell, 'Exercises', counts ? String(counts.exercises) : undefined, 't-lime')}
          {row('/generate', Sparkles, 'Generate a program', undefined, 't-amber')}
        </ul>
      </div>

      <div>
        <div className="section section--eyebrow">Connected</div>
        <ul className="list">
          {row('/settings', HeartPulse, 'Health Connect', counts?.health ? (counts.lastSync ? `Synced ${relativeDay(counts.lastSync).toLowerCase()}` : 'On') : 'Off', 't-pink')}
          {row('/friends', Users, 'Friends', sync ? sync.name : 'Not set up', 't-sky')}
        </ul>
      </div>

      <div>
        <div className="section section--eyebrow">App</div>
        <ul className="list">
          {row('/settings', SettingsIcon, 'Settings', `${unit} · timer ${timerOn ? 'on' : 'off'}`, 't-violet')}
          {row('/settings', Download, 'Updates', update.currentName ? `${update.currentName}${update.latest !== null && update.latest > update.current ? ' · update ready' : ' · latest'}` : 'Web', 't-coral')}
        </ul>
      </div>
    </div>
  )
}
