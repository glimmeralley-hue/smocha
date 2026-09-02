import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { api } from '../api.js'
import EventCard from '../components/EventCard.jsx'
import { CompassIcon, RefreshIcon, LinkIcon, PlusIcon, TrashIcon } from '../components/icons.jsx'

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'hiking', label: 'Hiking' },
  { key: 'nightlife', label: 'Nightlife' },
  { key: 'food', label: 'Food & Drink' },
  { key: 'arts', label: 'Arts' },
  { key: 'third-space', label: 'Third Spaces' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'community', label: 'Community' },
]

const PLATFORMS = ['instagram', 'tiktok', 'x', 'eventbrite']

export default function Events() {
  const { user, isAdmin } = useAuth()
  const [events, setEvents] = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')

  // Admin panel state
  const [showAdmin, setShowAdmin] = useState(false)
  const [sources, setSources] = useState([])
  const [newSource, setNewSource] = useState({ platform: 'instagram', handle: '', category_bias: 'community' })
  const [importUrl, setImportUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (cat) => {
    setLoading(true)
    setError('')
    try {
      const data = await api.events(cat)
      setEvents(data.events || [])
      setFetchedAt(data.fetched_at)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(category)
  }, [category, load])

  const loadSources = useCallback(() => {
    if (!isAdmin) return
    api.admin.eventSources().then(setSources).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  const handleRefresh = async () => {
    setRefreshing(true)
    setNotice('')
    try {
      const r = await api.admin.refreshEvents()
      setNotice(r.skipped ? 'Refresh already running' : `Refreshed — ${r.added || 0} new, ${r.updated || 0} updated`)
      await load(category)
      loadSources()
    } catch (err) {
      setNotice(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const handleHide = async (ev) => {
    try {
      await api.admin.setEventHidden(ev.id, !ev.hidden)
      if (ev.hidden) {
        load(category)
      } else {
        setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, hidden: 1 } : e)))
      }
    } catch (err) {
      setNotice(err.message)
    }
  }
  const handleAddSource = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.admin.addEventSource(newSource)
      setNewSource({ platform: 'instagram', handle: '', category_bias: 'community' })
      loadSources()
    } catch (err) {
      setNotice(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (e) => {
    e.preventDefault()
    if (!importUrl.trim()) return
    setBusy(true)
    setNotice('Importing post…')
    try {
      await api.admin.importEvent(importUrl.trim())
      setImportUrl('')
      setNotice('Post imported to the feed')
      await load(category)
    } catch (err) {
      setNotice(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteSource = async (id) => {
    try {
      await api.admin.deleteEventSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      setNotice(err.message)
    }
  }

  const handleToggleSource = async (src) => {
    try {
      await api.admin.updateEventSource(src.id, { active: !src.active })
      setSources((prev) => prev.map((s) => (s.id === src.id ? { ...s, active: src.active ? 0 : 1 } : s)))
    } catch (err) {
      setNotice(err.message)
    }
  }

  return (
    <div className="events-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">
          <CompassIcon size={26} className="events-title-icon" /> Outings Feed
        </h1>
        <p className="dashboard-sub">
          Latest hikes, third spaces & nights out around Nairobi — scraped from the crew's favourite plugs.
        </p>
      </div>

      {isAdmin && (
        <div className="events-admin-bar">
          <button className="events-admin-btn" onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon size={15} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Scraping…' : 'Refresh feed'}
          </button>
          <button className="events-admin-btn ghost" onClick={() => setShowAdmin((v) => !v)}>
            <PlusIcon size={15} />
            {showAdmin ? 'Close sources' : 'Manage sources'}
          </button>
          {notice && <span className="events-notice">{notice}</span>}
        </div>
      )}

      {isAdmin && showAdmin && (
        <div className="events-admin-panel">
          <form className="events-import-row" onSubmit={handleImport}>
            <input
              type="url"
              placeholder="Paste an Instagram post, TikTok video or tweet link…"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <button type="submit" disabled={busy || !importUrl.trim()}>
              <LinkIcon size={15} /> Import post
            </button>
          </form>

          <form className="events-source-row" onSubmit={handleAddSource}>
            <select
              value={newSource.platform}
              onChange={(e) => setNewSource((s) => ({ ...s, platform: e.target.value }))}
            >
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              placeholder="handle (e.g. diplomattrekkers)"
              value={newSource.handle}
              onChange={(e) => setNewSource((s) => ({ ...s, handle: e.target.value }))}
            />
            <select
              value={newSource.category_bias}
              onChange={(e) => setNewSource((s) => ({ ...s, category_bias: e.target.value }))}
            >
              {CATEGORIES.filter((c) => c.key).map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <button type="submit" disabled={busy || newSource.handle.trim().length < 2}>Add source</button>
          </form>

          <div className="events-source-list">
            {sources.map((s) => (
              <div key={s.id} className={`events-source-item ${s.active ? '' : 'off'}`}>
                <span className="src-platform">{s.platform}</span>
                <span className="src-handle">@{s.handle}</span>
                <span className="src-status" title={s.last_status || ''}>{s.last_status || s.status}</span>
                <button className="src-btn" onClick={() => handleToggleSource(s)}>
                  {s.active ? 'Pause' : 'Resume'}
                </button>
                <button className="src-btn danger" onClick={() => handleDeleteSource(s.id)} title="Remove">
                  <TrashIcon size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="events-chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.key || 'all'}
            className={`chip ${category === c.key ? 'active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {fetchedAt && (
        <p className="events-fetched">feed last scraped {new Date(fetchedAt).toLocaleString()}</p>
      )}

      {loading ? (
        <div className="full-center"><div className="loading pulse">Loading the outings…</div></div>
      ) : error ? (
        <div className="empty-state">{error}</div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          No outings here yet{category ? ` in ${category}` : ''}. An admin can hit “Refresh feed” to scrape the latest.
        </div>
      ) : (
        <div className="hangout-grid">
          {events.map((ev, i) => (
            <EventCard
              key={ev.id}
              event={ev}
              index={i}
              isAdmin={isAdmin}
              onHide={handleHide}
            />
          ))}
        </div>
      )}
    </div>
  )
}