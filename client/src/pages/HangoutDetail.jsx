import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import {
  ArrowLeftIcon, MapPinIcon, CalendarIcon, WalletIcon, CameraIcon,
  CheckIcon, MinusIcon, XIcon, TrashIcon, UsersIcon, ClockIcon, CoffeeIcon,
} from '../components/icons.jsx'

export default function HangoutDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [hangout, setHangout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    try {
      const data = await api.hangout(id)
      setHangout(data)
    } catch (err) {
      setError(err.message || 'Failed to load hangout')
    } finally {
      setLoading(false)
    }
  }

  const handleRsvp = async (status) => {
    if (!hangout) return
    const prev = hangout.my_status
    const next = prev === status ? null : status
    setHangout((h) => ({ ...h, my_status: next }))
    try {
      await api.rsvp(id, next)
      load()
    } catch {
      setHangout((h) => ({ ...h, my_status: prev }))
    }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await api.uploadPhoto(id, file)
      load()
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this hangout for everyone?')) return
    setDeleting(true)
    try {
      await api.deleteHangout(id)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Delete failed')
      setDeleting(false)
    }
  }

  if (loading) return <div className="full-center"><div className="loading pulse">Loading…</div></div>
  if (error && !hangout) return <div className="full-center"><div className="form-error">{error}</div></div>
  if (!hangout) return null

  const date = new Date(hangout.date)
  const isPast = date < new Date()
  const going = hangout.rsvps?.filter((r) => r.status === 'down') || []
  const maybe = hangout.rsvps?.filter((r) => r.status === 'maybe') || []
  const photos = hangout.photos || []
  const isCreator = user?.id === hangout.created_by

  const rsvpBtn = (status, label, activeClass, Icon) => (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => handleRsvp(status)}
      className={`rsvp-btn ${hangout.my_status === status ? activeClass : ''}`}
    >
      <Icon size={15} />
      {label}
    </motion.button>
  )

  return (
    <div className="detail-page">
      <button className="detail-back" onClick={() => navigate(-1)}>
        <ArrowLeftIcon size={16} />
        back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="detail-cover">
          {hangout.cover_photo ? (
            <img src={hangout.cover_photo} alt={hangout.title} />
          ) : (
            <div className="detail-cover-placeholder">
              <CoffeeIcon size={64} />
            </div>
          )}
        </div>

        <div className="detail-head">
          <div>
            <h1 className="detail-title">{hangout.title}</h1>
            <p className="detail-host">
              Hosted by <strong>{hangout.creator_nickname}</strong>
            </p>
          </div>
          <span className={`hangout-status ${isPast ? 'past' : 'upcoming'}`}>
            {isPast ? 'wrapped' : 'upcoming'}
          </span>
        </div>

        <div className="detail-meta">
          <span><MapPinIcon size={15} /> {hangout.location}</span>
          <span><CalendarIcon size={15} /> {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span><ClockIcon size={15} /> {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span className={`detail-budget ${hangout.budget > 0 ? '' : 'none'}`}>
            <WalletIcon size={14} />
            {hangout.budget > 0 ? `$${hangout.budget} budget` : 'no budget set'}
          </span>
        </div>

        {hangout.description && (
          <p className="detail-description">{hangout.description}</p>
        )}

        {!isPast && (
          <div className="rsvp-row">
            {rsvpBtn('down', 'Down', 'active-down', CheckIcon)}
            {rsvpBtn('maybe', 'Maybe', 'active-maybe', MinusIcon)}
            {rsvpBtn('no', 'Can\'t', 'active-no', XIcon)}
          </div>
        )}

        <div className="detail-crew">
          <div className="detail-crew-title">
            <UsersIcon size={15} />
            {going.length} down · {maybe.length} maybe
          </div>
          <div className="going-row">
            {going.map((r) => (
              <Link to={`/profile/${r.user_id}`} key={r.user_id} className="going-pill">
                <Avatar person={{ nickname: r.nickname, avatar: r.avatar }} size={22} />
                {r.nickname}
              </Link>
            ))}
            {maybe.map((r) => (
              <Link to={`/profile/${r.user_id}`} key={r.user_id} className="going-pill maybe">
                <Avatar person={{ nickname: r.nickname, avatar: r.avatar }} size={22} />
                {r.nickname}
              </Link>
            ))}
          </div>
        </div>

        <div className="photo-section">
          <div className="photo-title">
            <CameraIcon size={15} />
            Photos
          </div>
          <div className="photo-grid">
            {photos.map((p) => (
              <motion.div
                key={p.id}
                whileHover={{ scale: 1.03 }}
                className="photo-tile"
                onClick={() => setLightbox(p)}
              >
                <img src={p.photo_url} alt="" />
              </motion.div>
            ))}
            <motion.div
              whileHover={{ scale: 1.03 }}
              className="photo-tile photo-upload-tile"
              onClick={() => fileRef.current?.click()}
            >
              <CameraIcon size={26} />
              <span>{uploading ? 'Uploading…' : 'Add photo'}</span>
            </motion.div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
        </div>

        {isCreator && (
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
            <TrashIcon size={14} />
            {deleting ? 'Deleting…' : 'Delete hangout'}
          </button>
        )}
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lightbox"
            onClick={() => setLightbox(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={lightbox.photo_url}
              alt=""
              className="lightbox-img"
            />
            <button className="lightbox-close" onClick={() => setLightbox(null)}>
              <XIcon size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}