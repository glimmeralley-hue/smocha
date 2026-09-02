import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from './AuthContext.jsx'
import AppShell from './components/AppShell.jsx'
import Landing from './pages/Landing.jsx'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import HangoutDetail from './pages/HangoutDetail.jsx'
import NewHangout from './pages/NewHangout.jsx'
import CrewPage from './pages/CrewPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import Events from './pages/Events.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="full-center"><div className="loading pulse">Loading…</div></div>
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="full-center"><div className="loading pulse">Loading…</div></div>
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
        <Route path="/auth" element={<PublicOnly><Auth /></PublicOnly>} />

        <Route
          path="/dashboard"
          element={
            <Protected>
              <AppShell>
                <Dashboard />
              </AppShell>
            </Protected>
          }
        />

        <Route
          path="/events"
          element={
            <Protected>
              <AppShell>
                <Events />
              </AppShell>
            </Protected>
          }
        />

        <Route
          path="/hangouts/new"
          element={
            <Protected>
              <AppShell>
                <NewHangout />
              </AppShell>
            </Protected>
          }
        />

        <Route
          path="/hangouts/:id"
          element={
            <Protected>
              <AppShell>
                <HangoutDetail />
              </AppShell>
            </Protected>
          }
        />

        <Route
          path="/crew"
          element={
            <Protected>
              <AppShell>
                <CrewPage />
              </AppShell>
            </Protected>
          }
        />

        <Route
          path="/profile/:id"
          element={
            <Protected>
              <AppShell>
                <ProfilePage />
              </AppShell>
            </Protected>
          }
        />

        <Route
          path="/admin"
          element={
            <Protected>
              <AdminRequired>
                <AppShell>
                  <AdminPage />
                </AppShell>
              </AdminRequired>
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function AdminRequired({ children }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/auth" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}
