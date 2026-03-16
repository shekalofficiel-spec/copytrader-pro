import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getStats, getActiveTrades, killSwitch } from '../../lib/api'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useAppStore } from '../../store'
import { formatCurrency, formatDateTime, getSeverityColor, getPnlColor } from '../../lib/utils'
import type { LiveEvent } from '../../lib/types'

function KpiCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <View className="flex-1 bg-dark-800 rounded-xl p-4 mr-2 last:mr-0 border border-dark-700">
      <Text className="text-gray-400 text-xs mb-2">{label}</Text>
      <Text style={{ color: valueColor || '#ffffff', fontSize: 20, fontWeight: '700' }}>{value}</Text>
      {sub && <Text className="text-gray-500 text-xs mt-1">{sub}</Text>}
    </View>
  )
}

function EventItem({ event }: { event: LiveEvent }) {
  const icons: Record<string, string> = {
    COPY_SUCCESS: '✅', COPY_FAILED: '❌', TRADE_OPENED: '📈',
    TRADE_CLOSED: '📉', KILL_SWITCH: '🛑', RISK_ALERT: '⚠️', COPY_SKIPPED: '⏭️',
  }
  return (
    <View className="flex-row items-start px-4 py-3 border-b border-dark-700">
      <Text style={{ fontSize: 16, marginRight: 10, marginTop: 1 }}>{icons[event.event_type] || '•'}</Text>
      <View className="flex-1">
        <Text className="text-white text-sm" numberOfLines={2}>{event.message}</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{formatDateTime(event.timestamp)}</Text>
      </View>
    </View>
  )
}

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const [killConfirm, setKillConfirm] = useState(false)
  const [killing, setKilling] = useState(false)
  const { setKillSwitchPending } = useAppStore()
  const { events, isConnected } = useWebSocket()

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    refetchInterval: 5000,
  })

  const { data: activeTrades = [] } = useQuery({
    queryKey: ['trades', 'active'],
    queryFn: getActiveTrades,
    refetchInterval: 3000,
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetchStats()
    setRefreshing(false)
  }, [refetchStats])

  const handleKillSwitch = async () => {
    if (!killConfirm) {
      setKillConfirm(true)
      setTimeout(() => setKillConfirm(false), 3000)
      return
    }
    setKilling(true)
    setKillSwitchPending(true)
    let attempts = 0
    while (attempts < 3) {
      try {
        const result = await killSwitch()
        Alert.alert('Kill Switch', `Closed positions on ${result.accounts_affected} accounts.`)
        break
      } catch {
        attempts++
        if (attempts === 3) Alert.alert('Error', 'Kill switch failed after 3 attempts')
        await new Promise(r => setTimeout(r, 500))
      }
    }
    setKilling(false)
    setKillSwitchPending(false)
    setKillConfirm(false)
  }

  const pnlColor = getPnlColor(stats?.total_pnl ?? 0)
  const todayColor = getPnlColor(stats?.today_pnl ?? 0)

  return (
    <SafeAreaView className="flex-1 bg-dark-950">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f0b429" />}
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
          <View>
            <Text className="text-white text-xl font-bold">CopyTrader Pro</Text>
            <View className="flex-row items-center mt-1">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isConnected ? '#00d084' : '#ff4d6d', marginRight: 6 }} />
              <Text style={{ color: isConnected ? '#00d084' : '#ff4d6d', fontSize: 11 }}>
                {isConnected ? 'Live' : 'Reconnecting...'}
              </Text>
            </View>
          </View>
          <Text className="text-gray-500 text-xs">{activeTrades.length} open</Text>
        </View>

        {/* KPI Row 1 */}
        <View className="px-4 flex-row mb-3">
          <KpiCard label="Total P&L" value={formatCurrency(stats?.total_pnl ?? 0)} sub={`Today: ${formatCurrency(stats?.today_pnl ?? 0)}`} valueColor={pnlColor} />
          <KpiCard label="Win Rate" value={`${stats?.win_rate?.toFixed(1) ?? '0'}%`} sub={`${stats?.winning_trades ?? 0}W / ${stats?.losing_trades ?? 0}L`} valueColor="#f0b429" />
        </View>
        <View className="px-4 flex-row mb-4">
          <KpiCard label="Copies Today" value={String(stats?.trades_copied_today ?? 0)} sub={`Success: ${stats?.copy_success_rate?.toFixed(1) ?? '0'}%`} valueColor="#60a5fa" />
          <KpiCard label="Active Accounts" value={String(stats?.active_accounts ?? 0)} sub={`${stats?.master_accounts ?? 0}M / ${stats?.slave_accounts ?? 0}S`} valueColor="#c084fc" />
        </View>

        {/* Active Trades */}
        {activeTrades.length > 0 && (
          <View className="mx-4 mb-4 bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            <View className="px-4 py-3 border-b border-dark-700 flex-row items-center">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#00d084', marginRight: 8 }} />
              <Text className="text-white text-sm font-semibold">Open Positions ({activeTrades.length})</Text>
            </View>
            {activeTrades.slice(0, 5).map(t => (
              <View key={t.id} className="flex-row items-center px-4 py-3 border-b border-dark-700">
                <Text className="text-white font-bold text-sm w-20">{t.symbol}</Text>
                <View style={{ backgroundColor: t.direction === 'BUY' ? '#00d08420' : '#ff4d6d20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 12 }}>
                  <Text style={{ color: t.direction === 'BUY' ? '#00d084' : '#ff4d6d', fontSize: 11, fontWeight: '700' }}>{t.direction}</Text>
                </View>
                <Text className="text-gray-400 text-xs flex-1">{t.lot_size} lot</Text>
                <Text style={{ color: getPnlColor(t.profit), fontWeight: '700', fontSize: 13 }}>{formatCurrency(t.profit)}</Text>
              </View>
            ))}
            {activeTrades.length > 5 && (
              <Text className="text-gray-500 text-xs text-center py-2">+{activeTrades.length - 5} more</Text>
            )}
          </View>
        )}

        {/* Live Events Feed */}
        <View className="mx-4 mb-4 bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
          <View className="px-4 py-3 border-b border-dark-700">
            <Text className="text-white text-sm font-semibold">Live Events</Text>
          </View>
          {events.length === 0 ? (
            <Text className="text-gray-600 text-sm p-4 text-center">No events yet...</Text>
          ) : (
            events.slice(0, 10).map((e, i) => <EventItem key={i} event={e} />)
          )}
        </View>

        {/* Spacer for kill switch */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Kill Switch — always visible at bottom */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-3" style={{ backgroundColor: '#0a0a0f' }}>
        <TouchableOpacity
          onPress={handleKillSwitch}
          disabled={killing}
          style={{
            backgroundColor: killConfirm ? '#ff4d6d' : '#ff4d6d20',
            borderWidth: 1,
            borderColor: '#ff4d6d',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ff4d6d', fontWeight: '800', fontSize: 15 }}>
            {killing ? '⏳ Closing all positions...' : killConfirm ? '⚠️ TAP AGAIN TO CONFIRM' : '🛑 KILL SWITCH — Close All'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
