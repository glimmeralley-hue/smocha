import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../api.js'
import { ImageIcon, MapPinIcon, CalendarIcon, WalletIcon, ArrowLeftIcon, SendIcon } from '../components/icons.jsx'

export default function NewHangout() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')
  const [budget, setBudget] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)

  const handleFile = (file) => {
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('description', description.trim())
      fd.append('location', location.trim())
      fd.append('date', new Date(date).toISOString())
      fd.append('budget', budget || '0')
      if (coverFile) fd.append('cover', coverFile)

      const hangout = await api.createHangout(fd)
      navigate(`/hangouts/${hangout.id}`)
    } catch (err) {
      setError(err.message || 'Failed to create hangout')
      setLoading(false)
    }
  }

  return (
    <div className="new-hangout">
      <button className="detail-back" onClick={() => navigate(-1)}>
        <ArrowLeftIcon size={16} />
        back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="page-title">New Hangout</h1>
        <p className="page-sub">put it on the books.</p>

        <form onSubmit={handleSubmit} className="new-hangout-form">
          <div className="form-row">
            <label className="form-label">Cover photo</label>
            <div
              className={`file-drop ${dragging ? 'dragging' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
            >
              {coverPreview ? (
                <img src={coverPreview} alt="cover preview" className="file-preview" />
              ) : (
                <>
                  <ImageIcon size={30} />
                  <p style={{ marginTop: 10 }}>Drag a photo here, or click to browse</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
          </div>

          <div className="form-row">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunset rooftop sesh"
              required
            />
          </div>

          <div className="form-row">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="what's the vibe? who's bringing what?"
              rows={3}
            />
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label className="form-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MapPinIcon size={13} /> Location
                </span>
              </label>
              <input
                className="form-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="where at?"
                required
              />
            </div>

            <div className="form-row">
              <label className="form-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CalendarIcon size={13} /> Date & time
                </span>
              </label>
              <input
                className="form-input"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <WalletIcon size={13} /> Budget <span style={{ opacity: 0.5 }}>(optional)</span>
              </span>
            </label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
            <SendIcon size={16} />
            {loading ? 'Creating…' : 'Create hangout'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}