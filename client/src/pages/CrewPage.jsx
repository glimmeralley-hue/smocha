import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'

export default function CrewPage() {
  const { user } = useAuth()
  const [crew, setCrew] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.crew()
      .then(setCrew)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const online = crew.filter((m) => m.online)
  const offline = crew.filter((m) => !m.online)

  return (
    <div className="crew-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="dashboard-header"
      >
        <div>
          <h1 className="dashboard-title">The Crew</h1>
          <p className="dashboard-sub">{crew.length} members · {online.length} online now</p>
        </div>
      </motion.div>

      {loading ? (
        <div className="full-center" style={{ minHeight: 300 }}>
          <div className="loading pulse">checking who's around…</div>
        </div>
      ) : (
        <div className="crew-grid">
          {[...online, ...offline].map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 120, damping: 14 }}
              whileHover={{ y: -4 }}
            >
              <Link to={`/profile/${member.id}`} className="crew-card">
                <Avatar
                  person={member}
                  size={64}
                  online={member.online}
                  isYou={member.id === user?.id}
                />
                <div className="crew-card-info">
                  <h3 className="crew-card-name">
                    {member.nickname}
                    {member.id === user?.id && <span className="crew-card-you">you</span>}
                  </h3>
                  <p className="crew-card-username">@{member.username}</p>
                  {member.bio && <p className="crew-card-bio">{member.bio}</p>}
                  <span className={`crew-card-status ${member.online ? 'online' : ''}`}>
                    {member.online ? 'online' : 'offline'}
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}