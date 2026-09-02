import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../AuthContext.jsx'
import { api } from '../api.js'
import Avatar from './Avatar.jsx'
import { HomeIcon, PlusIcon, UserIcon, UsersIcon, LogoutIcon, CoffeeIcon, ShieldIcon, CompassIcon } from './icons.jsx'
import ThemeToggle from './ThemeToggle.jsx'

export default function AppShell({ children }) {
  const { user, isAdmin, logout } = useAuth()
  const [crew, setCrew] = useState([])
  const [serverReachable, setServerReachable] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()

  // Presence heartbeat — keeps last_seen fresh while the app is open.
  // This is what makes you show "online" and stay online.
  useEffect(() => {
    let alive = true
    const beat = () => {
      api.heartbeat()
        .then((data) => {
          if (!alive) return
          setServerReachable(true)
          if (data.crew) setCrew(data.crew)
        })
        .catch(() => {
          if (alive) setServerReachable(false)
        })
    }
    beat() // fire immediately on mount so you show online right away
    const t = setInterval(beat, 45 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Initial crew load before first heartbeat completes
  useEffect(() => {
    api.crew()
      .then(setCrew)
      .catch(() => setServerReachable(false))
  }, [])

  const navItems = [
    { to: '/dashboard', label: 'Hangouts', icon: HomeIcon },
    { to: '/events', label: 'Outings Feed', icon: CompassIcon },
    { to: '/hangouts/new', label: 'New Hangout', icon: PlusIcon },
    { to: '/crew', label: 'The Crew', icon: UsersIcon },
  ]

  const mobileNavItems = [
    { to: '/dashboard', label: 'Hangouts', icon: HomeIcon },
    { to: '/events', label: 'Outings', icon: CompassIcon },
    { to: '/hangouts/new', label: 'New', icon: PlusIcon },
    { to: '/crew', label: 'Crew', icon: UsersIcon },
    { to: `/profile/${user?.id || ''}`, label: 'Profile', icon: UserIcon },
  ]

  const isActive = (path) =>
    path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname.startsWith(path)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      {/* Backend down banner */}
      {!serverReachable && (
        <div className="server-banner">
          can't reach the crew server — showing what we last had. reconnect and it'll come back.
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sidebar">
        <Link to="/dashboard" style={{ textDecoration: 'none' }}>
          <div className="sidebar-brand">
            <CoffeeIcon size={22} />
            <span>HANGOUTS</span>
          </div>
        </Link>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`sidebar-link ${isActive(item.to) ? 'active' : ''}`}
              >
                <span className="sidebar-icon"><Icon size={18} /></span>
                {item.label}
              </Link>
            )
          })}
          <Link
            to={`/profile/${user?.id || ''}`}
            className={`sidebar-link ${location.pathname.startsWith('/profile') ? 'active' : ''}`}
          >
            <span className="sidebar-icon"><UserIcon size={18} /></span>
            My Profile
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className={`sidebar-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
            >
              <span className="sidebar-icon"><ShieldIcon size={18} /></span>
              Admin
            </Link>
          )}
        </nav>

        <div className="sidebar-section">The Crew</div>
        <div className="sidebar-crew">
          {crew.map((member) => (
            <motion.div
              key={member.id}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              className="crew-bubble-wrap"
            >
              <Link to={`/profile/${member.id}`} className="crew-bubble-link">
                <Avatar
                  person={member}
                  size={38}
                  online={member.online}
                  isYou={member.id === user?.id}
                />
                <span className="crew-tooltip">{member.nickname}</span>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <Link to={`/profile/${user?.id}`} style={{ textDecoration: 'none', minWidth: 0 }}>
            <div className="sidebar-me">
              <Avatar person={user} size={34} online isYou />
              <span className="sidebar-me-name">{user?.nickname}</span>
            </div>
          </Link>
          <div className="sidebar-actions">
            <ThemeToggle />
            <button className="sidebar-logout" onClick={handleLogout} title="Leave">
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="mobile-top">
        <Link to="/dashboard" style={{ textDecoration: 'none' }}>
          <span className="sidebar-brand" style={{ marginBottom: 0 }}>
            <CoffeeIcon size={18} />
            <span>HANGOUTS</span>
          </span>
        </Link>
        <div className="mobile-top-right">
          <ThemeToggle />
          <Link to={`/profile/${user?.id || ''}`}>
            <Avatar person={user} size={32} online isYou />
          </Link>
        </div>
      </div>

      {/* Mobile crew row */}
      <div className="mobile-crew-row">
        {crew.map((member) => (
          <Link key={member.id} to={`/profile/${member.id}`} title={member.nickname}>
            <Avatar person={member} size={34} online={member.online} isYou={member.id === user?.id} />
          </Link>
        ))}
      </div>

      {/* Main content */}
      <main className="main-content">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tabbar">
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.to)
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`mobile-tab ${active ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
        {isAdmin && (
          <Link
            to="/admin"
            className={`mobile-tab ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
          >
            <ShieldIcon size={20} />
            <span>Admin</span>
          </Link>
        )}
      </nav>
    </div>
  )
}