import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { authApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'
import OtpInput from '../components/OtpInput'
import { cn } from '../lib/utils'

type Step = 'login' | '2fa' | 'device'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Multi-step state
  const [step, setStep] = useState<Step>('login')
  const [tempToken, setTempToken] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [otp, setOtp] = useState('')

  // Device verification timer
  const [countdown, setCountdown] = useState(600) // 10 min
  const [canResend, setCanResend] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(60)

  useEffect(() => {
    if (step === 'device') {
      const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000)
      const r = setInterval(() => setResendCountdown(c => {
        if (c <= 1) { setCanResend(true); return 0 }
        return c - 1
      }), 1000)
      return () => { clearInterval(t); clearInterval(r) }
    }
    if (step === '2fa') {
      const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000)
      return () => clearInterval(t)
    }
  }, [step])

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await authApi.login({ email, password })
      if (data.requires_2fa) {
        setTempToken(data.temp_token)
        setCountdown(300)
        setStep('2fa')
      } else if (data.requires_device_verification) {
        setTempToken(data.temp_token)
        setMaskedEmail(data.masked_email)
        setCountdown(600)
        setResendCountdown(60)
        setCanResend(false)
        setStep('device')
      } else {
        login(data.access_token, data.user)
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Connexion échouée.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify2fa = async () => {
    if (otp.length < 6) return
    setError('')
    setLoading(true)
    try {
      const data = await authApi.verify2fa(tempToken, otp)
      login(data.access_token, data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Code invalide.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyDevice = async (trustDevice = true) => {
    if (otp.length < 6) return
    setError('')
    setLoading(true)
    try {
      const data = await authApi.verifyDevice(tempToken, otp, trustDevice)
      login(data.access_token, data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Code invalide ou expiré.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend) return
    setError('')
    try {
      await authApi.resendDeviceCode(tempToken)
      setCanResend(false)
      setResendCountdown(60)
    } catch {
      setError('Impossible de renvoyer le code.')
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
      setError(msg || 'Google login failed')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c8f135]/50 focus:bg-[#222] transition-all placeholder:text-[#444]"

  // ── 2FA Screen ──────────────────────────────────────────────────────────────
  if (step === '2fa') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8"><Logo size={44} showText={true} /></div>
          <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl p-7 shadow-2xl text-center">
            <div className="w-14 h-14 bg-[#c8f135]/10 border border-[#c8f135]/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Vérification en deux étapes</h2>
            <p className="text-[#555] text-sm mb-6">Entre le code de ton application authenticator</p>

            {error && <div className="bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] rounded-xl p-3 text-sm mb-4">{error}</div>}

            <OtpInput value={otp} onChange={setOtp} disabled={loading} />

            {countdown > 0 ? (
              <p className="text-[#555] text-xs mt-4">Expire dans <span className="text-white font-mono">{fmtTime(countdown)}</span></p>
            ) : (
              <p className="text-[#f87171] text-xs mt-4">Code expiré — <button onClick={() => setStep('login')} className="underline">reconnecte-toi</button></p>
            )}

            <button
              onClick={handleVerify2fa}
              disabled={otp.length < 6 || loading || countdown === 0}
              className="w-full mt-5 bg-[#c8f135] hover:bg-[#a8cc2a] disabled:opacity-50 text-[#0f0f0f] font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Vérification...' : 'Vérifier'}
            </button>

            <button
              onClick={() => { setOtp(''); setStep('login') }}
              className="mt-3 text-xs text-[#555] hover:text-white transition-colors"
            >
              ← Retour
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Device Screen ──────────────────────────────────────────────────────────
  if (step === 'device') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8"><Logo size={44} showText={true} /></div>
          <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl p-7 shadow-2xl text-center">
            <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">📱</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Nouvel appareil détecté</h2>
            <p className="text-[#555] text-sm mb-1">Un code a été envoyé à</p>
            <p className="text-white font-mono text-sm mb-6">{maskedEmail}</p>

            {error && <div className="bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] rounded-xl p-3 text-sm mb-4">{error}</div>}

            <OtpInput value={otp} onChange={v => { setOtp(v); if (v.length === 6) handleVerifyDevice() }} disabled={loading} />

            {countdown > 0 ? (
              <p className="text-[#555] text-xs mt-4">Expire dans <span className="text-white font-mono">{fmtTime(countdown)}</span></p>
            ) : (
              <p className="text-[#f87171] text-xs mt-4">Code expiré — <button onClick={() => setStep('login')} className="underline">reconnecte-toi</button></p>
            )}

            <button
              onClick={() => handleVerifyDevice(true)}
              disabled={otp.length < 6 || loading || countdown === 0}
              className="w-full mt-5 bg-[#c8f135] hover:bg-[#a8cc2a] disabled:opacity-50 text-[#0f0f0f] font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Vérification...' : 'Confirmer et faire confiance à cet appareil'}
            </button>

            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => handleVerifyDevice(false)}
                disabled={otp.length < 6 || loading}
                className="text-xs text-[#555] hover:text-white transition-colors"
              >
                Confirmer sans mémoriser cet appareil
              </button>
              <button
                onClick={handleResend}
                disabled={!canResend || loading}
                className={cn('text-xs transition-colors', canResend ? 'text-[#c8f135] hover:text-white' : 'text-[#444] cursor-not-allowed')}
              >
                {canResend ? 'Renvoyer le code' : `Renvoyer dans ${resendCountdown}s`}
              </button>
              <button onClick={() => setStep('login')} className="text-xs text-[#555] hover:text-white transition-colors">
                ← Retour
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal Login ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#c8f135]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-sm relative z-10">
        <div className="flex justify-center mb-10"><Logo size={44} showText={true} /></div>
        <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl p-7 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-1">Welcome back</h2>
          <p className="text-[#555] text-sm mb-6">Sign in to your account</p>

          {error && <div className="bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] rounded-xl p-3 text-sm mb-4">{error}</div>}

          <div className="flex justify-center mb-5">
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Google login failed')}
              theme="filled_black" shape="rectangular" size="large" text="signin_with" width="300" />
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-[#2a2a2a]" />
            <span className="text-[#444] text-xs">or</span>
            <div className="flex-1 h-px bg-[#2a2a2a]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className={inputCls} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className={inputCls} placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#c8f135] hover:bg-[#a8cc2a] disabled:opacity-50 text-[#0f0f0f] font-bold py-2.5 rounded-xl transition-colors text-sm">
              {loading ? 'Connexion...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[#555] text-xs mt-5">
            No account?{' '}
            <Link to="/register" className="text-[#c8f135] hover:text-white font-medium">Create one free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
