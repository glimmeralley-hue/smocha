import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('smocha_token')
    if (!token) {
      setLoading(false)
      return
    }
    api.me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('smocha_token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const data = await api.login({ username, password })
    localStorage.setItem('smocha_token', data.token)
    setUser(data.user)
    return data.user
  }

  const signup = async (body) => {
    const data = await api.signup(body)
    localStorage.setItem('smocha_token', data.token)
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('smocha_token')
    setUser(null)
  }

  const updateUser = (partial) => setUser((prev) => ({ ...prev, ...partial }))

  // Re-fetch the current user from the server (e.g. after an admin toggle)
  const refreshUser = useCallback(async () => {
    try {
      const data = await api.me()
      setUser(data)
      return data
    } catch {
      return null
    }
  }, [])

  const isAdmin = !!user?.is_admin

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, login, signup, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}