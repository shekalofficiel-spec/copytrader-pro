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
        ? 'bg-[#1a1a1a] border-[#4ade80]/40 text-[#4ade80]'
        : 'bg-[#1a1a1a] border-[#f87171]/40 text-[#f87171]'
    )}>
      {type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 ml-2 text-lg leading-none">✕</button>
    </div>
  )
}

// ─── Prop Firm Mini Card ──────────────────────────────────────────────────────
function PropFirmCard({ account }: { account: Account }) {
  const ddLimit = account.daily_drawdown_pct ?? account.max_drawdown_pct
  const ddPct = Math.min((account.current_drawdown / ddLimit) * 100, 100)
  const ddAlert = ddPct > 80
  const profitPct = account.profit_target_pct
    ? Math.min((account.total_profit / ((account.balance ?? 10000) * (account.profit_target_pct / 100))) * 100, 100)
    : null
  const inRules = !account.is_copy_paused && !ddAlert

  return (
    <div className={cn(
      'mt-3 rounded-xl p-3 border text-xs',
      ddAlert ? 'bg-[#f87171]/5 border-[#f87171]/20' : 'bg-[#1f1f1f] border-[#2a2a2a]'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#555] font-medium uppercase tracking-wide">
          {account.prop_firm_rules || 'Prop Firm'}
        </span>
        <span className={cn(
          'px-2 py-0.5 rounded-full font-medium',
          inRules ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'
        )}>
          {inRules ? '🟢 Dans les règles' : '🔴 Attention'}
        </span>
      </div>
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-[#666] mb-1">
            <span>Drawdown journalier</span>
            <span className={ddAlert ? 'text-[#f87171]' : 'text-white'}>{account.current_drawdown.toFixed(2)}% / {ddLimit}%</span>
          </div>
          <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', ddAlert ? 'bg-[#f87171]' : 'bg-[#4ade80]')}
              style={{ width: `${ddPct}%` }} />
          </div>
        </div>
        {profitPct !== null && (
          <div>
            <div className="flex justify-between text-[#666] mb-1">
              <span>Objectif profit</span>
              <span className="text-white">{account.total_profit.toFixed(0)}$ / {account.profit_target_pct}%</span>
            </div>
            <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
              <div className="h-full bg-[#c8f135] rounded-full transition-all" style={{ width: `${profitPct}%` }} />
            </div>
          </div>
        )}
      </div>
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
      'bg-[#1a1a1a] border rounded-2xl overflow-hidden transition-all duration-200 hover:border-[#333]',
      account.is_active ? 'border-[#242424]' : 'border-[#242424] opacity-60'
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-2 h-2 rounded-full shrink-0 mt-1',
              account.is_connected ? 'bg-[#4ade80] animate-pulse' : 'bg-[#f87171]'
            )} />
            <div>
              <p className="font-semibold text-white text-sm">{account.name}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={cn('text-xs px-2 py-0.5 rounded border font-mono', getBrokerColor(account.broker_type))}>
                  {account.broker_type}
                </span>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded border',
                  account.role === 'MASTER'
                    ? 'bg-[#c8f135]/10 text-[#c8f135] border-[#c8f135]/30'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                )}>
                  {account.role}
                </span>
                {account.prop_firm_mode && (
                  <span className="text-xs px-2 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/30">
                    PROP
                  </span>
                )}
                {account.is_verified ? (
                  <span className="text-xs px-2 py-0.5 rounded border bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30">
                    ✓ Vérifié
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                    Non vérifié
                  </span>
                )}
                {account.is_copy_paused && (
                  <span className="text-xs px-2 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                    PAUSED
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={onTest} className="p-1.5 rounded-lg bg-[#242424] hover:bg-[#2a2a2a] text-[#555] hover:text-white transition-colors" title="Test connection">
              <TestTube className="w-3.5 h-3.5" />
            </button>
            <button onClick={onToggle} className="p-1.5 rounded-lg bg-[#242424] hover:bg-[#2a2a2a] text-[#555] hover:text-white transition-colors" title="Toggle">
              <Power className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg bg-[#f87171]/10 hover:bg-[#f87171]/20 text-[#f87171] transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center bg-[#141414] rounded-xl p-3">
          <div>
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Balance</p>
            <p className="text-sm font-mono text-white font-semibold">{account.balance != null ? formatCurrency(account.balance) : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Drawdown</p>
            <p className={cn('text-sm font-mono font-semibold', account.current_drawdown > 3 ? 'text-[#f87171]' : 'text-white')}>
              {account.current_drawdown.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Open Trades</p>
            <p className="text-sm font-mono text-white font-semibold">{account.open_trades_count}</p>
          </div>
        </div>

        {account.prop_firm_mode && <PropFirmCard account={account} />}

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-[#555] hover:text-[#8a8a8a] transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Less' : 'More details'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#222] px-4 py-3 grid grid-cols-2 gap-2 text-xs bg-[#141414]">
          <div><span className="text-[#555]">Lot Mode:</span> <span className="text-white">{account.lot_mode}</span></div>
          <div><span className="text-[#555]">Ratio:</span> <span className="text-white font-mono">{account.lot_ratio}x</span></div>
          <div><span className="text-[#555]">Max DD:</span> <span className="text-white">{account.max_drawdown_pct}%</span></div>
          <div><span className="text-[#555]">Max Trades:</span> <span className="text-white">{account.max_trades}</span></div>
          <div><span className="text-[#555]">Min Margin:</span> <span className="text-white">{account.min_margin_level}%</span></div>
          <div><span className="text-[#555]">No Weekend:</span> <span className="text-white">{account.no_trade_weekend ? 'Yes' : 'No'}</span></div>
          {account.allowed_instruments.length > 0 && (
            <div className="col-span-2">
              <span className="text-[#555]">Instruments:</span>{' '}
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
    prop_firm_rules: 'FTMO',
    profit_target_pct: 10,
    daily_drawdown_pct: 5,
    total_drawdown_pct: 10,
    no_trade_weekend: false,
    no_trade_news: false,
    allowed_instruments: '',
    metaapi_token: '',
    metaapi_account_id: '',
    login: '',
    password: '',
    server: '',
    host: '127.0.0.1',
    port: '5555',
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
      prop_firm_rules: form.prop_firm_mode ? form.prop_firm_rules : null,
      profit_target_pct: form.prop_firm_mode ? form.profit_target_pct : null,
      daily_drawdown_pct: form.prop_firm_mode ? form.daily_drawdown_pct : null,
      total_drawdown_pct: form.prop_firm_mode ? form.total_drawdown_pct : null,
      no_trade_weekend: form.no_trade_weekend,
      no_trade_news: form.no_trade_news,
      allowed_instruments: instruments,
    })
  }

  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"
  const selectCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 transition-all"
  const labelCls = "block text-xs text-[#8a8a8a] mb-1.5 font-medium"

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-[#2a2a2a] flex items-center justify-between sticky top-0 bg-[#171717] z-10">
          <h2 className="text-base font-bold text-white">Add Trading Account</h2>
          <button onClick={onClose} className="text-[#555] hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl p-3 text-sm text-[#f87171]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className={labelCls}>Account Name *</label>
            <input type="text" placeholder="My MT5 Account" value={form.name}
              onChange={e => set('name', e.target.value)} className={inputCls} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Broker *</label>
              <select value={form.broker_type} onChange={e => set('broker_type', e.target.value)} className={selectCls}>
                {BROKER_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Role *</label>
              <select value={form.role} onChange={e => set('role', e.target.value)} className={selectCls}>
                <option value="MASTER">MASTER (source)</option>
                <option value="SLAVE">SLAVE (copy to)</option>
              </select>
            </div>
          </div>

          {/* Credentials by broker */}
          <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-3 border border-[#2a2a2a]">
            <p className="text-xs font-semibold text-[#8a8a8a] uppercase tracking-wide">
              {form.broker_type} Credentials
            </p>

            {form.broker_type === 'METAAPI' && (
              <>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                  <p className="font-bold mb-1">Works on Mac, Linux, Windows</p>
                  <p>1. Create a free account on <strong>metaapi.cloud</strong></p>
                  <p>2. Add your MT5 account in the dashboard</p>
                  <p>3. Copy the API Token and Account ID below</p>
                </div>
                <div>
                  <label className={labelCls}>MetaApi Token</label>
                  <input type="password" placeholder="Your API token" value={form.metaapi_token}
                    onChange={e => set('metaapi_token', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>MetaApi Account ID</label>
                  <input type="text" placeholder="abc123def456..." value={form.metaapi_account_id}
                    onChange={e => set('metaapi_account_id', e.target.value)} className={inputCls} />
                </div>
              </>
            )}

            {form.broker_type === 'MT5' && (
              <>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-300">
                  MT5 direct = <strong>Windows only</strong>. On Mac, use <strong>METAAPI</strong> instead.
                </div>
                <div>
                  <label className={labelCls}>Login (account number)</label>
                  <input type="number" placeholder="12345678" value={form.login} onChange={e => set('login', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Password</label>
                  <input type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Server</label>
                  <input type="text" placeholder="ICMarkets-Live01" value={form.server} onChange={e => set('server', e.target.value)} className={inputCls} />
                </div>
              </>
            )}

            {form.broker_type === 'MT4' && (
              <>
                <div>
                  <label className={labelCls}>Bridge Host</label>
                  <input type="text" value={form.host} onChange={e => set('host', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Bridge Port</label>
                  <input type="number" value={form.port} onChange={e => set('port', e.target.value)} className={inputCls} />
                </div>
                <p className="text-xs text-yellow-400/80">Requires CopyTradeBridge.mq4 running in MT4</p>
              </>
            )}

            {form.broker_type === 'BINANCE' && (
              <>
                <div>
                  <label className={labelCls}>API Key</label>
                  <input type="text" placeholder="Your Binance API key" value={form.api_key} onChange={e => set('api_key', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>API Secret</label>
                  <input type="password" placeholder="••••••••" value={form.api_secret} onChange={e => set('api_secret', e.target.value)} className={inputCls} />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-[#8a8a8a] cursor-pointer">
                    <input type="checkbox" checked={form.futures} onChange={e => set('futures', e.target.checked)} className="rounded" />
                    Futures (USDT-M)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#8a8a8a] cursor-pointer">
                    <input type="checkbox" checked={form.testnet} onChange={e => set('testnet', e.target.checked)} className="rounded" />
                    Testnet
                  </label>
                </div>
              </>
            )}

            {form.broker_type === 'CTRADER' && (
              <p className="text-xs text-[#8a8a8a]">Configure cTrader OAuth credentials after adding the account.</p>
            )}
          </div>

          {/* Risk Settings */}
          <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#8a8a8a] uppercase tracking-wide">Risk Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Lot Mode</label>
                <select value={form.lot_mode} onChange={e => set('lot_mode', e.target.value)} className={selectCls}>
                  {LOT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Lot Ratio</label>
                <input type="number" step="0.01" min="0.01" value={form.lot_ratio}
                  onChange={e => set('lot_ratio', parseFloat(e.target.value) || 1)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Max Drawdown %</label>
                <input type="number" step="0.1" min="0.1" value={form.max_drawdown_pct}
                  onChange={e => set('max_drawdown_pct', parseFloat(e.target.value) || 5)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Max Open Trades</label>
                <input type="number" min="1" value={form.max_trades}
                  onChange={e => set('max_trades', parseInt(e.target.value) || 10)} className={inputCls} />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Allowed Instruments <span className="text-[#444]">(comma-separated, leave empty = all)</span>
            </label>
            <input type="text" placeholder="EURUSD, XAUUSD, BTCUSDT"
              value={form.allowed_instruments} onChange={e => set('allowed_instruments', e.target.value)} className={inputCls} />
          </div>

          {/* Prop Firm Mode */}
          <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#8a8a8a] uppercase tracking-wide">Mode Prop Firm</p>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={form.prop_firm_mode} onChange={e => set('prop_firm_mode', e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-[#242424] peer-focus:outline-none rounded-full peer peer-checked:bg-[#c8f135] transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
              </label>
            </div>

            {form.prop_firm_mode && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className={labelCls}>Règles de la prop firm</label>
                  <select value={form.prop_firm_rules} onChange={e => set('prop_firm_rules', e.target.value)} className={selectCls}>
                    <option value="FTMO">FTMO</option>
                    <option value="MFF">MyForexFunds</option>
                    <option value="THE5ERS">The5ers</option>
                    <option value="E8">E8 Funding</option>
                    <option value="CUSTOM">Personnalisé</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Objectif profit %</label>
                    <input type="number" step="0.1" min="0.1" value={form.profit_target_pct}
                      onChange={e => set('profit_target_pct', parseFloat(e.target.value) || 10)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>DD journalier %</label>
                    <input type="number" step="0.1" min="0.1" value={form.daily_drawdown_pct}
                      onChange={e => set('daily_drawdown_pct', parseFloat(e.target.value) || 5)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>DD total %</label>
                    <input type="number" step="0.1" min="0.1" value={form.total_drawdown_pct}
                      onChange={e => set('total_drawdown_pct', parseFloat(e.target.value) || 10)} className={inputCls} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.no_trade_news} onChange={e => set('no_trade_news', e.target.checked)} className="rounded" />
                    <div>
                      <p className="text-sm text-white">Pas de trading pendant les news</p>
                      <p className="text-xs text-[#555]">Bloque les ordres 2 min avant/après news High Impact</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.no_trade_weekend} onChange={e => set('no_trade_weekend', e.target.checked)} className="rounded" />
                    <div>
                      <p className="text-sm text-white">Pas de positions ouvertes le weekend</p>
                      <p className="text-xs text-[#555]">Ferme automatiquement toutes les positions le vendredi à 21h UTC</p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[#2a2a2a] flex gap-3 sticky bottom-0 bg-[#171717]">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] text-[#8a8a8a] hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#c8f135] text-[#0f0f0f] font-bold text-sm hover:bg-[#a8cc2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving...' : 'Add Account'}
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
    <div className="min-h-full bg-[#0f0f0f] p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts</h1>
          <p className="text-[#555] text-sm mt-0.5">{masters.length} master · {slaves.length} slave accounts</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setModalError(null) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#c8f135] text-[#0f0f0f] rounded-xl text-sm font-bold hover:bg-[#a8cc2a] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl p-4 text-sm text-[#f87171]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Cannot connect to backend. Make sure the FastAPI server is running on port 8000.</span>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#1a1a1a] border border-[#242424] rounded-2xl h-40 animate-pulse" />
          ))}
        </div>
      )}

      {masters.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[#c8f135] mb-3 uppercase tracking-wider">Master Accounts</h2>
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

      {slaves.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-blue-400 mb-3 uppercase tracking-wider">Slave Accounts</h2>
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

      {!isLoading && accounts.length === 0 && !fetchError && (
        <div className="flex flex-col items-center justify-center py-20 text-[#555] border border-dashed border-[#2a2a2a] rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-[#555]" />
          </div>
          <p className="text-base text-[#8a8a8a] font-medium">No accounts yet</p>
          <p className="text-sm text-[#555] mt-1">Connect your first broker to start copying</p>
          <button
            onClick={() => { setShowAdd(true); setModalError(null) }}
            className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-[#c8f135] text-[#0f0f0f] rounded-xl text-sm font-bold hover:bg-[#a8cc2a] transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
      )}

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
