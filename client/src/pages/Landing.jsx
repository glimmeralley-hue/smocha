import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../api.js'
import { CoffeeIcon, SparkIcon, ArrowLeftIcon } from '../components/icons.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

export default function Landing() {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(0)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.checkPasscode(passcode)
      navigate('/auth')
    } catch (err) {
      setError(err.message || 'Wrong passcode')
      setShake((s) => s + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="landing">
      {/* Theme toggle */}
      <ThemeToggle className="theme-toggle-corner" />

      {/* Ambient glow orbs */}
      <div className="landing-orb orb-1" />
      <div className="landing-orb orb-2" />
      <div className="landing-orb orb-3" />

      <div className="landing-inner">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="landing-hero"
        >
          <motion.div
            animate={{ rotate: [0, 6, 0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
            className="landing-cup"
          >
            <CoffeeIcon size={64} />
          </motion.div>

          <h1 className="landing-title">
            HANGOUTS
            <span className="landing-title-dot">.</span>
          </h1>
          <p className="landing-tagline">
            the crew only. drop the key.
          </p>

          <motion.form
            key={shake}
            animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
            transition={{ duration: 0.5 }}
            onSubmit={submit}
            className="landing-gate"
          >
            <div className="landing-gate-label">
              <SparkIcon size={14} />
              <span>Crew Passcode</span>
            </div>
            <input
              className="landing-input"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="••••••"
              autoFocus
              style={{ textAlign: 'center', letterSpacing: '0.3em', textTransform: 'uppercase' }}
            />
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="landing-error"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading || !passcode}>
              {loading ? 'Checking…' : 'Enter the crew'}
            </button>
          </motion.form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="landing-footer"
        >
          <span>private · invite only · for the crew</span>
        </motion.div>
      </div>
    </div>
  )
}