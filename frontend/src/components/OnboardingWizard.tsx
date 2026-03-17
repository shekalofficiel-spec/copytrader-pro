import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Zap, CheckCircle, AlertCircle, ChevronRight, SkipForward,
  Wifi, Bell, Users
} from 'lucide-react'
import { accountsApi, authApi, settingsApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

const STEPS = ['Bienvenue', 'Compte Maître', 'Compte Esclave', 'Notifications']

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  return (
    <div className="px-8 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                i < step ? 'bg-[#c8f135] text-[#0f0f0f]' :
                i === step ? 'bg-[#c8f135]/20 border-2 border-[#c8f135] text-[#c8f135]' :
                'bg-[#242424] text-[#555]'
              )}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={cn(
                'text-[10px] mt-1 font-medium hidden sm:block whitespace-nowrap',
                i === step ? 'text-[#c8f135]' : i < step ? 'text-[#8a8a8a]' : 'text-[#444]'
              )}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'flex-1 h-px mx-2 transition-all',
                i < step ? 'bg-[#c8f135]' : 'bg-[#242424]'
              )} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 1 — Welcome ──────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-8 pb-8 pt-2">
      <div className="w-16 h-16 rounded-2xl bg-[#c8f135]/10 border border-[#c8f135]/20 flex items-center justify-center mb-6">
        <Zap className="w-8 h-8 text-[#c8f135]" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Bienvenue sur CopyTrader Pro 👋</h2>
      <p className="text-[#555] mb-8">Configurons ton espace en 3 minutes</p>

      <div className="w-full space-y-3 mb-8 text-left">
        {[
          { icon: Users, text: 'Connecte tes comptes MT4/MT5 en quelques clics' },
          { icon: Zap, text: 'Tes trades sont copiés automatiquement en < 200ms' },
          { icon: CheckCircle, text: 'Gestion du risque intégrée pour chaque compte' },
        ].map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-center gap-3 bg-[#1a1a1a] border border-[#242424] rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-lg bg-[#c8f135]/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-[#c8f135]" />
            </div>
            <p className="text-sm text-[#8a8a8a]">{text}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="flex items-center gap-2 px-8 py-3 bg-[#c8f135] text-[#0f0f0f] font-bold rounded-xl hover:bg-[#a8cc2a] transition-colors text-sm"
      >
        Commencer <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Step 2 — Master Account ───────────────────────────────────────────────────
function StepMaster({ onNext }: { onNext: () => void }) {
  const [broker, setBroker] = useState<'MT5' | 'MT4' | 'CTRADER' | 'BINANCE'>('MT5')
  const [form, setForm] = useState({ login: '', password: '', server: '', api_key: '', api_secret: '' })
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [, setCreatedId] = useState<number | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleTest = async () => {
    setStatus('testing')
    setErrorMsg('')
    try {
      const credentials = broker === 'MT5' || broker === 'MT4'
        ? { login: parseInt(form.login) || 0, password: form.password, server: form.server }
        : { api_key: form.api_key, api_secret: form.api_secret, futures: false, testnet: false }

      const account = await accountsApi.create({
        name: `Master ${broker}`,
        broker_type: broker,
        role: 'MASTER',
        credentials,
        lot_mode: 'RATIO',
        lot_ratio: 1.0,
        fixed_lot_size: 0.01,
        risk_percent: 1.0,
        max_drawdown_pct: 5.0,
        max_trades: 10,
        min_margin_level: 200,
        max_lot_size: 10,
        prop_firm_mode: false,
        no_trade_weekend: false,
        no_trade_news: false,
        allowed_instruments: [],
      })
      setCreatedId(account.id)
      setStatus('success')
      // Auto-advance after 600ms
      setTimeout(onNext, 600)
    } catch (err: unknown) {
      setStatus('error')
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(detail || 'Erreur réseau. Vérifie que le backend est démarré.')
    }
  }

  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"

  return (
    <div className="px-8 pb-8 pt-2 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Quel est ton compte principal ?</h2>
        <p className="text-[#555] text-sm">Le compte dont les trades seront copiés</p>
      </div>

      {/* Broker selector */}
      <div className="grid grid-cols-4 gap-2">
        {(['MT5', 'MT4', 'CTRADER', 'BINANCE'] as const).map(b => (
          <button
            key={b}
            onClick={() => { setBroker(b); setStatus('idle') }}
            className={cn(
              'py-2.5 rounded-xl text-xs font-bold border transition-all',
              broker === b
                ? 'bg-[#c8f135]/10 border-[#c8f135]/40 text-[#c8f135]'
                : 'bg-[#1a1a1a] border-[#242424] text-[#555] hover:text-white hover:border-[#333]'
            )}
          >
            {b}
            {b === 'MT5' && <span className="block text-[9px] opacity-60 mt-0.5">Recommandé</span>}
          </button>
        ))}
      </div>

      {/* MT5 instructions */}
      {(broker === 'MT5' || broker === 'MT4') && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300 space-y-1">
          <p className="font-bold mb-2">Dans MetaTrader {broker === 'MT5' ? '5' : '4'} :</p>
          <p>1. Outils → Options → Expert Advisors</p>
          <p>2. Cocher <span className="font-bold">"Allow Algo Trading"</span></p>
          <p>3. Cocher <span className="font-bold">"Allow DLL imports"</span></p>
        </div>
      )}

      {/* Credentials */}
      {(broker === 'MT5' || broker === 'MT4') && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Login (numéro de compte)</label>
            <input type="number" placeholder="12345678" value={form.login} onChange={e => set('login', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Password</label>
            <input type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Serveur</label>
            <input type="text" placeholder="ICMarkets-Demo" value={form.server} onChange={e => set('server', e.target.value)} className={inputCls} />
          </div>
        </div>
      )}
      {broker === 'BINANCE' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">API Key</label>
            <input type="text" value={form.api_key} onChange={e => set('api_key', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">API Secret</label>
            <input type="password" value={form.api_secret} onChange={e => set('api_secret', e.target.value)} className={inputCls} />
          </div>
        </div>
      )}
      {broker === 'CTRADER' && (
        <p className="text-sm text-[#555]">Configurez cTrader via l'API après l'onboarding.</p>
      )}

      {/* Test result */}
      {status === 'success' && (
        <div className="flex items-center gap-2 bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-xl px-4 py-3 text-[#4ade80] text-sm font-medium">
          <CheckCircle className="w-4 h-4 shrink-0" /> Connexion réussie ✓
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl px-4 py-3 text-[#f87171] text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMsg}
        </div>
      )}

      <div className="flex gap-3 pt-1 flex-wrap">
        <button
          onClick={handleTest}
          disabled={status === 'testing' || (!form.login && !form.api_key)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#c8f135] text-[#0f0f0f] font-bold rounded-xl text-sm hover:bg-[#a8cc2a] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Wifi className="w-4 h-4" />
          {status === 'testing' ? 'Enregistrement...' : 'Enregistrer et continuer'}
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-1.5 text-sm text-[#555] hover:text-[#8a8a8a] transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" /> Passer cette étape
        </button>
      </div>
    </div>
  )
}

// ── Step 3 — Slave Account ────────────────────────────────────────────────────
function StepSlave({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [form, setForm] = useState({ login: '', password: '', server: '', lot_ratio: '1.0', active: true })
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"

  const handleAdd = async () => {
    setStatus('saving')
    setErrorMsg('')
    try {
      await accountsApi.create({
        name: 'Slave MT5',
        broker_type: 'MT5',
        role: 'SLAVE',
        credentials: { login: parseInt(form.login) || 0, password: form.password, server: form.server },
        lot_mode: 'RATIO',
        lot_ratio: parseFloat(form.lot_ratio) || 1.0,
        fixed_lot_size: 0.01,
        risk_percent: 1.0,
        max_drawdown_pct: 5.0,
        max_trades: 10,
        min_margin_level: 200,
        max_lot_size: 10,
        prop_firm_mode: false,
        no_trade_weekend: false,
        no_trade_news: false,
        allowed_instruments: [],
      })
      setStatus('success')
      setTimeout(onNext, 800)
    } catch (err: unknown) {
      setStatus('error')
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(msg || 'Erreur lors de la création')
    }
  }

  return (
    <div className="px-8 pb-8 pt-2 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Sur quel compte veux-tu copier ?</h2>
        <p className="text-[#555] text-sm">Le compte qui recevra les trades copiés</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Login</label>
          <input type="number" placeholder="87654321" value={form.login} onChange={e => set('login', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Password</label>
          <input type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Serveur</label>
          <input type="text" placeholder="ICMarkets-Demo" value={form.server} onChange={e => set('server', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">
            Ratio de lot
            <span className="text-[#444] ml-1 font-normal">— 0.5 = moitié du lot maître</span>
          </label>
          <input type="number" step="0.1" min="0.01" placeholder="1.0" value={form.lot_ratio} onChange={e => set('lot_ratio', e.target.value)} className={inputCls} />
        </div>

        {/* Toggle */}
        <label className="flex items-center justify-between py-3 px-4 bg-[#1a1a1a] border border-[#242424] rounded-xl cursor-pointer">
          <div>
            <p className="text-sm text-white font-medium">Activer immédiatement</p>
            <p className="text-xs text-[#555]">Le compte commencera à copier dès la configuration terminée</p>
          </div>
          <div
            onClick={() => set('active', !form.active)}
            className={cn(
              'w-10 h-5.5 rounded-full transition-all relative shrink-0 ml-4',
              form.active ? 'bg-[#c8f135]' : 'bg-[#2a2a2a]'
            )}
            style={{ width: 40, height: 22 }}
          >
            <div className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
              form.active ? 'left-5' : 'left-0.5'
            )} />
          </div>
        </label>
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-2 bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-xl px-4 py-3 text-[#4ade80] text-sm font-medium">
          <CheckCircle className="w-4 h-4" /> Compte ajouté !
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl px-4 py-3 text-[#f87171] text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMsg}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleAdd}
          disabled={status === 'saving' || !form.login}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#c8f135] text-[#0f0f0f] font-bold rounded-xl text-sm hover:bg-[#a8cc2a] disabled:opacity-50 transition-all"
        >
          {status === 'saving' ? 'Ajout en cours...' : 'Ajouter le compte'}
        </button>
        <button onClick={onSkip} className="flex items-center gap-1.5 text-sm text-[#555] hover:text-[#8a8a8a] transition-colors">
          <SkipForward className="w-3.5 h-3.5" /> Passer cette étape
        </button>
      </div>
    </div>
  )
}

// ── Step 4 — Notifications ────────────────────────────────────────────────────
function StepNotifications({ onFinish }: { onFinish: () => void }) {
  const [telegram, setTelegram] = useState('')
  const [chatId, setChatId] = useState('')
  const [emailReports, setEmailReports] = useState(false)
  const [reportHour, setReportHour] = useState(8)
  const [telegramTest, setTelegramTest] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [saving, setSaving] = useState(false)

  const handleTelegramTest = async () => {
    setTelegramTest('sending')
    try {
      if (telegram) {
        await settingsApi.update({ telegram_bot_token: telegram, telegram_chat_id: chatId })
      }
      const r = await settingsApi.testTelegram()
      setTelegramTest(r.success ? 'ok' : 'error')
    } catch {
      setTelegramTest('error')
    }
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      if (telegram) { payload.telegram_bot_token = telegram; payload.telegram_chat_id = chatId }
      if (emailReports) payload.daily_report_hour = reportHour
      if (Object.keys(payload).length > 0) await settingsApi.update(payload)
    } catch { /* non-blocking */ } finally {
      setSaving(false)
      onFinish()
    }
  }

  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"

  return (
    <div className="px-8 pb-8 pt-2 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Comment veux-tu être alerté ?</h2>
        <p className="text-[#555] text-sm">Reçois des alertes pour chaque trade copié</p>
      </div>

      {/* Telegram */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4 text-[#c8f135]" />
          <h3 className="text-sm font-semibold text-white">Telegram</h3>
        </div>
        <div>
          <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Token du bot</label>
          <input type="password" placeholder="123456789:AAF..." value={telegram} onChange={e => setTelegram(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Chat ID</label>
          <input type="text" placeholder="-1001234567890" value={chatId} onChange={e => setChatId(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#c8f135] hover:text-[#a8cc2a] underline"
          >
            Comment créer un bot Telegram →
          </a>
          <button
            onClick={handleTelegramTest}
            disabled={!telegram || telegramTest === 'sending'}
            className="text-xs px-3 py-1.5 bg-[#242424] border border-[#2a2a2a] rounded-lg text-white hover:bg-[#2a2a2a] disabled:opacity-50 transition-all"
          >
            {telegramTest === 'sending' ? 'Envoi...' : 'Envoyer un test'}
          </button>
          {telegramTest === 'ok' && <span className="text-xs text-[#4ade80]">✓ Envoyé !</span>}
          {telegramTest === 'error' && <span className="text-xs text-[#f87171]">✗ Échec</span>}
        </div>
      </div>

      <div className="border-t border-[#222]" />

      {/* Email reports */}
      <div className="space-y-3">
        <label className="flex items-center justify-between cursor-pointer" onClick={() => setEmailReports(v => !v)}>
          <div>
            <p className="text-sm font-semibold text-white">Rapports journaliers par email</p>
            <p className="text-xs text-[#555] mt-0.5">Résumé de tes performances envoyé chaque matin</p>
          </div>
          <div
            className={cn('rounded-full transition-all relative shrink-0 ml-4', emailReports ? 'bg-[#c8f135]' : 'bg-[#2a2a2a]')}
            style={{ width: 40, height: 22 }}
          >
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', emailReports ? 'left-5' : 'left-0.5')} />
          </div>
        </label>
        {emailReports && (
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-1.5 font-medium">Heure d'envoi (UTC)</label>
            <select
              value={reportHour}
              onChange={e => setReportHour(Number(e.target.value))}
              className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 transition-all"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <button
        onClick={handleFinish}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[#c8f135] text-[#0f0f0f] font-bold rounded-xl hover:bg-[#a8cc2a] disabled:opacity-50 transition-all text-sm"
      >
        {saving ? 'Finalisation...' : 'Terminer la configuration →'}
      </button>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3.5 bg-[#1a1a1a] border border-[#c8f135]/40 rounded-2xl shadow-2xl animate-fade-in">
      <Zap className="w-4 h-4 text-[#c8f135] shrink-0" />
      <span className="text-white text-sm font-medium">{message}</span>
    </div>
  )
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export default function OnboardingWizard() {
  const { updateUser } = useAuth()
  const [step, setStep] = useState(0)
  const [showToast, setShowToast] = useState(false)

  const completeMut = useMutation({
    mutationFn: () => authApi.updateMe({ onboarding_completed: true }),
    onSuccess: () => {
      updateUser({ onboarding_completed: true })
      setShowToast(true)
      setTimeout(() => setShowToast(false), 4000)
    },
  })

  const handleFinish = () => completeMut.mutate()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-[#171717] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden">
          <ProgressBar step={step} />
          <div className="border-t border-[#222]">
            {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
            {step === 1 && <StepMaster onNext={() => { setStep(2) }} />}
            {step === 2 && <StepSlave onNext={() => setStep(3)} onSkip={() => setStep(3)} />}
            {step === 3 && <StepNotifications onFinish={handleFinish} />}
          </div>
        </div>
      </div>

      {showToast && (
        <Toast message="Configuration terminée ! Ton Copy Engine est actif 🚀" />
      )}
    </>
  )
}
