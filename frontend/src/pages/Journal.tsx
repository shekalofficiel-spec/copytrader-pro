import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, RefreshCw, Star,
  ChevronLeft, ChevronRight, X, Save
} from 'lucide-react'
import { journalApi } from '../lib/api'
import { formatCurrency, cn } from '../lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────
interface JournalEntry {
  id: number
  trade_id?: number
  symbol: string
  direction: string
  open_time?: string
  close_time?: string
  open_price?: number
  close_price?: number
  lot_size?: number
  profit: number
  stop_loss?: number
  take_profit?: number
  r_multiple?: number
  setup_type?: string
  entry_reason?: string
  exit_reason?: string
  notes?: string
  mistakes?: string
  lessons?: string
  emotion?: string
  rating?: number
  tags?: string[]
}

interface JournalStats {
  total_trades: number
  win_rate: number
  total_pnl: number
  profit_factor: number
  avg_win: number
  avg_loss: number
  avg_r: number
  expectancy: number
  best_trade: number
  worst_trade: number
  avg_hold_hours: number
  streak_best: number
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EMOTIONS = ['neutral', 'confident', 'fearful', 'greedy', 'frustrated', 'disciplined']
const SETUPS = ['Trend Follow', 'Breakout', 'Reversal', 'Scalp', 'News', 'Support/Resistance', 'Pattern', 'Other']
const EMOTION_COLORS: Record<string, string> = {
  neutral: 'bg-[#2a2a2a] text-[#8a8a8a]',
  confident: 'bg-[#c8f135]/10 text-[#c8f135]',
  fearful: 'bg-[#f87171]/10 text-[#f87171]',
  greedy: 'bg-orange-500/10 text-orange-400',
  frustrated: 'bg-red-800/10 text-red-400',
  disciplined: 'bg-blue-500/10 text-blue-400',
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, green, red }: {
  label: string; value: string; sub?: string; green?: boolean; red?: boolean
}) {
  return (
    <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl p-4">
      <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">{label}</p>
      <p className={cn(
        'text-2xl font-bold',
        green ? 'text-[#4ade80]' : red ? 'text-[#f87171]' : 'text-white'
      )}>{value}</p>
      {sub && <p className="text-xs text-[#555] mt-1">{sub}</p>}
    </div>
  )
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarView({ year, month }: { year: number; month: number }) {
  const { data: days = [] } = useQuery({
    queryKey: ['journal-calendar', year, month],
    queryFn: () => journalApi.calendar(year, month),
  })

  const dayMap = useMemo(() => {
    const m: Record<number, { pnl: number; trades: number }> = {}
    for (const d of days as { day: number; pnl: number; trades: number }[]) {
      m[d.day] = d
    }
    return m
  }, [days])

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []

  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[10px] text-[#444] font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const info = dayMap[day]
          const pnl = info?.pnl ?? null
          return (
            <div
              key={day}
              className={cn(
                'aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all',
                pnl === null ? 'bg-[#1a1a1a] text-[#444]' :
                pnl > 0 ? 'bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/20' :
                'bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/20'
              )}
              title={info ? `${info.trades} trades · ${formatCurrency(pnl!)}` : ''}
            >
              <span className="font-medium">{day}</span>
              {info && <span className="text-[9px] opacity-80">{pnl! > 0 ? '+' : ''}{formatCurrency(pnl!)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    setup_type: entry.setup_type || '',
    entry_reason: entry.entry_reason || '',
    exit_reason: entry.exit_reason || '',
    notes: entry.notes || '',
    mistakes: entry.mistakes || '',
    lessons: entry.lessons || '',
    emotion: entry.emotion || 'neutral',
    rating: entry.rating || 0,
    r_multiple: entry.r_multiple || '',
    tags: entry.tags?.join(', ') || '',
  })

  const updateMut = useMutation({
    mutationFn: () => journalApi.update(entry.id, {
      ...form,
      r_multiple: form.r_multiple !== '' ? Number(form.r_multiple) : null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      rating: form.rating || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] })
      qc.invalidateQueries({ queryKey: ['journal-stats'] })
      onClose()
    },
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const textareaCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] resize-none transition-all"
  const inputCls = "w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 placeholder:text-[#444] transition-all"

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#171717] z-10 px-6 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-bold', entry.direction === 'BUY' ? 'text-[#4ade80]' : 'text-[#f87171]')}>
                {entry.direction}
              </span>
              <span className="text-white font-bold">{entry.symbol}</span>
              <span className={cn('text-sm font-semibold', entry.profit >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]')}>
                {formatCurrency(entry.profit)}
              </span>
            </div>
            <p className="text-xs text-[#555] mt-0.5">
              {entry.open_price?.toFixed(5)} → {entry.close_price?.toFixed(5)}
            </p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Rating + Emotion */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Trade Rating</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} onClick={() => set('rating', form.rating === s ? 0 : s)}>
                    <Star className={cn('w-6 h-6 transition-colors', s <= form.rating ? 'text-[#c8f135] fill-[#c8f135]' : 'text-[#333]')} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Emotion</label>
              <select
                value={form.emotion}
                onChange={e => set('emotion', e.target.value)}
                className="w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 transition-all"
              >
                {EMOTIONS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Setup + R Multiple */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Setup Type</label>
              <select value={form.setup_type} onChange={e => set('setup_type', e.target.value)}
                className="w-full bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c8f135]/50 transition-all">
                <option value="">Select setup...</option>
                {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">R Multiple</label>
              <input type="number" step="0.1" placeholder="e.g. 2.5"
                value={form.r_multiple} onChange={e => set('r_multiple', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Tags <span className="text-[#444]">(comma-separated)</span></label>
            <input type="text" placeholder="london, news, scalp" value={form.tags}
              onChange={e => set('tags', e.target.value)} className={inputCls} />
          </div>

          {/* Entry / Exit reason */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Entry Reason</label>
              <textarea rows={3} placeholder="Why did you enter this trade?"
                value={form.entry_reason} onChange={e => set('entry_reason', e.target.value)} className={textareaCls} />
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Exit Reason</label>
              <textarea rows={3} placeholder="Why did you exit?"
                value={form.exit_reason} onChange={e => set('exit_reason', e.target.value)} className={textareaCls} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Notes</label>
            <textarea rows={3} placeholder="General observations..."
              value={form.notes} onChange={e => set('notes', e.target.value)} className={textareaCls} />
          </div>

          {/* Mistakes / Lessons */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Mistakes</label>
              <textarea rows={3} placeholder="What went wrong?"
                value={form.mistakes} onChange={e => set('mistakes', e.target.value)} className={textareaCls} />
            </div>
            <div>
              <label className="block text-xs text-[#8a8a8a] mb-2 font-medium">Lessons Learned</label>
              <textarea rows={3} placeholder="What will you do differently?"
                value={form.lessons} onChange={e => set('lessons', e.target.value)} className={textareaCls} />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-[#171717] px-6 py-4 border-t border-[#2a2a2a] flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] text-[#8a8a8a] hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#c8f135] text-[#0f0f0f] font-bold text-sm hover:bg-[#a8cc2a] disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {updateMut.isPending ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Trade Row ─────────────────────────────────────────────────────────────────
function TradeRow({ entry, onClick }: { entry: JournalEntry; onClick: () => void }) {
  const hasNotes = entry.notes || entry.entry_reason || entry.setup_type
  const date = entry.close_time ? new Date(entry.close_time) : entry.open_time ? new Date(entry.open_time) : null

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1e1e1e] hover:bg-[#1f1f1f] cursor-pointer transition-colors group"
    >
      {/* Direction dot */}
      <div className={cn('w-1.5 h-8 rounded-full shrink-0', entry.direction === 'BUY' ? 'bg-[#4ade80]' : 'bg-[#f87171]')} />

      {/* Symbol + setup */}
      <div className="w-28 shrink-0">
        <p className="text-white font-bold text-sm">{entry.symbol}</p>
        <p className="text-[#555] text-xs">{entry.setup_type || 'No setup'}</p>
      </div>

      {/* Date */}
      <div className="w-24 shrink-0 hidden md:block">
        <p className="text-[#8a8a8a] text-xs">{date?.toLocaleDateString() ?? '—'}</p>
      </div>

      {/* P&L */}
      <div className="w-24 shrink-0">
        <p className={cn('font-bold text-sm', entry.profit >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]')}>
          {entry.profit >= 0 ? '+' : ''}{formatCurrency(entry.profit)}
        </p>
        {entry.r_multiple != null && (
          <p className="text-[#555] text-xs">{entry.r_multiple > 0 ? '+' : ''}{entry.r_multiple.toFixed(2)}R</p>
        )}
      </div>

      {/* Emotion */}
      {entry.emotion && (
        <span className={cn('text-xs px-2 py-0.5 rounded hidden lg:block', EMOTION_COLORS[entry.emotion] || EMOTION_COLORS.neutral)}>
          {entry.emotion}
        </span>
      )}

      {/* Rating stars */}
      <div className="flex gap-0.5 hidden lg:flex">
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} className={cn('w-3 h-3', s <= (entry.rating || 0) ? 'text-[#c8f135] fill-[#c8f135]' : 'text-[#333]')} />
        ))}
      </div>

      {/* Tags */}
      <div className="flex gap-1.5 flex-1 min-w-0 hidden xl:flex">
        {(entry.tags || []).slice(0, 3).map(tag => (
          <span key={tag} className="text-xs px-2 py-0.5 bg-[#242424] text-[#8a8a8a] rounded">#{tag}</span>
        ))}
      </div>

      {/* Notes indicator */}
      <div className="shrink-0">
        {hasNotes
          ? <BookOpen className="w-3.5 h-3.5 text-[#c8f135]/60 group-hover:text-[#c8f135]" />
          : <BookOpen className="w-3.5 h-3.5 text-[#333] group-hover:text-[#555]" />
        }
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Journal() {
  const qc = useQueryClient()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [tab, setTab] = useState<'trades' | 'calendar'>('trades')
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [statDays, setStatDays] = useState(30)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalApi.entries({ limit: 200 }),
    refetchInterval: 30000,
  })

  const { data: stats } = useQuery({
    queryKey: ['journal-stats', statDays],
    queryFn: () => journalApi.stats(statDays),
    refetchInterval: 30000,
  })

  const syncMut = useMutation({
    mutationFn: journalApi.syncTrades,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] })
      qc.invalidateQueries({ queryKey: ['journal-stats'] })
      qc.invalidateQueries({ queryKey: ['journal-calendar'] })
    },
  })

  const monthName = new Date(calYear, calMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })

  const s = stats as JournalStats | undefined

  return (
    <div className="min-h-full bg-[#0f0f0f] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Journal</h1>
          <p className="text-[#555] text-sm mt-0.5">Track, review and improve your trades</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statDays}
            onChange={e => setStatDays(Number(e.target.value))}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-[#8a8a8a] focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-sm text-[#8a8a8a] hover:text-white hover:border-[#333] transition-all"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', syncMut.isPending && 'animate-spin')} />
            {syncMut.isPending ? 'Syncing...' : 'Sync Trades'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard label="Total Trades" value={String(s?.total_trades ?? 0)} />
        <StatCard
          label="Win Rate"
          value={`${s?.win_rate ?? 0}%`}
          green={(s?.win_rate ?? 0) >= 50}
          red={(s?.win_rate ?? 0) < 50 && (s?.total_trades ?? 0) > 0}
        />
        <StatCard
          label="Net P&L"
          value={formatCurrency(s?.total_pnl ?? 0)}
          green={(s?.total_pnl ?? 0) > 0}
          red={(s?.total_pnl ?? 0) < 0}
        />
        <StatCard label="Profit Factor" value={String(s?.profit_factor ?? 0)} green={(s?.profit_factor ?? 0) >= 1.5} />
        <StatCard label="Avg Win" value={formatCurrency(s?.avg_win ?? 0)} green />
        <StatCard label="Avg Loss" value={formatCurrency(s?.avg_loss ?? 0)} red />
        <StatCard label="Avg R" value={`${s?.avg_r ?? 0}R`} />
        <StatCard label="Best Streak" value={String(s?.streak_best ?? 0)} sub="wins in a row" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1a1a] border border-[#242424] rounded-xl p-1 w-fit">
        {(['trades', 'calendar'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
              tab === t ? 'bg-[#c8f135] text-[#0f0f0f]' : 'text-[#555] hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Trade List */}
      {tab === 'trades' && (
        <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-[#222]">
            <div className="w-1.5 shrink-0" />
            <div className="w-28 shrink-0 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Symbol</div>
            <div className="w-24 shrink-0 text-[10px] font-semibold text-[#555] uppercase tracking-wider hidden md:block">Date</div>
            <div className="w-24 shrink-0 text-[10px] font-semibold text-[#555] uppercase tracking-wider">P&L / R</div>
            <div className="text-[10px] font-semibold text-[#555] uppercase tracking-wider hidden lg:block">Emotion</div>
            <div className="text-[10px] font-semibold text-[#555] uppercase tracking-wider hidden lg:block">Rating</div>
            <div className="flex-1 text-[10px] font-semibold text-[#555] uppercase tracking-wider hidden xl:block">Tags</div>
            <div className="text-[10px] font-semibold text-[#555] uppercase tracking-wider">Notes</div>
          </div>

          {isLoading ? (
            <div className="space-y-1 p-4">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[#242424] rounded-xl animate-pulse" />)}
            </div>
          ) : (entries as JournalEntry[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#555]">
              <BookOpen className="w-10 h-10 mb-3 text-[#2a2a2a]" />
              <p className="text-[#8a8a8a] font-medium">No journal entries yet</p>
              <p className="text-sm mt-1">Click "Sync Trades" to import your closed trades</p>
              <button
                onClick={() => syncMut.mutate()}
                className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-[#c8f135] text-[#0f0f0f] rounded-xl text-sm font-bold hover:bg-[#a8cc2a] transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Sync Now
              </button>
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              {(entries as JournalEntry[]).map(entry => (
                <TradeRow key={entry.id} entry={entry} onClick={() => setSelectedEntry(entry)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar */}
      {tab === 'calendar' && (
        <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold text-sm">{monthName}</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const d = new Date(calYear, calMonth - 2)
                setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1)
              }} className="p-1.5 rounded-lg hover:bg-[#242424] text-[#555] hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => {
                const d = new Date(calYear, calMonth)
                setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1)
              }} className="p-1.5 rounded-lg hover:bg-[#242424] text-[#555] hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <CalendarView year={calYear} month={calMonth} />
          <div className="flex items-center gap-4 mt-4 text-xs text-[#555]">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#4ade80]/20 border border-[#4ade80]/30" /> Profitable day</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#f87171]/20 border border-[#f87171]/30" /> Loss day</div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {selectedEntry && (
        <EditModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  )
}
