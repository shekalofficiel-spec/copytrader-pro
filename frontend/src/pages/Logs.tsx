import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { tradesApi } from '../lib/api'
import { formatDateTime, cn } from '../lib/utils'
import { useWebSocket } from '../hooks/useWebSocket'
import type { CopyStatus } from '../types'

function CopyStatusBadge({ status }: { status: CopyStatus }) {
  const styles: Record<CopyStatus, string> = {
    SUCCESS: 'bg-green-profit/10 text-green-profit border-green-profit/30',
    FAILED: 'bg-red-loss/10 text-red-loss border-red-loss/30',
    SKIPPED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    RETRYING: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  }
  const icons = { SUCCESS: '✅', FAILED: '❌', SKIPPED: '⏭️', RETRYING: '🔄' }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded border', styles[status])}>
      {icons[status]} {status}
    </span>
  )
}

export default function Logs() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const { events } = useWebSocket()

  const { data } = useQuery({
    queryKey: ['copy-events', page, statusFilter],
    queryFn: () => tradesApi.copyEvents({ page, page_size: 50, status: statusFilter || undefined }),
    refetchInterval: 5000,
  })

  const copyEvents = data?.events ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 50)

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Logs</h1>
        <p className="text-gray-500 text-sm mt-1">Copy events and live activity feed</p>
      </div>

      {/* Live System Events */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-profit animate-pulse-slow" />
            <h2 className="text-sm font-semibold text-white">Live System Feed</h2>
          </div>
          <span className="text-xs text-gray-500">{events.length} events</span>
        </div>
        <div className="max-h-48 overflow-y-auto font-mono text-xs">
          {events.length === 0 ? (
            <p className="p-4 text-gray-600">No live events. Waiting...</p>
          ) : events.map((e, i) => (
            <div key={i} className={cn(
              'flex items-start gap-3 px-4 py-2 border-b border-dark-700/40',
              e.severity === 'error' ? 'text-red-loss' :
              e.severity === 'success' ? 'text-green-profit' :
              e.severity === 'warning' ? 'text-yellow-400' : 'text-gray-300'
            )}>
              <span className="text-gray-600 shrink-0">{formatDateTime(e.timestamp)}</span>
              <span>[{e.event_type}]</span>
              <span className="flex-1">{e.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Copy Events History */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">Copy Events ({total})</h2>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="">All</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-left">Dir</th>
                <th className="px-4 py-2 text-right">Master Lot</th>
                <th className="px-4 py-2 text-right">Slave Lot</th>
                <th className="px-4 py-2 text-right">Latency</th>
                <th className="px-4 py-2 text-left">Error</th>
                <th className="px-4 py-2 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {copyEvents.map(e => (
                <tr key={e.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="px-4 py-2.5"><CopyStatusBadge status={e.status} /></td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-white">{e.symbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-xs font-bold', e.direction === 'BUY' ? 'text-green-profit' : 'text-red-loss')}>
                      {e.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">{e.master_lot}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">{e.slave_lot}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400">
                    {e.latency_ms != null ? `${e.latency_ms}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-red-loss max-w-xs truncate">{e.error_message || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDateTime(e.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-dark-700 flex items-center justify-between text-sm text-gray-400">
            <span>{total} events total</span>
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
