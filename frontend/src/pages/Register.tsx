import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { authApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await authApi.register(form)
      login(data.access_token, data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return
    setError('')
    setLoading(true)
    try {
      const data = await authApi.googleLogin(credentialResponse.credential)
      login(data.access_token, data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Google signup failed')
    } finally {
      setLoading(false)
    }
  }

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-neon/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="flex justify-center mb-10">
          <Logo size={44} showText={true} />
        </div>

        <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl p-7 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-1">Create account</h2>
          <p className="text-[#555] text-sm mb-6">Start copy trading in minutes</p>

          {error && (
            <div className="bg-loss/10 border border-loss/20 text-loss rounded-xl p-3 text-sm mb-4">
              {error}
            </div>
          )}

          <div className="flex justify-center mb-5">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google signup failed')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="signup_with"
              width="300"
            />
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-[#2a2a2a]" />
            <span className="text-[#444] text-xs">or</span>
            <div className="flex-1 h-px bg-[#2a2a2a]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                className="w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-neon/50 transition-all placeholder:text-[#444]"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
                className="w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-neon/50 transition-all placeholder:text-[#444]"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required
                minLength={8}
                className="w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-neon/50 transition-all placeholder:text-[#444]"
                placeholder="Min 8 characters"
              />
            </div>

            <div className="bg-neon/5 border border-neon/15 rounded-xl p-3 text-xs text-[#8a8a8a]">
              <p className="text-neon font-semibold mb-1">Free Plan includes:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>1 Master + 1 Slave account</li>
                <li>All broker types supported</li>
                <li>Real-time copy engine</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neon hover:bg-neon-hover disabled:opacity-50 text-[#0f0f0f] font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Creating account...' : 'Create Free Account'}
            </button>
          </form>

          <p className="text-center text-[#555] text-xs mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-neon hover:text-neon-hover font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
