import { motion } from 'framer-motion'
import { MapPinIcon, MountainIcon, EyeOffIcon } from './icons.jsx'

const CATEGORY_LABELS = {
  hiking: 'Hiking',
  nightlife: 'Nightlife',
  arts: 'Arts',
  food: 'Food & Drink',
  fitness: 'Fitness',
  'third-space': 'Third Spaces',
  community: 'Community',
}

const SOURCE_LABELS = {
  eventbrite: 'Eventbrite',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
}

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export default function EventCard({ event, index = 0, isAdmin = false, onHide }) {
  const dateLabel = formatDate(event.starts_at)
  const priceLabel =
    event.price === null || event.price === undefined
      ? null
      : event.price === 0
        ? 'Free'
        : `From KSh ${event.price.toLocaleString()}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.06, 0.5), type: 'spring', stiffness: 120, damping: 14 }}
      whileHover={{ y: -6 }}
      className={`event-card ${event.hidden ? 'event-hidden' : ''}`}
    >
      <a
        href={event.link || event.remote_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {event.image_path ? (
          <div className="event-cover-wrap">
            <img src={event.image_path} alt="" className="event-cover" loading="lazy" />
            <div className="event-cover-overlay" />
            {dateLabel && <span className="event-date-badge">{dateLabel}</span>}
          </div>
        ) : (
          <div className="event-cover-wrap">
            <div className="event-cover-placeholder">
              <MountainIcon size={44} />
            </div>
            <div className="event-cover-overlay" />
            {dateLabel && <span className="event-date-badge">{dateLabel}</span>}
          </div>
        )}

        <div className="event-card-body">
          <div className="event-card-top">
            <span className={`event-category cat-${event.category}`}>
              {CATEGORY_LABELS[event.category] || 'Community'}
            </span>
            <span className="event-source">{SOURCE_LABELS[event.source] || event.source}</span>
          </div>

          <h3 className="event-title">{event.title}</h3>

          {event.description && <p className="event-desc">{event.description}</p>}

          {event.location && (
            <div className="event-loc">
              <MapPinIcon size={14} />
              {event.location}
            </div>
          )}

          <div className="event-foot">
            {event.external_account && event.source !== 'eventbrite' && (
              <span className="event-account">@{event.external_account.replace(/^@/, '')}</span>
            )}
            {priceLabel && <span className="event-price">{priceLabel}</span>}
          </div>
        </div>
      </a>

      {isAdmin && (
        <button
          className="event-hide-btn"
          title={event.hidden ? 'Show in feed' : 'Hide from feed'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onHide?.(event)
          }}
        >
          <EyeOffIcon size={15} />
        </button>
      )}
    </motion.div>
  )
}