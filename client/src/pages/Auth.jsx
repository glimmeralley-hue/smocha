import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext.jsx'
import { api } from '../api.js'
import { CoffeeIcon, CameraIcon, SparkIcon } from '../components/icons.jsx'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [passcode, setPasscode] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)

  const { login, signup, updateUser } = useAuth()
  const navigate = useNavigate()

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const handleAvatar = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const user = await login(username.trim(), password)
        navigate('/dashboard')
      } else {
        if (!passcode.trim()) throw new Error('Crew passcode required')
        const user = await signup({
          passcode: passcode.trim().toUpperCase(),
          username: username.trim(),
          password,
          nickname: nickname.trim(),
          bio,
        })
        if (avatarFile) {
          try {
            const data = await api.uploadAvatar(avatarFile)
            updateUser({ avatar: data.avatar })
          } catch {
            // avatar upload is optional — don't block signup
          }
        }
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="auth-card"
      >
        <div className="auth-logo-row">
          <CoffeeIcon size={26} />
          <span className="auth-logo">SMOCHA</span>
        </div>
        <p className="auth-tagline">
          {mode === 'login' ? 'welcome back, crew.' : 'join the crew.'}
        </p>

        <div className="auth-toggle">
          <button
            className={`auth-toggle-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            className={`auth-toggle-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Join
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            initial={{ opacity: 0, x: mode === 'login' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === 'login' ? 16 : -16 }}
            transition={{ duration: 0.3 }}
            onSubmit={handleSubmit}
          >
            {mode === 'signup' && (
              <div className="form-row auth-avatar-row">
                <div
                  className="auth-avatar-upload"
                  onClick={() => fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="preview" className="auth-avatar-preview" />
                  ) : (
                    <div className="auth-avatar-placeholder">
                      <CameraIcon size={22} />
                      <span>Add photo</span>
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
              </div>
            )}

            {mode === 'signup' && (
              <div className="form-row">
                <label className="form-label">Nickname</label>
                <input
                  className="form-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="what the crew calls you"
                  required
                />
              </div>
            )}

            <div className="form-row">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourname"
                required
              />
            </div>

            <div className="form-row">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {mode === 'signup' && (
              <>
                <div className="form-row">
                  <label className="form-label">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <SparkIcon size={13} /> Crew Passcode
                    </span>
                  </label>
                  <input
                    className="form-input"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="SMOCHA"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
                    required
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Bio <span style={{ opacity: 0.5 }}>(optional)</span></label>
                  <textarea
                    className="form-textarea"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="a little about you…"
                    rows={2}
                  />
                </div>
              </>
            )}

            {error && <div className="form-error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? '…' : mode === 'login' ? 'Sign in' : 'Join the crew'}
            </button>
          </motion.form>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}