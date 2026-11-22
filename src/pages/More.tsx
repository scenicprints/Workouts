import { Link } from 'react-router-dom'

const items = [
  { to: '/generate', title: 'Generate a program', meta: 'Goal, days, length. Done in a minute.' },
  { to: '/library/plans', title: 'Plans', meta: 'Multi-week schedules with progression' },
  { to: '/library/routines', title: 'Routines', meta: 'Reusable sessions with targets' },
  { to: '/library/exercises', title: 'Exercises', meta: 'Library, PRs and charts' },
  { to: '/friends', title: 'Friends', meta: 'Compare numbers through GitHub' },
  { to: '/settings', title: 'Settings', meta: 'Units, rest timer, backups, sync' },
]

export function More() {
  return (
    <div className="stack">
      <div className="page-head">
        <h1>More</h1>
      </div>
      <ul className="list">
        {items.map((i) => (
          <li key={i.to}>
            <Link className="list__item" to={i.to}>
              <span className="list__title">{i.title}</span>
              <span className="list__meta">{i.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
