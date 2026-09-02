const API = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL) : '/api'

function getToken() {
  return localStorage.getItem('smocha_token')
}

const REQUEST_TIMEOUT = 15000

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  // AbortController timeout — hung requests fail instead of spinning forever
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  let res
  try {
    res = await fetch(`${API}${path}`, { ...options, headers, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — is the crew server running?')
    }
    // Network failure (backend down, proxy refused, offline)
    throw new Error("Can't reach the crew server. Try again in a sec.")
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json().catch(() => ({}))

  // 401 → token expired or invalid — force re-auth
  if (res.status === 401 && path !== '/login' && path !== '/check-passcode' && !options._skip401) {
    localStorage.removeItem('smocha_token')
    if (!window.location.pathname.startsWith('/auth')) {
      window.location.href = '/auth'
    }
  }

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong')
  }
  return data
}

export const api = {
  checkPasscode: (passcode) => request('/check-passcode', {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  }),

  signup: (body) => request('/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  login: (body) => request('/login', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  me: () => request('/me'),

  updateMe: (body) => request('/me', {
    method: 'PUT',
    body: JSON.stringify(body),
  }),

  uploadAvatar: (file) => {
    const fd = new FormData()
    fd.append('avatar', file)
    return request('/me/avatar', { method: 'POST', body: fd })
  },

  crew: () => request('/crew'),

  user: (id) => request(`/users/${id}`),

  hangouts: () => request('/hangouts'),

  hangout: (id) => request(`/hangouts/${id}`),

  createHangout: (formData) => request('/hangouts', {
    method: 'POST',
    body: formData,
  }),

  rsvp: (id, status) => request(`/hangouts/${id}/rsvp`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  }),

  uploadPhoto: (id, file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return request(`/hangouts/${id}/photos`, { method: 'POST', body: fd })
  },

  deleteHangout: (id) => request(`/hangouts/${id}`, { method: 'DELETE' }),

  // Events feed (scraped outings in Nairobi/Kenya)
  events: (category) => request(`/events${category ? `?category=${encodeURIComponent(category)}` : ''}`),

  // Admin
  admin: {
    stats: () => request('/admin/stats'),
    users: () => request('/admin/users'),
    hangouts: () => request('/admin/hangouts'),
    deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    toggleAdmin: (id) => request(`/admin/users/${id}/toggle-admin`, { method: 'POST' }),
    deleteHangout: (id) => request(`/admin/hangouts/${id}`, { method: 'DELETE' }),
    deletePhoto: (id) => request(`/admin/photos/${id}`, { method: 'DELETE' }),
    resetDemo: () => request('/admin/reset-demo', { method: 'POST' }),
    eventSources: () => request('/admin/event-sources'),
    addEventSource: (body) => request('/admin/event-sources', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    updateEventSource: (id, body) => request(`/admin/event-sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    deleteEventSource: (id) => request(`/admin/event-sources/${id}`, { method: 'DELETE' }),
    refreshEvents: () => request('/events/refresh', { method: 'POST' }),
    importEvent: (url) => request('/admin/events/import', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
    setEventHidden: (id, hidden) => request(`/admin/events/${id}/hidden`, {
      method: 'PUT',
      body: JSON.stringify({ hidden }),
    }),
  },

  // Heartbeat — keeps presence fresh while the app is open
  heartbeat: () => request('/heartbeat', { method: 'POST' }),
}