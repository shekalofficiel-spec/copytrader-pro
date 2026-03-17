import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../lib/api'

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token')
    const storedUser = localStorage.getItem('auth_user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      // Re-validate token and refresh user data from backend
      authApi.me()
        .then((freshUser) => {
          // Always sync latest data (onboarding_completed, subscription_tier, etc.)
          localStorage.setItem('auth_user', JSON.stringify(freshUser))
          setUser(freshUser)
        })
        .catch(() => {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
          setToken(null)
          setUser(null)
        })
    }
    setIsLoading(false)
  }, [])

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem('auth_token', newToken)
    localStorage.setItem('auth_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setToken(null)
    setUser(null)
  }

  const updateUser = (patch: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...patch }
      localStorage.setItem('auth_user', JSON.stringify(updated))
      return updated
    })
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
