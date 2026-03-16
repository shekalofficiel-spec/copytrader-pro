import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Users, Copy, Clock, AlertTriangle } from 'lucide-react'
import { dashboardApi } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { formatCurrency, formatDateTime, getSeverityColor, cn } from '../lib/utils'
import type { LiveEvent } from '../types'

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string
  value: string
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-gray-400 text-sm">{title}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function EventRow({ event }: { event: LiveEvent }) {
  const colorCls = getSeverityColor(event.severity)
  const icons: Record<string, string> = {
    COPY_SUCCESS: '✅',
    COPY_FAILED: '❌',
    COPY_SKIPPED: '⏭️',
    TRADE_OPENED: '📈',
    TRADE_CLOSED: '📉',
    KILL_SWITCH: '🛑',
    RISK_ALERT: '⚠️',
  }
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 border-b border-dark-700 text-sm animate-fade-in', colorCls)}>
      <span className="text-base mt-0.5">{icons[event.event_type] || '•'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white truncate">{event.message}</p>
        <p className="text-gray-500 text-xs mt-0.5">{formatDateTime(event.timestamp)}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: dashboardApi.stats, refetchInterval: 5000 })
  const { data: perf } = useQuery({ queryKey: ['performance'], queryFn: () => dashboardApi.performance(30) })
  const { events } = useWebSocket()

  const pnlPositive = (stats?.total_pnl ?? 0) >= 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Real-time copy trading overview</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total P&L"
          value={formatCurrency(stats?.total_pnl ?? 0)}
          sub={`Today: ${formatCurrency(stats?.today_pnl ?? 0)}`}
          icon={pnlPositive ? TrendingUp : TrendingDown}
          color={pnlPositive ? 'bg-green-profit/10 text-green-profit' : 'bg-red-loss/10 text-red-loss'}
        />
        <KpiCard
          title="Win Rate"
          value={`${stats?.win_rate?.toFixed(1) ?? '0'}%`}
          sub={`${stats?.winning_trades ?? 0}W / ${stats?.losing_trades ?? 0}L`}
          icon={TrendingUp}
          color="bg-gold/10 text-gold"
        />
        <KpiCard
          title="Copies Today"
          value={String(stats?.trades_copied_today ?? 0)}
          sub={`Success: ${stats?.copy_success_rate?.toFixed(1) ?? '0'}%`}
          icon={Copy}
          color="bg-blue-500/10 text-blue-400"
        />
        <KpiCard
          title="Active Accounts"
          value={String(stats?.active_accounts ?? 0)}
          sub={`${stats?.master_accounts ?? 0} master · ${stats?.slave_accounts ?? 0} slave`}
          icon={Users}
          color="bg-purple-500/10 text-purple-400"
        />
      </div>

      {/* Latency badge */}
      {stats?.avg_copy_latency_ms !== undefined && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          Avg copy latency: <span className="text-gold font-mono">{stats.avg_copy_latency_ms.toFixed(0)}ms</span>
        </div>
      )}

      {/* Chart + Live Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Performance Chart */}
        <div className="xl:col-span-2 bg-dark-800 border border-dark-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Cumulative P&L (30 days)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={perf ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#252540" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => v.slice(5)} // MM-DD
              />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #252540', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(v: number) => [formatCurrency(v), 'P&L']}
              />
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="cumulative_pnl"
                stroke="#f0b429"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#f0b429' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Live Feed */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-white">Live Events</h2>
            <span className="flex items-center gap-1.5 text-xs text-green-profit">
              <span className="w-1.5 h-1.5 rounded-full bg-green-profit animate-pulse-slow" />
              Live
            </span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-64">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-sm">
                <AlertTriangle className="w-6 h-6 mb-2" />
                No events yet
              </div>
            ) : (
              events.map((event, i) => <EventRow key={i} event={event} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
