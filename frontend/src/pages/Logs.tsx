import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { tradesApi } from '../lib/api'
import { formatDateTime, cn } from '../lib/utils'
import { useWebSocket } from '../hooks/useWebSocket'
import type { CopyStatus } from '../types'

function CopyStatusBadge({ status }: { status: CopyStatus }) {
  const styles: Record<CopyStatus, string> = {
    SUCCESS: 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30',
    FAILED: 'bg-[#f87171]/10 text-[#f87171] border-[#f87171]/30',
    SKIPPED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    RETRYING: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  }
  const dots: Record<CopyStatus, string> = {
    SUCCESS: 'bg-[#4ade80]',
    FAILED: 'bg-[#f87171]',
    SKIPPED: 'bg-yellow-400',
    RETRYING: 'bg-blue-400',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border', styles[status])}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dots[status])} />
      {status}
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

  const thCls = "px-4 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wider"
  const tdCls = "px-4 py-2.5"

  return (
    <div className="min-h-full bg-[#0f0f0f] p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Logs</h1>
        <p className="text-[#555] text-sm mt-0.5">Copy events and live activity feed</p>
      </div>

      {/* Live System Events */}
      <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#222] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#c8f135] animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Live System Feed</h2>
          </div>
          <span className="text-xs text-[#555]">{events.length} events</span>
        </div>
        <div className="max-h-52 overflow-y-auto font-mono text-xs">
          {events.length === 0 ? (
            <p className="p-5 text-[#333]">No live events. Waiting for activity...</p>
          ) : events.map((e, i) => (
            <div key={i} className={cn(
              'flex items-start gap-3 px-5 py-2 border-b border-[#1e1e1e] hover:bg-[#1f1f1f] transition-colors',
              e.severity === 'error' ? 'text-[#f87171]' :
              e.severity === 'success' ? 'text-[#4ade80]' :
              e.severity === 'warning' ? 'text-yellow-400' : 'text-[#8a8a8a]'
            )}>
              <span className="text-[#444] shrink-0">{formatDateTime(e.timestamp)}</span>
              <span className="text-[#555]">[{e.event_type}]</span>
              <span className="flex-1">{e.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Copy Events History */}
      <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#222] flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">Copy Events ({total})</h2>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#c8f135]/40 transition-all"
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
              <tr className="border-b border-[#222]">
                <th className={cn(thCls, 'text-left')}>Status</th>
                <th className={cn(thCls, 'text-left')}>Symbol</th>
                <th className={cn(thCls, 'text-left')}>Dir</th>
                <th className={cn(thCls, 'text-right')}>Master Lot</th>
                <th className={cn(thCls, 'text-right')}>Slave Lot</th>
                <th className={cn(thCls, 'text-right')}>Latency</th>
                <th className={cn(thCls, 'text-left')}>Error</th>
                <th className={cn(thCls, 'text-left')}>Time</th>
              </tr>
            </thead>
            <tbody>
              {copyEvents.map(e => (
                <tr key={e.id} className="border-b border-[#1e1e1e] hover:bg-[#1f1f1f] transition-colors">
                  <td className={tdCls}><CopyStatusBadge status={e.status} /></td>
                  <td className={cn(tdCls, 'font-mono font-semibold text-white')}>{e.symbol}</td>
                  <td className={tdCls}>
                    <span className={cn('text-xs font-bold', e.direction === 'BUY' ? 'text-[#4ade80]' : 'text-[#f87171]')}>
                      {e.direction}
                    </span>
                  </td>
                  <td className={cn(tdCls, 'text-right font-mono text-[#8a8a8a] text-xs')}>{e.master_lot}</td>
                  <td className={cn(tdCls, 'text-right font-mono text-[#8a8a8a] text-xs')}>{e.slave_lot}</td>
                  <td className={cn(tdCls, 'text-right font-mono text-xs text-[#555]')}>
                    {e.latency_ms != null ? `${e.latency_ms}ms` : '—'}
                  </td>
                  <td className={cn(tdCls, 'text-xs text-[#f87171] max-w-xs truncate')}>{e.error_message || '—'}</td>
                  <td className={cn(tdCls, 'text-[#555] text-xs')}>{formatDateTime(e.timestamp)}</td>
                </tr>
              ))}
              {copyEvents.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[#333] text-sm">No copy events yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-[#222] flex items-center justify-between text-sm text-[#555]">
            <span>{total} events total</span>
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
