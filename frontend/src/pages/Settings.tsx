import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { settingsApi } from '../lib/api'
import { cn } from '../lib/utils'

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
          <p><span className="text-white font-medium">CopyTrader Pro</span> v1.0.0</p>
          <p>Supports MT4, MT5, cTrader, Binance (Spot & Futures)</p>
          <p>Backend: FastAPI + PostgreSQL</p>
          <p>Real-time copy latency tracking & Telegram/email alerts</p>
        </div>
      </Section>
    </div>
  )
}
