import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, authApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import OtpInput from '../components/OtpInput'
import { cn } from '../lib/utils'
import type { UserSession } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#222]">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">{label}</label>
      {children}
      {help && <p className="text-xs text-[#444] mt-1.5">{help}</p>}
    </div>
  )
}

// ── 2FA Section ──────────────────────────────────────────────────────────────
type TwoFaStep = 'idle' | 'setup' | 'disable'

function TwoFaSection() {
  const { user, updateUser } = useAuth()
  const [step, setStep] = useState<TwoFaStep>('idle')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showBackup, setShowBackup] = useState(false)

  const handleSetup = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await authApi.setup2fa()
      setQrCode(data.qr_code)
      setSecret(data.secret)
      setBackupCodes(data.backup_codes)
      setStep('setup')
    } catch {
      setError('Impossible de démarrer la configuration.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmSetup = async () => {
    if (otp.length < 6) return
    setError('')
    setLoading(true)
    try {
      await authApi.verifySetup2fa(otp)
      updateUser({ totp_enabled: true })
      setStep('idle')
      setOtp('')
      setShowBackup(true)
    } catch {
      setError('Code incorrect. Réessaie.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    if (otp.length < 6 || !password) return
    setError('')
    setLoading(true)
    try {
      await authApi.disable2fa(password, otp)
      updateUser({ totp_enabled: false })
      setStep('idle')
      setOtp('')
      setPassword('')
    } catch {
      setError('Mot de passe ou code incorrect.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"

  // After enabling 2FA — show backup codes
  if (showBackup && backupCodes.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80] text-xs font-bold rounded-lg">✓ 2FA Activé</span>
        </div>
        <div className="bg-[#141414] border border-[#c8f135]/20 rounded-xl p-4">
          <p className="text-[#c8f135] text-sm font-bold mb-1">Codes de secours</p>
          <p className="text-[#555] text-xs mb-3">Sauvegarde ces codes dans un endroit sûr. Chaque code ne peut être utilisé qu'une seule fois.</p>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <span key={i} className="font-mono text-sm text-white bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-center tracking-widest">{code}</span>
            ))}
          </div>
          <button onClick={() => setShowBackup(false)} className="mt-4 w-full py-2 bg-[#c8f135] text-[#0f0f0f] rounded-xl text-sm font-bold hover:bg-[#a8cc2a] transition-colors">
            J'ai sauvegardé mes codes
          </button>
        </div>
      </div>
    )
  }

  // Setup flow
  if (step === 'setup') {
    return (
      <div className="space-y-4">
        <p className="text-[#8a8a8a] text-sm">Scanne ce QR code avec ton application authenticator (Google Authenticator, Authy…)</p>
        {qrCode && (
          <div className="flex justify-center">
            <img src={`data:image/png;base64,${qrCode}`} alt="2FA QR Code" className="w-44 h-44 rounded-xl border border-[#2a2a2a]" />
          </div>
        )}
        {secret && (
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-center">
            <p className="text-[#555] text-xs mb-1">Code manuel</p>
            <p className="font-mono text-sm text-white tracking-widest">{secret}</p>
          </div>
        )}
        {error && <div className="bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] rounded-xl p-3 text-sm">{error}</div>}
        <div>
          <p className="text-xs text-[#8a8a8a] mb-2">Entre le code à 6 chiffres de ton application pour confirmer</p>
          <OtpInput value={otp} onChange={setOtp} disabled={loading} />
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setStep('idle'); setOtp('') }} className="flex-1 py-2.5 bg-[#242424] border border-[#2a2a2a] rounded-xl text-sm text-white hover:bg-[#2a2a2a] transition-colors">
            Annuler
          </button>
          <button onClick={handleConfirmSetup} disabled={otp.length < 6 || loading}
            className="flex-1 py-2.5 bg-[#c8f135] disabled:opacity-50 text-[#0f0f0f] rounded-xl text-sm font-bold hover:bg-[#a8cc2a] transition-colors">
            {loading ? 'Vérification...' : 'Activer 2FA'}
          </button>
        </div>
      </div>
    )
  }

  // Disable flow
  if (step === 'disable') {
    return (
      <div className="space-y-4">
        <p className="text-[#8a8a8a] text-sm">Pour désactiver le 2FA, confirme ton mot de passe et entre le code TOTP actuel.</p>
        {error && <div className="bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] rounded-xl p-3 text-sm">{error}</div>}
        <Field label="Mot de passe">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className={inputCls} placeholder="••••••••" />
        </Field>
        <div>
          <p className="text-xs text-[#8a8a8a] mb-2">Code TOTP</p>
          <OtpInput value={otp} onChange={setOtp} disabled={loading} />
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setStep('idle'); setOtp(''); setPassword('') }}
            className="flex-1 py-2.5 bg-[#242424] border border-[#2a2a2a] rounded-xl text-sm text-white hover:bg-[#2a2a2a] transition-colors">
            Annuler
          </button>
          <button onClick={handleDisable} disabled={otp.length < 6 || !password || loading}
            className="flex-1 py-2.5 bg-[#f87171]/80 disabled:opacity-50 text-white rounded-xl text-sm font-bold hover:bg-[#f87171] transition-colors">
            {loading ? 'Désactivation...' : 'Désactiver 2FA'}
          </button>
        </div>
      </div>
    )
  }

  // Idle: show status + action button
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-lg border',
          user?.totp_enabled ? 'bg-[#c8f135]/10 border-[#c8f135]/20' : 'bg-[#242424] border-[#2a2a2a]')}>
          🔒
        </div>
        <div>
          <p className="text-sm font-medium text-white">Authentification 2FA</p>
          {user?.totp_enabled
            ? <p className="text-xs text-[#4ade80]">Activée — ton compte est protégé</p>
            : <p className="text-xs text-[#555]">Non activée — ajoute une couche de sécurité</p>}
        </div>
      </div>
      {user?.totp_enabled ? (
        <button onClick={() => setStep('disable')}
          className="px-4 py-2 bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] rounded-xl text-sm hover:bg-[#f87171]/20 transition-colors">
          Désactiver
        </button>
      ) : (
        <button onClick={handleSetup} disabled={loading}
          className="px-4 py-2 bg-[#c8f135] text-[#0f0f0f] rounded-xl text-sm font-bold hover:bg-[#a8cc2a] disabled:opacity-50 transition-colors">
          {loading ? '...' : 'Activer le 2FA'}
        </button>
      )}
    </div>
  )
}

