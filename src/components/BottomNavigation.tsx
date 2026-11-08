import { NavLink, useLocation } from 'react-router-dom'

const items = [
  {
    to: '/',
    label: 'Today',
    paths: ['M8 3v4m8-4v4', 'M4 10h16', 'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2', 'm9 15 2 2 4-4'],
  },
  {
    to: '/history',
    label: 'History',
    paths: ['M3 11a9 9 0 1 1 2.6 7.4', 'M3 4v7h7', 'M12 7v5l3 2'],
  },
  {
    to: '/progress',
    label: 'Progress',
    paths: ['M4 4v16h16', 'm8 14 4-4 4 2 4-6', 'M16 6h4v4'],
  },
  {
    to: '/routines',
    label: 'Routines',
    paths: ['M9 4h11M9 12h11M9 20h11', 'M4 4h.01M4 12h.01M4 20h.01'],
  },
]

export default function BottomNavigation() {
  const { pathname } = useLocation()
  const inWorkout = pathname.startsWith('/workout/')

  return (
    <nav aria-label="Main navigation" className="bottom-navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          aria-current={item.to === '/' && inWorkout ? 'page' : undefined}
          className={({ isActive }) =>
            `bottom-navigation-tab${isActive || (item.to === '/' && inWorkout) ? ' is-active' : ''}`
          }
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.paths.map((path) => <path key={path} d={path} />)}
          </svg>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
