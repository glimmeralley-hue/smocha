import { motion } from 'framer-motion'

export default function Avatar({ person, size = 40, online = false, isYou = false, className = '' }) {
  const initials = (person?.nickname || person?.username || '?')
    .split(' ')
    .map((w) => w?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const dotSize = Math.max(10, Math.round(size * 0.28))

  const ringStyle = isYou
    ? {
        padding: 2,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #fb923c, rgba(217, 119, 6, 0.15))',
        boxShadow: '0 0 16px rgba(251, 146, 60, 0.45)',
      }
    : undefined

  const inner = person?.avatar ? (
    <img
      src={person.avatar}
      alt={person?.nickname || person?.username || 'avatar'}
      style={{ width: size, height: size }}
      className={`avatar-img ${className || ''}`}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #d97706, #92400e)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        fontSize: size * 0.38,
        borderRadius: '50%',
        flexShrink: 0,
      }}
      className={className || ''}
    >
      {initials}
    </div>
  )

  return (
    <motion.div
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, ...ringStyle }}
      className="avatar-wrap"
      title={person?.nickname || person?.username}
    >
      {inner}
      {online !== false && (
        <span
          className={`avatar-online-dot ${online ? 'online' : 'offline'}`}
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: online ? '#22c55e' : '#52525b',
            border: `2px solid var(--bg)`,
            boxShadow: online ? '0 0 8px rgba(34, 197, 94, 0.7)' : 'none',
          }}
        />
      )}
    </motion.div>
  )
}