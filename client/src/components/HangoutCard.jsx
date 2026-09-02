import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import Avatar from './Avatar.jsx'
import { MapPinIcon, CalendarIcon, CoffeeIcon, UsersIcon } from './icons.jsx'

function FlipDigit({ value }) {
  const str = String(value).padStart(2, '0')
  return (
    <span className="flip-digit">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={str}
          initial={{ y: -18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 18, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {str}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const diff = new Date(target) - now
  if (diff <= 0) return <span className="countdown-live">Happening now</span>

  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)

  return (
    <div className="countdown">
      <div className="count-unit">
        <FlipDigit value={d} />
        <span className="count-label">d</span>
      </div>
      <span className="count-sep">:</span>
      <div className="count-unit">
        <FlipDigit value={h} />
        <span className="count-label">h</span>
      </div>
      <span className="count-sep">:</span>
      <div className="count-unit">
        <FlipDigit value={m} />
        <span className="count-label">m</span>
      </div>
    </div>
  )
}

export default function HangoutCard({ hangout, index = 0 }) {
  const date = new Date(hangout.date)
  const isUpcoming = date >= new Date()

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 120, damping: 14 }}
      whileHover={{ y: -6 }}
      className="hangout-card"
    >
      <Link to={`/hangouts/${hangout.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        {hangout.cover_photo ? (
          <div className="hangout-cover-wrap">
            <img src={hangout.cover_photo} alt="" className="hangout-cover" />
            <div className="hangout-cover-overlay" />
          </div>
        ) : (
          <div className="hangout-cover-wrap">
            <div className="hangout-cover-cup">
              <CoffeeIcon size={52} />
            </div>
            <div className="hangout-cover-overlay" />
          </div>
        )}

        <div className="hangout-card-body">
          <div className="hangout-card-top">
            <span className="hangout-date">
              <CalendarIcon size={13} />
              {date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
              })}
            </span>
            {isUpcoming ? (
              <span className="hangout-status upcoming">upcoming</span>
            ) : (
              <span className="hangout-status past">wrapped</span>
            )}
          </div>

          <h3 className="hangout-title">{hangout.title}</h3>
          <p className="hangout-desc">{hangout.description || 'No details yet'}</p>

          <div className="hangout-loc">
            <MapPinIcon size={14} />
            {hangout.location}
          </div>

          {isUpcoming && <Countdown target={hangout.date} />}

          <div className="hangout-foot">
            <div className="hangout-going">
              <UsersIcon size={15} />
              <span className="going-text">
                {hangout.going_count || 0} down{hangout.maybe_count ? ` · ${hangout.maybe_count} maybe` : ''}
              </span>
            </div>

            <Avatar person={{ nickname: hangout.creator_nickname, avatar: hangout.creator_avatar }} size={22} />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}