// ── Sessions Section ─────────────────────────────────────────────────────────
function SessionsSection() {
  const qc = useQueryClient()
  const { data: sessions = [] } = useQuery<UserSession[]>({
    queryKey: ['sessions'],
    queryFn: authApi.sessions,
    refetchInterval: 30000,
  })
  const revokeMut = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
  const revokeAllMut = useMutation({
    mutationFn: authApi.revokeAllSessions,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  const fmtTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'À l\'instant'
    if (m < 60) return `Il y a ${m}min`
    const h = Math.floor(m / 60)
    if (h < 24) return `Il y a ${h}h`
    return `Il y a ${Math.floor(h / 24)}j`
  }

  return (
    <div className="space-y-3">
      {sessions.length === 0 && (
        <p className="text-[#555] text-sm">Aucune session active.</p>
      )}
      {sessions.map((s, i) => (
        <div key={s.id} className="flex items-center justify-between p-3 bg-[#141414] border border-[#1e1e1e] rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl flex items-center justify-center text-base">
              {s.device_type === 'mobile' ? '📱' : '💻'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-white font-medium truncate max-w-[200px]">
                  {s.user_agent?.split('/')[0] || 'Navigateur inconnu'}
                </p>
                {i === 0 && (
                  <span className="px-2 py-0.5 bg-[#c8f135]/10 border border-[#c8f135]/20 text-[#c8f135] text-xs rounded-md font-medium">
                    Session actuelle
                  </span>
                )}
              </div>
              <p className="text-xs text-[#555]">
                {s.ip_address} · {fmtTime(s.last_active)}
              </p>
            </div>
          </div>
          {i !== 0 && (
            <button
              onClick={() => revokeMut.mutate(s.id)}
              disabled={revokeMut.isPending}
              className="px-3 py-1.5 bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] text-xs rounded-lg hover:bg-[#f87171]/20 transition-colors"
            >
              Révoquer
            </button>
          )}
        </div>
      ))}
      {sessions.length > 1 && (
        <button
          onClick={() => revokeAllMut.mutate()}
          disabled={revokeAllMut.isPending}
          className="w-full py-2.5 bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] text-sm rounded-xl hover:bg-[#f87171]/20 transition-colors"
        >
          {revokeAllMut.isPending ? 'Révocation...' : 'Révoquer toutes les autres sessions'}
        </button>
      )}
    </div>
  )
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const updateMut = useMutation({ mutationFn: settingsApi.update })
  const testTelegramMut = useMutation({ mutationFn: settingsApi.testTelegram })
  const testEmailMut = useMutation({ mutationFn: settingsApi.testEmail })

  const [form, setForm] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    copy_poll_interval_ms: 100,
    copy_retry_count: 3,
    copy_retry_delay_ms: 500,
    daily_report_hour: 20,
  })

  useEffect(() => {
    if (settings) {
      setForm(f => ({
        ...f,
        smtp_host: settings.smtp_host || f.smtp_host,
        smtp_port: settings.smtp_port || f.smtp_port,
        smtp_user: settings.smtp_user || f.smtp_user,
        copy_poll_interval_ms: settings.copy_poll_interval_ms || f.copy_poll_interval_ms,
        copy_retry_count: settings.copy_retry_count || f.copy_retry_count,
        copy_retry_delay_ms: settings.copy_retry_delay_ms || f.copy_retry_delay_ms,
        daily_report_hour: settings.daily_report_hour ?? f.daily_report_hour,
      }))
    }
  }, [settings])

  const [saved, setSaved] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  const handleSave = async () => {
    const payload: Record<string, unknown> = {}
    if (form.telegram_bot_token) payload.telegram_bot_token = form.telegram_bot_token
    if (form.telegram_chat_id) payload.telegram_chat_id = form.telegram_chat_id
    if (form.smtp_host) payload.smtp_host = form.smtp_host
    if (form.smtp_port) payload.smtp_port = form.smtp_port
    if (form.smtp_user) payload.smtp_user = form.smtp_user
    if (form.smtp_password) payload.smtp_password = form.smtp_password
    payload.copy_poll_interval_ms = form.copy_poll_interval_ms
    payload.copy_retry_count = form.copy_retry_count
    payload.copy_retry_delay_ms = form.copy_retry_delay_ms
    payload.daily_report_hour = form.daily_report_hour

    await updateMut.mutateAsync(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestTelegram = async () => {
    const r = await testTelegramMut.mutateAsync()
    setTestResults(prev => ({ ...prev, telegram: r.success ? 'Sent!' : `Failed: ${r.error}` }))
  }

  const handleTestEmail = async () => {
    const r = await testEmailMut.mutateAsync()
    setTestResults(prev => ({ ...prev, email: r.success ? 'Sent!' : `Failed: ${r.error}` }))
  }

  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"

  const input = (key: keyof typeof form, type = 'text', placeholder = '') => (
    <input
      type={type}
      placeholder={placeholder}
      value={String(form[key])}
      onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
      className={inputCls}
    />
  )

  return (
    <div className="min-h-full bg-[#0f0f0f] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-[#555] text-sm mt-0.5">Configure notifications and engine parameters</p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            'px-5 py-2.5 rounded-xl text-sm font-bold transition-all',
            saved
              ? 'bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30'
              : 'bg-[#c8f135] text-[#0f0f0f] hover:bg-[#a8cc2a]'
          )}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Status indicators */}
      {settings && (
        <div className="flex gap-3 text-xs">
          <span className={cn('px-3 py-1.5 rounded-xl border font-medium', settings.telegram_configured
            ? 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30'
            : 'bg-[#2a2a2a] text-[#555] border-[#333]')}>
            Telegram {settings.telegram_configured ? '✓ Configured' : 'Not configured'}
          </span>
          <span className={cn('px-3 py-1.5 rounded-xl border font-medium', settings.smtp_configured
            ? 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30'
            : 'bg-[#2a2a2a] text-[#555] border-[#333]')}>
            Email {settings.smtp_configured ? '✓ Configured' : 'Not configured'}
          </span>
        </div>
      )}

      {/* Security */}
      <Section title="Sécurité">
        <TwoFaSection />
      </Section>

      <Section title="Sessions actives">
        <SessionsSection />
      </Section>

      <Section title="Telegram Notifications">
        <Field label="Bot Token" help="Get from @BotFather on Telegram">
          {input('telegram_bot_token', 'password', '1234567890:AAF...')}
        </Field>
        <Field label="Chat ID" help="Your chat ID or group chat ID (use @userinfobot to find it)">
          {input('telegram_chat_id', 'text', '-1001234567890')}
        </Field>
        <div className="flex items-center gap-3">
          <button onClick={handleTestTelegram} disabled={testTelegramMut.isPending}
            className="px-4 py-2 bg-[#242424] border border-[#2a2a2a] rounded-xl text-sm text-white hover:bg-[#2a2a2a] transition-colors">
            {testTelegramMut.isPending ? 'Sending...' : 'Send Test Message'}
          </button>
          {testResults.telegram && (
            <span className={cn('text-sm font-medium', testResults.telegram.startsWith('Sent') ? 'text-[#4ade80]' : 'text-[#f87171]')}>
              {testResults.telegram}
            </span>
          )}
        </div>
      </Section>

      <Section title="Email Notifications (SMTP)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="SMTP Host">{input('smtp_host', 'text', 'smtp.gmail.com')}</Field>
          <Field label="SMTP Port">{input('smtp_port', 'number', '587')}</Field>
        </div>
        <Field label="Email Address">{input('smtp_user', 'email', 'you@example.com')}</Field>
        <Field label="App Password" help="Use App Password for Gmail (not your main password)">
          {input('smtp_password', 'password', '••••••••')}
        </Field>
        <Field label="Daily Report Hour (UTC)" help="Hour to send daily report (0–23)">
          {input('daily_report_hour', 'number', '20')}
        </Field>
        <div className="flex items-center gap-3">
          <button onClick={handleTestEmail} disabled={testEmailMut.isPending}
            className="px-4 py-2 bg-[#242424] border border-[#2a2a2a] rounded-xl text-sm text-white hover:bg-[#2a2a2a] transition-colors">
            {testEmailMut.isPending ? 'Sending...' : 'Send Test Email'}
          </button>
          {testResults.email && (
            <span className={cn('text-sm font-medium', testResults.email.startsWith('Sent') ? 'text-[#4ade80]' : 'text-[#f87171]')}>
              {testResults.email}
            </span>
          )}
        </div>
      </Section>

      <Section title="Copy Engine Parameters">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Poll Interval (ms)" help="How often to check master positions">
            {input('copy_poll_interval_ms', 'number', '100')}
          </Field>
          <Field label="Retry Count" help="Max retries on order failure">
            {input('copy_retry_count', 'number', '3')}
          </Field>
          <Field label="Retry Delay (ms)" help="Base delay between retries (exponential backoff)">
            {input('copy_retry_delay_ms', 'number', '500')}
          </Field>
        </div>
      </Section>

      <Section title="About">
        <div className="text-sm text-[#555] space-y-1.5">
          <p><span className="text-white font-medium">YeConnect</span> v1.0.0</p>
          <p>Supports MT4, MT5, cTrader, Binance (Spot & Futures)</p>
          <p>Backend: FastAPI + PostgreSQL</p>
          <p>Real-time copy latency tracking & Telegram/email alerts</p>
        </div>
      </Section>
    </div>
  )
}
