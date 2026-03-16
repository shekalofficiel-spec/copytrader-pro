import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Power, TestTube, Trash2, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from 'lucide-react'
import { accountsApi } from '../lib/api'
import { formatCurrency, getBrokerColor, cn } from '../lib/utils'
import type { Account, BrokerType, AccountRole, LotMode } from '../types'

const BROKER_TYPES: BrokerType[] = ['METAAPI', 'MT5', 'MT4', 'CTRADER', 'BINANCE']
const LOT_MODES: LotMode[] = ['MIRROR', 'RATIO', 'FIXED', 'RISK_PERCENT']

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={cn(
      'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium animate-fade-in max-w-sm',
      type === 'success'
        ? 'bg-dark-800 border-green-profit/40 text-green-profit'
        : 'bg-dark-800 border-red-loss/40 text-red-loss'
    )}>
      {type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 ml-2">✕</button>
    </div>
  )
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({ account, onTest, onToggle, onDelete }: {
  account: Account
  onTest: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'bg-dark-800 border rounded-xl overflow-hidden transition-colors',
      account.is_active ? 'border-dark-700' : 'border-dark-700 opacity-60'
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-2 h-2 rounded-full shrink-0 mt-1',
              account.is_connected ? 'bg-green-profit' : 'bg-red-loss'
            )} />
            <div>
              <p className="font-semibold text-white">{account.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('text-xs px-2 py-0.5 rounded border font-mono', getBrokerColor(account.broker_type))}>
                  {account.broker_type}
                </span>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded border',
                  account.role === 'MASTER'
                    ? 'bg-gold/10 text-gold border-gold/30'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                )}>
                  {account.role}
                </span>
                {account.is_copy_paused && (
                  <span className="text-xs px-2 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                    PAUSED
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onTest} className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white transition-colors" title="Test connection">
              <TestTube className="w-4 h-4" />
            </button>
            <button onClick={onToggle} className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white transition-colors" title="Toggle">
              <Power className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg bg-red-loss/10 hover:bg-red-loss/20 text-red-loss transition-colors" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-500">Balance</p>
            <p className="text-sm font-mono text-white">{account.balance != null ? formatCurrency(account.balance) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Drawdown</p>
            <p className={cn('text-sm font-mono', account.current_drawdown > 3 ? 'text-red-loss' : 'text-white')}>
              {account.current_drawdown.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Open Trades</p>
            <p className="text-sm font-mono text-white">{account.open_trades_count}</p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Less' : 'More details'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-dark-700 px-4 py-3 grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-gray-500">Lot Mode:</span> <span className="text-white">{account.lot_mode}</span></div>
          <div><span className="text-gray-500">Ratio:</span> <span className="text-white font-mono">{account.lot_ratio}x</span></div>
          <div><span className="text-gray-500">Max DD:</span> <span className="text-white">{account.max_drawdown_pct}%</span></div>
          <div><span className="text-gray-500">Max Trades:</span> <span className="text-white">{account.max_trades}</span></div>
          <div><span className="text-gray-500">Min Margin:</span> <span className="text-white">{account.min_margin_level}%</span></div>
          <div><span className="text-gray-500">Prop Firm:</span> <span className="text-white">{account.prop_firm_mode ? 'Yes' : 'No'}</span></div>
          {account.allowed_instruments.length > 0 && (
            <div className="col-span-2">
              <span className="text-gray-500">Instruments:</span>{' '}
              <span className="text-white font-mono">{account.allowed_instruments.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Account Modal ────────────────────────────────────────────────────────
function AddAccountModal({ onClose, onSave, loading, error }: {
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({
    name: '',
    broker_type: 'MT5' as BrokerType,
    role: 'SLAVE' as AccountRole,
    lot_mode: 'RATIO' as LotMode,
    lot_ratio: 1.0,
    max_drawdown_pct: 5.0,
    max_trades: 10,
    min_margin_level: 200,
    max_lot_size: 10,
    prop_firm_mode: false,
    no_trade_weekend: false,
    allowed_instruments: '',
    // MetaApi (MT5/MT4 cloud — works on Mac)
    metaapi_token: '',
    metaapi_account_id: '',
    // MT5 (Windows only)
    login: '',
    password: '',
    server: '',
    // MT4
    host: '127.0.0.1',
    port: '5555',
    // Binance
    api_key: '',
    api_secret: '',
    futures: true,
    testnet: false,
  })

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }))

  const buildCredentials = () => {
    if (form.broker_type === 'METAAPI') {
      return { token: form.metaapi_token, account_id: form.metaapi_account_id }
    } else if (form.broker_type === 'MT5') {
      return { login: parseInt(form.login) || 0, password: form.password, server: form.server }
    } else if (form.broker_type === 'MT4') {
      return { host: form.host, port: parseInt(form.port) || 5555 }
    } else if (form.broker_type === 'BINANCE') {
      return { api_key: form.api_key, api_secret: form.api_secret, futures: form.futures, testnet: form.testnet }
    } else if (form.broker_type === 'CTRADER') {
      return { client_id: '', client_secret: '', access_token: '', refresh_token: '', account_id: 0, is_live: true }
    }
    return {}
  }

  const handleSubmit = () => {
    if (!form.name.trim()) return
    const instruments = form.allowed_instruments
      ? form.allowed_instruments.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      : []
    onSave({
      name: form.name.trim(),
      broker_type: form.broker_type,
      role: form.role,
      credentials: buildCredentials(),
      lot_mode: form.lot_mode,
      lot_ratio: form.lot_ratio,
      fixed_lot_size: 0.01,
      risk_percent: 1.0,
      max_drawdown_pct: form.max_drawdown_pct,
      max_trades: form.max_trades,
      min_margin_level: form.min_margin_level,
      max_lot_size: form.max_lot_size,
      prop_firm_mode: form.prop_firm_mode,
      no_trade_weekend: form.no_trade_weekend,
      no_trade_news: false,
      allowed_instruments: instruments,
    })
  }

  const inputCls = "w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold/50 placeholder:text-gray-600"
  const selectCls = "w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none"

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-dark-700 flex items-center justify-between sticky top-0 bg-dark-800">
          <h2 className="text-lg font-bold text-white">Add Trading Account</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-loss/10 border border-red-loss/30 rounded-lg p-3 text-sm text-red-loss">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Account Name *</label>
            <input
              type="text"
              placeholder="My MT5 Account"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className={inputCls}
              autoFocus
            />
          </div>

          {/* Broker + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Broker *</label>
              <select value={form.broker_type} onChange={e => set('broker_type', e.target.value)} className={selectCls}>
                {BROKER_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Role *</label>
              <select value={form.role} onChange={e => set('role', e.target.value)} className={selectCls}>
                <option value="MASTER">MASTER (source)</option>
                <option value="SLAVE">SLAVE (copy to)</option>
              </select>
            </div>
          </div>

          {/* Credentials by broker */}
          <div className="bg-dark-700/50 rounded-xl p-4 space-y-3 border border-dark-600">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {form.broker_type} Credentials
            </p>

            {form.broker_type === 'METAAPI' && (
              <>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                  <p className="font-bold mb-1">✅ Fonctionne sur Mac, Linux, Windows</p>
                  <p>1. Crée un compte gratuit sur <strong>metaapi.cloud</strong></p>
                  <p>2. Ajoute ton compte MT5 dans le dashboard</p>
                  <p>3. Copie le Token API et l'Account ID ci-dessous</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">MetaApi Token</label>
                  <input type="password" placeholder="Ton API token MetaApi" value={form.metaapi_token}
                    onChange={e => set('metaapi_token', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">MetaApi Account ID</label>
                  <input type="text" placeholder="ex: abc123def456..." value={form.metaapi_account_id}
                    onChange={e => set('metaapi_account_id', e.target.value)} className={inputCls} />
                </div>
              </>
            )}

            {form.broker_type === 'MT5' && (
              <>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-300">
                  ⚠️ MT5 direct = <strong>Windows uniquement</strong>. Sur Mac, utilise <strong>METAAPI</strong> à la place.
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Login (account number)</label>
                  <input type="number" placeholder="12345678" value={form.login} onChange={e => set('login', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Password</label>
                  <input type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Server</label>
                  <input type="text" placeholder="ICMarkets-Live01" value={form.server} onChange={e => set('server', e.target.value)} className={inputCls} />
                </div>
              </>
            )}

            {form.broker_type === 'MT4' && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Bridge Host</label>
                  <input type="text" value={form.host} onChange={e => set('host', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Bridge Port</label>
                  <input type="number" value={form.port} onChange={e => set('port', e.target.value)} className={inputCls} />
                </div>
                <p className="text-xs text-yellow-400/80">⚠️ Requires CopyTradeBridge.mq4 running in MT4</p>
              </>
            )}

            {form.broker_type === 'BINANCE' && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">API Key</label>
                  <input type="text" placeholder="Your Binance API key" value={form.api_key} onChange={e => set('api_key', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">API Secret</label>
                  <input type="password" placeholder="••••••••" value={form.api_secret} onChange={e => set('api_secret', e.target.value)} className={inputCls} />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.futures} onChange={e => set('futures', e.target.checked)} className="rounded" />
                    Futures (USDT-M)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.testnet} onChange={e => set('testnet', e.target.checked)} className="rounded" />
                    Testnet
                  </label>
                </div>
              </>
            )}

            {form.broker_type === 'CTRADER' && (
              <p className="text-xs text-gray-400">Configure cTrader OAuth credentials after adding the account via the API.</p>
            )}
          </div>

          {/* Risk Settings */}
          <div className="border border-dark-600 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Risk Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Lot Mode</label>
                <select value={form.lot_mode} onChange={e => set('lot_mode', e.target.value)} className={selectCls}>
                  {LOT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Lot Ratio</label>
                <input type="number" step="0.01" min="0.01" value={form.lot_ratio}
                  onChange={e => set('lot_ratio', parseFloat(e.target.value) || 1)}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Max Drawdown %</label>
                <input type="number" step="0.1" min="0.1" value={form.max_drawdown_pct}
                  onChange={e => set('max_drawdown_pct', parseFloat(e.target.value) || 5)}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Max Open Trades</label>
                <input type="number" min="1" value={form.max_trades}
                  onChange={e => set('max_trades', parseInt(e.target.value) || 10)}
                  className={inputCls} />
              </div>
            </div>
          </div>

          {/* Instruments */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Allowed Instruments <span className="text-gray-600">(comma-separated, leave empty = all)</span>
            </label>
            <input
              type="text"
              placeholder="EURUSD, XAUUSD, BTCUSDT"
              value={form.allowed_instruments}
              onChange={e => set('allowed_instruments', e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Prop Firm options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.prop_firm_mode} onChange={e => set('prop_firm_mode', e.target.checked)} />
              Prop Firm Mode
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.no_trade_weekend} onChange={e => set('no_trade_weekend', e.target.checked)} />
              No Weekend Trading
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700 flex gap-3 sticky bottom-0 bg-dark-800">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-lg border border-dark-600 text-gray-400 hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-gold text-dark-950 font-bold text-sm hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '⏳ Saving...' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Accounts() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const { data: accounts = [], isLoading, error: fetchError } = useQuery({
    queryKey: ['accounts'],
    queryFn: accountsApi.list,
    refetchInterval: 10000,
  })

  const createMut = useMutation({
    mutationFn: accountsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setShowAdd(false)
      setModalError(null)
      showToast('Account added successfully!', 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail || (err as { message?: string })?.message || 'Failed to add account'
      setModalError(String(msg))
    },
  })

  const deleteMut = useMutation({
    mutationFn: accountsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      showToast('Account deleted', 'success')
    },
    onError: () => showToast('Failed to delete account', 'error'),
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => accountsApi.toggle(id),
    onSuccess: (data: { is_active: boolean }) => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      showToast(data.is_active ? 'Account enabled' : 'Account disabled', 'success')
    },
  })

  const testMut = useMutation({ mutationFn: accountsApi.testConnection })

  const handleTest = async (id: number) => {
    const result = await testMut.mutateAsync(id)
    if (result.success) {
      showToast(`Connected! Balance: ${result.account_info?.balance ?? '?'}`, 'success')
    } else {
      showToast(`Connection failed: ${result.error}`, 'error')
    }
  }

  const masters = accounts.filter(a => a.role === 'MASTER')
  const slaves = accounts.filter(a => a.role === 'SLAVE')

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">{masters.length} master · {slaves.length} slave accounts</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setModalError(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-dark-950 rounded-lg text-sm font-bold hover:bg-gold-light transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      {/* Backend error */}
      {fetchError && (
        <div className="flex items-center gap-2 bg-red-loss/10 border border-red-loss/30 rounded-xl p-4 text-sm text-red-loss">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Cannot connect to backend. Make sure the FastAPI server is running on port 8000.</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-dark-800 border border-dark-700 rounded-xl h-40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Master accounts */}
      {masters.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gold mb-3 uppercase tracking-wide">Master Accounts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {masters.map(a => (
              <AccountCard key={a.id} account={a}
                onTest={() => handleTest(a.id)}
                onToggle={() => toggleMut.mutate(a.id)}
                onDelete={() => { if (confirm(`Delete "${a.name}"?`)) deleteMut.mutate(a.id) }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Slave accounts */}
      {slaves.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">Slave Accounts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {slaves.map(a => (
              <AccountCard key={a.id} account={a}
                onTest={() => handleTest(a.id)}
                onToggle={() => toggleMut.mutate(a.id)}
                onDelete={() => { if (confirm(`Delete "${a.name}"?`)) deleteMut.mutate(a.id) }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && accounts.length === 0 && !fetchError && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600 border border-dashed border-dark-600 rounded-xl">
          <div className="text-5xl mb-4">👥</div>
          <p className="text-lg text-gray-500">No accounts yet</p>
          <p className="text-sm mt-1">Click "Add Account" to connect your first broker</p>
          <button
            onClick={() => { setShowAdd(true); setModalError(null) }}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-gold text-dark-950 rounded-lg text-sm font-bold hover:bg-gold-light"
          >
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
      )}

      {/* Modal */}
      {showAdd && (
        <AddAccountModal
          onClose={() => { setShowAdd(false); setModalError(null) }}
          onSave={data => createMut.mutate(data)}
          loading={createMut.isPending}
          error={modalError}
        />
      )}
    </div>
  )
}
