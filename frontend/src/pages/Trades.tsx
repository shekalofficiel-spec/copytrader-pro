import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { tradesApi } from '../lib/api'
import { formatCurrency, formatDateTime, getPnlColor, cn } from '../lib/utils'
import type { TradeStatus } from '../types'

function StatusBadge({ status }: { status: TradeStatus }) {
  const styles: Record<TradeStatus, string> = {
    OPEN: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    CLOSED: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    PARTIALLY_CLOSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    CANCELLED: 'bg-red-loss/10 text-red-loss border-red-loss/30',
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
      direction === 'BUY' ? 'bg-green-profit/10 text-green-profit' : 'bg-red-loss/10 text-red-loss'
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

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Trades</h1>
          <p className="text-gray-500 text-sm mt-1">{activeTrades.length} open · {total} total</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-gray-400 hover:text-white">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Active Trades */}
      {activeTrades.length > 0 && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-profit animate-pulse-slow" />
            <h2 className="text-sm font-semibold text-white">Open Positions ({activeTrades.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Symbol</th>
                  <th className="px-4 py-2 text-left">Dir</th>
                  <th className="px-4 py-2 text-right">Lot</th>
                  <th className="px-4 py-2 text-right">Open</th>
                  <th className="px-4 py-2 text-right">SL / TP</th>
                  <th className="px-4 py-2 text-right">P&L</th>
                  <th className="px-4 py-2 text-left">Opened</th>
                </tr>
              </thead>
              <tbody>
                {activeTrades.map(t => (
                  <tr key={t.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                    <td className="px-4 py-2.5 font-mono font-semibold text-white">{t.symbol}</td>
                    <td className="px-4 py-2.5"><DirectionBadge direction={t.direction} /></td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-300">{t.lot_size}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-300">{t.open_price.toFixed(5)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500 text-xs">
                      {t.stop_loss?.toFixed(5) ?? '—'} / {t.take_profit?.toFixed(5) ?? '—'}
                    </td>
                    <td className={cn('px-4 py-2.5 text-right font-mono font-semibold', getPnlColor(t.profit))}>
                      {formatCurrency(t.profit)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDateTime(t.open_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">Trade History</h2>
          <input
            type="text"
            placeholder="Symbol..."
            value={symbolFilter}
            onChange={e => { setSymbolFilter(e.target.value.toUpperCase()); setPage(1) }}
            className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-xs text-white w-28 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
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
              <tr className="border-b border-dark-700 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-left">Dir</th>
                <th className="px-4 py-2 text-right">Lot</th>
                <th className="px-4 py-2 text-right">Open</th>
                <th className="px-4 py-2 text-right">Close</th>
                <th className="px-4 py-2 text-right">P&L</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Latency</th>
                <th className="px-4 py-2 text-left">Opened</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="px-4 py-2.5 font-mono font-semibold text-white">{t.symbol}</td>
                  <td className="px-4 py-2.5"><DirectionBadge direction={t.direction} /></td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300">{t.lot_size}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">{t.open_price.toFixed(5)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-400 text-xs">{t.close_price?.toFixed(5) ?? '—'}</td>
                  <td className={cn('px-4 py-2.5 text-right font-mono font-semibold', getPnlColor(t.profit))}>
                    {formatCurrency(t.profit)}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-500">
                    {t.copy_latency_ms != null ? `${t.copy_latency_ms}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDateTime(t.open_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-dark-700 flex items-center justify-between text-sm text-gray-400">
            <span>{total} trades total</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded hover:bg-dark-700 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded hover:bg-dark-700 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
