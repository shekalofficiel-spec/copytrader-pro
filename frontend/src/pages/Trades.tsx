import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { tradesApi } from '../lib/api'
import { formatCurrency, formatDateTime, getPnlColor, cn } from '../lib/utils'
import type { TradeStatus } from '../types'

function StatusBadge({ status }: { status: TradeStatus }) {
  const styles: Record<TradeStatus, string> = {
    OPEN: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    CLOSED: 'bg-[#2a2a2a] text-[#8a8a8a] border-[#333]',
    PARTIALLY_CLOSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    CANCELLED: 'bg-[#f87171]/10 text-[#f87171] border-[#f87171]/30',
  }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded border', styles[status])}>
      {status}
    </span>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  return (
    <span className={cn(
      'text-xs font-bold px-2 py-0.5 rounded',
      direction === 'BUY' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'
    )}>
      {direction}
    </span>
  )
}

export default function Trades() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [symbolFilter, setSymbolFilter] = useState('')
  const pageSize = 50

  const { data: activeTrades = [] } = useQuery({
    queryKey: ['trades', 'active'],
    queryFn: tradesApi.active,
    refetchInterval: 2000,
  })

  const { data: tradeData } = useQuery({
    queryKey: ['trades', page, statusFilter, symbolFilter],
    queryFn: () => tradesApi.list({
      page,
      page_size: pageSize,
      status: statusFilter || undefined,
      symbol: symbolFilter || undefined,
    }),
  })

  const trades = tradeData?.trades ?? []
  const total = tradeData?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const exportCSV = () => {
    const headers = ['ID', 'Symbol', 'Direction', 'Lot', 'Open Price', 'Close Price', 'Profit', 'Status', 'Open Time']
    const rows = trades.map(t => [
      t.id, t.symbol, t.direction, t.lot_size, t.open_price, t.close_price ?? '', t.profit, t.status, t.open_time
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'trades.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const thCls = "px-4 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wider"
  const tdCls = "px-4 py-2.5"

  return (
    <div className="min-h-full bg-[#0f0f0f] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trades</h1>
          <p className="text-[#555] text-sm mt-0.5">{activeTrades.length} open · {total} total</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-sm text-[#8a8a8a] hover:text-white hover:border-[#333] transition-all">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Active Trades */}
      {activeTrades.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#222] flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Open Positions ({activeTrades.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#222]">
                  <th className={cn(thCls, 'text-left')}>Symbol</th>
                  <th className={cn(thCls, 'text-left')}>Dir</th>
                  <th className={cn(thCls, 'text-right')}>Lot</th>
                  <th className={cn(thCls, 'text-right')}>Open</th>
                  <th className={cn(thCls, 'text-right')}>SL / TP</th>
                  <th className={cn(thCls, 'text-right')}>P&L</th>
                  <th className={cn(thCls, 'text-left')}>Opened</th>
                </tr>
              </thead>
              <tbody>
                {activeTrades.map(t => (
                  <tr key={t.id} className="border-b border-[#1e1e1e] hover:bg-[#1f1f1f] transition-colors">
                    <td className={cn(tdCls, 'font-mono font-semibold text-white')}>{t.symbol}</td>
                    <td className={tdCls}><DirectionBadge direction={t.direction} /></td>
                    <td className={cn(tdCls, 'text-right font-mono text-[#8a8a8a]')}>{t.lot_size}</td>
                    <td className={cn(tdCls, 'text-right font-mono text-[#8a8a8a]')}>{t.open_price.toFixed(5)}</td>
                    <td className={cn(tdCls, 'text-right font-mono text-[#555] text-xs')}>
                      {t.stop_loss?.toFixed(5) ?? '—'} / {t.take_profit?.toFixed(5) ?? '—'}
                    </td>
                    <td className={cn(tdCls, 'text-right font-mono font-semibold', getPnlColor(t.profit))}>
                      {formatCurrency(t.profit)}
                    </td>
                    <td className={cn(tdCls, 'text-[#555] text-xs')}>{formatDateTime(t.open_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#222] flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">Trade History</h2>
          <input
            type="text"
            placeholder="Symbol..."
            value={symbolFilter}
            onChange={e => { setSymbolFilter(e.target.value.toUpperCase()); setPage(1) }}
            className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-white w-28 focus:outline-none focus:border-[#c8f135]/40 placeholder:text-[#444] transition-all"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#c8f135]/40 transition-all"
          >
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#222]">
                <th className={cn(thCls, 'text-left')}>Symbol</th>
                <th className={cn(thCls, 'text-left')}>Dir</th>
                <th className={cn(thCls, 'text-right')}>Lot</th>
                <th className={cn(thCls, 'text-right')}>Open</th>
                <th className={cn(thCls, 'text-right')}>Close</th>
                <th className={cn(thCls, 'text-right')}>P&L</th>
                <th className={cn(thCls, 'text-left')}>Status</th>
                <th className={cn(thCls, 'text-right')}>Latency</th>
                <th className={cn(thCls, 'text-left')}>Opened</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} className="border-b border-[#1e1e1e] hover:bg-[#1f1f1f] transition-colors">
                  <td className={cn(tdCls, 'font-mono font-semibold text-white')}>{t.symbol}</td>
                  <td className={tdCls}><DirectionBadge direction={t.direction} /></td>
                  <td className={cn(tdCls, 'text-right font-mono text-[#8a8a8a]')}>{t.lot_size}</td>
                  <td className={cn(tdCls, 'text-right font-mono text-[#8a8a8a] text-xs')}>{t.open_price.toFixed(5)}</td>
                  <td className={cn(tdCls, 'text-right font-mono text-[#555] text-xs')}>{t.close_price?.toFixed(5) ?? '—'}</td>
                  <td className={cn(tdCls, 'text-right font-mono font-semibold', getPnlColor(t.profit))}>
                    {formatCurrency(t.profit)}
                  </td>
                  <td className={tdCls}><StatusBadge status={t.status} /></td>
                  <td className={cn(tdCls, 'text-right font-mono text-xs text-[#555]')}>
                    {t.copy_latency_ms != null ? `${t.copy_latency_ms}ms` : '—'}
                  </td>
                  <td className={cn(tdCls, 'text-[#555] text-xs')}>{formatDateTime(t.open_time)}</td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-[#333] text-sm">No trades found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-[#222] flex items-center justify-between text-sm text-[#555]">
            <span>{total} trades total</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded-lg hover:bg-[#242424] disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white font-medium px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded-lg hover:bg-[#242424] disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
