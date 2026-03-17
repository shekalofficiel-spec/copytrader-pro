import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import OnboardingWizard from './components/OnboardingWizard'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Trades from './pages/Trades'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Register from './pages/Register'
import Billing from './pages/Billing'
import Journal from './pages/Journal'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 10, retry: 1 },
  },
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function AuthGate() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#c8f135]" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <Layout />
      {!user.onboarding_completed && <OnboardingWizard />}
    </>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<AuthGate />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/trades" element={<Trades />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/journal" element={<Journal />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  )
}
