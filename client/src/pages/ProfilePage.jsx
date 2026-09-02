import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import HangoutCard from '../components/HangoutCard.jsx'
import { EditIcon, CameraIcon, CheckIcon, XIcon, CalendarIcon, MapPinIcon } from '../components/icons.jsx'

export default function ProfilePage() {
  const { id } = useParams()
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const isMe = user?.id === Number(id)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    try {
      const data = await api.user(id)
      setProfile(data)
      setNickname(data.nickname)
      setBio(data.bio || '')
    } catch (err) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = () => {
    setNickname(profile.nickname)
    setBio(profile.bio || '')
    setEditing(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const updated = await api.updateMe({ nickname, bio })
      setProfile((p) => ({ ...p, ...updated }))
      updateUser(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await api.uploadAvatar(file)
      setProfile((p) => ({ ...p, avatar: data.avatar }))
      updateUser({ avatar: data.avatar })
    } catch (err) {
      setError(err.message || 'Avatar upload failed')
    }
  }

  if (loading) return <div className="full-center"><div className="loading pulse">Loading…</div></div>
  if (error && !profile) return <div className="full-center"><div className="form-error">{error}</div></div>
  if (!profile) return null

  return (
    <div className="profile-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="profile-hero"
      >
        <div className="profile-avatar-wrap" onClick={() => isMe && fileRef.current?.click()}>
          <Avatar person={profile} size={96} online={isMe} isYou={isMe} />
          {isMe && (
            <div className="profile-avatar-edit">
              <CameraIcon size={16} />
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleAvatar}
          style={{ display: 'none' }}
        />

        <div className="profile-info">
          {editing ? (
            <>
              <input
                className="form-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{ maxWidth: 280 }}
              />
              <textarea
                className="form-textarea"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                style={{ maxWidth: 420, marginTop: 10 }}
              />
              <div className="profile-edit-actions">
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                  <CheckIcon size={14} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                  <XIcon size={14} />
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="profile-name">{profile.nickname}</h1>
              <p className="profile-username">@{profile.username}</p>
              {profile.bio && <p className="profile-bio">{profile.bio}</p>}
              {isMe && (
                <button className="btn btn-secondary btn-sm" onClick={startEdit}>
                  <EditIcon size={14} />
                  Edit profile
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>

      {error && <div className="form-error">{error}</div>}

      <div className="section-label">
        <CalendarIcon size={15} />
        {isMe ? 'Your hangouts' : `${profile.nickname}'s hangouts`}
      </div>

      {profile.hangouts?.length > 0 ? (
        <div className="hangout-grid">
          {profile.hangouts.map((h, i) => (
            <HangoutCard key={h.id} hangout={h} index={i} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No hangouts yet</h3>
          <p>{isMe ? 'your moves will show up here.' : 'nothing on the calendar yet.'}</p>
        </div>
      )}
    </div>
  )
}