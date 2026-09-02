import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../api.js'
import HangoutCard from '../components/HangoutCard.jsx'
import { PlusIcon, SparkIcon } from '../components/icons.jsx'

export default function Dashboard() {
  const [hangouts, setHangouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const data = await api.hangouts()
      setHangouts(data)
    } catch (err) {
      setError(err.message || 'Failed to load hangouts')
    } finally {
      setLoading(false)
    }
  }

  const now = new Date()
  const upcoming = hangouts
    .filter((h) => new Date(h.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const past = hangouts
    .filter((h) => new Date(h.date) < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div className="dashboard">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="dashboard-header"
      >
        <div>
          <h1 className="dashboard-title">Hangouts</h1>
          <p className="dashboard-sub">the calendar's not gonna fill itself.</p>
        </div>
        <Link to="/hangouts/new" className="btn btn-primary btn-md">
          <PlusIcon size={16} />
          New Hangout
        </Link>
      </motion.div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="full-center" style={{ minHeight: 300 }}>
          <div className="loading pulse">Loading hangouts…</div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <div className="section-label">
                <SparkIcon size={15} />
                Upcoming
              </div>
              <div className="hangout-grid">
                {upcoming.map((h, i) => (
                  <HangoutCard key={h.id} hangout={h} index={i} />
                ))}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <div className="section-label">Wrapped</div>
              <div className="hangout-grid">
                {past.map((h, i) => (
                  <HangoutCard key={h.id} hangout={h} index={i} />
                ))}
              </div>
            </>
          )}

          {hangouts.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="empty-state"
            >
              <h3>Nothing booked</h3>
              <p>make the first move.</p>
              <Link to="/hangouts/new" className="btn btn-primary btn-md">
                <PlusIcon size={16} />
                Plan one
              </Link>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}