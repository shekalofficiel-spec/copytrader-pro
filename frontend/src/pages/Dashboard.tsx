import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, Users, Copy, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { dashboardApi, engineApi } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { formatCurrency, formatDateTime, cn } from '../lib/utils'
import type { LiveEvent } from '../types'

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, trend, accent }: {
  title: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | null
  accent?: boolean
}) {
  return (
    <div className={cn(
      'rounded-2xl p-5 border transition-all duration-200 hover:border-[#333]',
      accent
        ? 'bg-[#c8f135]/8 border-[#c8f135]/20'
        : 'bg-[#1a1a1a] border-[#242424]'
    )}>
      <p className="text-[#666] text-xs font-medium uppercase tracking-wider mb-3">{title}</p>
      <div className="flex items-end justify-between">
        <div>
          <p className={cn(
            'text-3xl font-bold leading-none mb-1',
            accent ? 'text-[#c8f135]' : 'text-white'
          )}>{value}</p>
          {sub && (
            <p className="text-xs text-[#555] mt-1.5">{sub}</p>
          )}
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg',
            trend === 'up' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'
          )}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Live Event Row ────────────────────────────────────────────────────────
function EventRow({ event }: { event: LiveEvent }) {
  const typeColors: Record<string, string> = {
    COPY_SUCCESS: 'text-[#4ade80]',
    COPY_FAILED: 'text-[#f87171]',
    COPY_SKIPPED: 'text-[#8a8a8a]',
    TRADE_OPENED: 'text-[#c8f135]',
    TRADE_CLOSED: 'text-[#8a8a8a]',
    KILL_SWITCH: 'text-[#f87171]',
    RISK_ALERT: 'text-[#f97316]',
  }
  const dots: Record<string, string> = {
    COPY_SUCCESS: 'bg-[#4ade80]',
    COPY_FAILED: 'bg-[#f87171]',
    TRADE_OPENED: 'bg-[#c8f135]',
    RISK_ALERT: 'bg-[#f97316]',
  }
  const dotColor = dots[event.event_type] || 'bg-[#555]'
  const textColor = typeColors[event.event_type] || 'text-[#8a8a8a]'

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors animate-fade-in">
      <div className="mt-1.5 shrink-0">
        <span className={cn('w-2 h-2 rounded-full block', dotColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', textColor)}>{event.message}</p>
        <p className="text-[#444] text-xs mt-0.5">{formatDateTime(event.timestamp)}</p>
      </div>
    </div>
  )
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[#666] text-xs mb-1">{label}</p>
      <p className="text-[#c8f135] font-bold text-sm">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  const qc = useQueryClient()
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: dashboardApi.stats,
    refetchInterval: 5000,
  })
  const { data: perf } = useQuery({
    queryKey: ['performance'],
    queryFn: () => dashboardApi.performance(30),
  })
  const { data: engineStatus } = useQuery({
    queryKey: ['engine-status'],
    queryFn: engineApi.status,
    refetchInterval: 10000,
  })
  const toggleEngine = useMutation({
    mutationFn: engineApi.toggle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engine-status'] }),
  })
  const { events } = useWebSocket()

  const pnlPositive = (stats?.total_pnl ?? 0) >= 0
  const chartData = perf?.map(p => ({ date: p.date.slice(5), pnl: p.cumulative_pnl })) ?? []
  const engineActive = engineStatus?.active ?? true

  return (
    <div className="min-h-full bg-[#0f0f0f] p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-[#555] text-sm mt-0.5">Real-time copy trading overview</p>
        </div>
        <button
          onClick={() => toggleEngine.mutate()}
          disabled={toggleEngine.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl px-3 py-2 border transition-all text-xs font-medium',
            engineActive
              ? 'bg-[#c8f135]/10 border-[#c8f135]/30 text-[#c8f135] hover:bg-[#c8f135]/15'
              : 'bg-[#f87171]/10 border-[#f87171]/30 text-[#f87171] hover:bg-[#f87171]/15'
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          {engineActive ? 'Copy Engine Active' : 'Copy Engine Stopped'}
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          title="Total P&L"
          value={formatCurrency(stats?.total_pnl ?? 0)}
          sub={`Today ${formatCurrency(stats?.today_pnl ?? 0)}`}
          trend={pnlPositive ? 'up' : 'down'}
          accent={true}
        />
        <KpiCard
          title="Win Rate"
          value={`${stats?.win_rate?.toFixed(1) ?? '0.0'}%`}
          sub={`${stats?.winning_trades ?? 0}W / ${stats?.losing_trades ?? 0}L`}
          trend={(stats?.win_rate ?? 0) >= 50 ? 'up' : 'down'}
        />
        <KpiCard
          title="Copy Success"
          value={`${stats?.copy_success_rate?.toFixed(1) ?? '0.0'}%`}
          sub={`${stats?.avg_copy_latency_ms?.toFixed(0) ?? 0}ms avg latency`}
          trend={(stats?.copy_success_rate ?? 0) >= 90 ? 'up' : null}
        />
        <KpiCard
          title="Active Accounts"
          value={String(stats?.active_accounts ?? 0)}
          sub={`${stats?.master_accounts ?? 0} Master · ${stats?.slave_accounts ?? 0} Slave`}
        />
      </div>

      {/* Chart + Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Performance Chart */}
        <div className="xl:col-span-2 bg-[#1a1a1a] border border-[#242424] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-semibold text-sm">Performance</h3>
              <p className="text-[#555] text-xs mt-0.5">30-day cumulative P&L</p>
            </div>
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl',
              pnlPositive ? 'bg-[#c8f135]/10 text-[#c8f135]' : 'bg-[#f87171]/10 text-[#f87171]'
            )}>
              {pnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {formatCurrency(stats?.total_pnl ?? 0)}
            </div>
          </div>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c8f135" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#c8f135" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#444', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="pnl"
                  stroke="#c8f135"
                  strokeWidth={2}
                  fill="url(#pnlGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#c8f135', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-[#333] text-sm">No performance data yet</p>
            </div>
          )}
        </div>

        {/* Stats panel */}
        <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-5">Overview</h3>
          <div className="space-y-4">
            {[
              { label: 'Total Trades', value: String(stats?.total_trades ?? 0), icon: Copy },
              { label: 'Accounts', value: String(stats?.active_accounts ?? 0), icon: Users },
              { label: 'Copied Today', value: String(stats?.trades_copied_today ?? 0), icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-[#222] last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-[#242424] rounded-lg flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-[#c8f135]" />
                  </div>
                  <span className="text-[#8a8a8a] text-sm">{label}</span>
                </div>
                <span className="text-white font-bold text-sm">{value}</span>
              </div>
            ))}
          </div>

          {/* Copy success rate bar */}
          <div className="mt-5 pt-4 border-t border-[#222]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[#8a8a8a] text-xs">Copy Success Rate</span>
              <span className="text-[#c8f135] font-bold text-sm">{stats?.copy_success_rate?.toFixed(1) ?? 0}%</span>
            </div>
            <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#c8f135] rounded-full transition-all duration-700"
                style={{ width: `${Math.min(stats?.copy_success_rate ?? 0, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Feed */}
      <div className="bg-[#1a1a1a] border border-[#242424] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#c8f135] rounded-full animate-pulse" />
            <h3 className="text-white font-semibold text-sm">Live Feed</h3>
          </div>
          <span className="text-[#444] text-xs">{events.length} events</span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <div className="px-5 py-8 text-center text-[#333] text-sm">
              Waiting for events...
            </div>
          ) : (
            events.slice(0, 20).map((event, i) => (
              <EventRow key={i} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
