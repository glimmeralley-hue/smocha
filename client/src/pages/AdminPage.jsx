import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../AuthContext.jsx'
import { api } from '../api.js'
import Avatar from '../components/Avatar.jsx'
import {
  UsersIcon, TrashIcon, ShieldIcon, CalendarIcon, CameraIcon,
  CheckIcon, XIcon, SparkIcon,
} from '../components/icons.jsx'

export default function AdminPage() {
  const { user, refreshUser } = useAuth()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [hangouts, setHangouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null)

  const loadAll = async () => {
    try {
      const [s, u, h] = await Promise.all([
        api.admin.stats(),
        api.admin.users(),
        api.admin.hangouts(),
      ])
      setStats(s)
      setUsers(u)
      setHangouts(h)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleToggleAdmin = async (id) => {
    setBusyId(id)
    try {
      await api.admin.toggleAdmin(id)
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_admin: u.is_admin ? 0 : 1 } : u)))
      // If we changed our own role, refresh auth state
      if (Number(id) === Number(user?.id)) await refreshUser()
    } catch (err) {
      setError(err.message || 'Failed to update admin')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return
    setBusyId(confirmDeleteUser)
    try {
      await api.admin.deleteUser(confirmDeleteUser)
      setUsers((prev) => prev.filter((u) => u.id !== confirmDeleteUser))
      setConfirmDeleteUser(null)
      loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete user')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteHangout = async (id) => {
    if (!window.confirm('Delete this hangout for everyone?')) return
    setBusyId(id)
    try {
      await api.admin.deleteHangout(id)
      setHangouts((prev) => prev.filter((h) => h.id !== id))
      loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete hangout')
    } finally {
      setBusyId(null)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Wipe ALL non-admin users, hangouts, photos, and RSVPs? This can\'t be undone.')) return
    setBusyId('reset')
    try {
      await api.admin.resetDemo()
      setConfirmReset(false)
      loadAll()
    } catch (err) {
      setError(err.message || 'Reset failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="full-center" style={{ minHeight: 300 }}>
        <div className="loading pulse">Loading admin dock…</div>
      </div>
    )
  }

  const statCards = [
    { label: 'Crew', value: stats?.users ?? 0, icon: UsersIcon },
    { label: 'Hangouts', value: stats?.hangouts ?? 0, icon: CalendarIcon },
    { label: 'Photos', value: stats?.photos ?? 0, icon: CameraIcon },
    { label: 'Admins', value: stats?.admins ?? 0, icon: ShieldIcon },
    { label: 'RSVPs', value: stats?.rsvps ?? 0, icon: CheckIcon },
  ]

  return (
    <div className="admin-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="dashboard-header"
      >
        <div>
          <h1 className="dashboard-title">Admin</h1>
          <p className="dashboard-sub">the control room. be careful in here.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadAll} disabled={busyId === 'ref'}>
          <SparkIcon size={14} />
          Refresh
        </button>
      </motion.div>

      {error && <div className="form-error">{error}</div>}

      {/* Stats */}
      <div className="admin-stats">
        {statCards.map((c, i) => {
          const Icon = c.icon
          return (
            <div className="stat-card" key={c.label}>
              <span className="stat-icon"><Icon size={18} /></span>
              <div>
                <div className="stat-value">{c.value}</div>
                <div className="stat-label">{c.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Users */}
      <div className="admin-panel">
        <div className="admin-panel-head">
          <h3>Crew members</h3>
          <span className="admin-count">{users.length}</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th className="admin-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="admin-user-cell">
                      <Avatar person={u} size={30} online={u.online} />
                      <div>
                        <div className="admin-user-name">{u.nickname || u.username}</div>
                        <div className="admin-user-username">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-role ${u.is_admin ? 'is-admin' : ''}`}>
                      {u.is_admin ? 'admin' : 'member'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-status ${u.online ? 'online' : ''}`}>
                      {u.online ? 'online' : 'offline'}
                    </span>
                  </td>
                  <td className="admin-actions-col">
                    <div className="admin-actions">
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => handleToggleAdmin(u.id)}
                        disabled={busyId === u.id || Number(u.id) === Number(user?.id)}
                        title={Number(u.id) === Number(user?.id) ? "You can't change your own role" : u.is_admin ? 'Revoke admin' : 'Make admin'}
                      >
                        {u.is_admin ? <XIcon size={13} /> : <ShieldIcon size={13} />}
                        {u.is_admin ? 'Revoke' : 'Promote'}
                      </button>
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => setConfirmDeleteUser(u.id)}
                        disabled={busyId === u.id || u.is_admin}
                        title={u.is_admin ? 'Cannot delete an admin' : 'Delete user + their content'}
                      >
                        <TrashIcon size={13} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hangouts */}
      <div className="admin-panel">
        <div className="admin-panel-head">
          <h3>Hangouts</h3>
          <span className="admin-count">{hangouts.length}</span>
        </div>
        {hangouts.length === 0 ? (
          <p className="admin-empty">nothing booked yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Hangout</th>
                  <th>Host</th>
                  <th>Date</th>
                  <th>Going</th>
                  <th className="admin-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hangouts.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <div className="admin-hangout-cell">
                        {h.cover_photo && <img src={h.cover_photo} alt="" className="admin-thumb" />}
                        <span className="admin-hangout-title">{h.title}</span>
                      </div>
                    </td>
                    <td>{h.creator_nickname}</td>
                    <td>{new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td>{h.going_count || 0}{h.maybe_count ? ` + ${h.maybe_count} maybe` : ''}</td>
                    <td className="admin-actions-col">
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => handleDeleteHangout(h.id)}
                        disabled={busyId === h.id}
                      >
                        <TrashIcon size={13} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="admin-panel admin-danger">
        <div className="admin-panel-head">
          <h3>Danger zone</h3>
        </div>
        <div className="admin-danger-body">
          <p>Wipes every non-admin user, hangout, photo, and RSVP. Your admin account stays.</p>
          <button
            className="btn btn-danger btn-md"
            onClick={handleReset}
            disabled={busyId === 'reset'}
          >
            <TrashIcon size={14} />
            {busyId === 'reset' ? 'Wiping…' : 'Reset all demo data'}
          </button>
        </div>
      </div>

      {/* Delete user confirm dialog */}
      {confirmDeleteUser && (
        <div className="admin-modal-backdrop" onClick={() => setConfirmDeleteUser(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete member?</h3>
            <p>This permanently removes their profile, hangouts, photos, and RSVPs. No undo.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteUser(null)}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteUser} disabled={busyId === confirmDeleteUser}>
                <TrashIcon size={14} />
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}