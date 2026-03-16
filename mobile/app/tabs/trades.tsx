import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getActiveTrades, getTrades } from '../../lib/api'
import { formatCurrency, formatDateTime, getPnlColor } from '../../lib/utils'
import type { Trade } from '../../lib/types'

type Tab = 'active' | 'history'

function TradeRow({ trade }: { trade: Trade }) {
  const pnlColor = getPnlColor(trade.profit)
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-dark-700">
      <View className="flex-1">
        <View className="flex-row items-center gap-2 mb-1">
          <Text className="text-white font-bold text-sm">{trade.symbol}</Text>
          <View style={{
            backgroundColor: trade.direction === 'BUY' ? '#00d08420' : '#ff4d6d20',
            paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
          }}>
            <Text style={{ color: trade.direction === 'BUY' ? '#00d084' : '#ff4d6d', fontSize: 10, fontWeight: '700' }}>
              {trade.direction}
            </Text>
          </View>
          <Text className="text-gray-500 text-xs">{trade.lot_size} lot</Text>
        </View>
        <Text className="text-gray-500 text-xs">{formatDateTime(trade.open_time)}</Text>
        {trade.copy_latency_ms != null && (
          <Text className="text-gray-600 text-xs">{trade.copy_latency_ms}ms copy</Text>
        )}
      </View>
      <View className="items-end">
        <Text style={{ color: pnlColor, fontWeight: '700', fontSize: 15 }}>{formatCurrency(trade.profit)}</Text>
        <Text className="text-gray-600 text-xs mt-0.5">{trade.open_price.toFixed(5)}</Text>
      </View>
    </View>
  )
}

export default function TradesScreen() {
  const [tab, setTab] = useState<Tab>('active')
  const [refreshing, setRefreshing] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data: activeTrades = [], refetch: refetchActive } = useQuery({
    queryKey: ['trades', 'active'],
    queryFn: getActiveTrades,
    refetchInterval: 3000,
  })

  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['trades', 'history', page, symbolFilter],
    queryFn: () => getTrades({
      page,
      page_size: 30,
      status: 'CLOSED',
      symbol: symbolFilter || undefined,
    }),
    enabled: tab === 'history',
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    if (tab === 'active') await refetchActive()
    else await refetchHistory()
    setRefreshing(false)
  }, [tab, refetchActive, refetchHistory])

  const historyTrades: Trade[] = historyData?.trades ?? []
  const total = historyData?.total ?? 0

  // Total open P&L
  const openPnl = activeTrades.reduce((sum, t) => sum + t.profit, 0)

  return (
    <SafeAreaView className="flex-1 bg-dark-950">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-white text-xl font-bold">Trades</Text>
        {tab === 'active' && activeTrades.length > 0 && (
          <Text style={{ color: getPnlColor(openPnl), fontSize: 13, marginTop: 2 }}>
            Open P&L: {formatCurrency(openPnl)}
          </Text>
        )}
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 mb-3">
        {(['active', 'history'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: tab === t ? '#f0b429' : 'transparent',
            }}
          >
            <Text style={{ color: tab === t ? '#f0b429' : '#6b7280', fontWeight: '600', textTransform: 'capitalize' }}>
              {t === 'active' ? `Active (${activeTrades.length})` : `History (${total})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Symbol filter for history */}
      {tab === 'history' && (
        <View className="px-4 mb-3">
          <TextInput
            value={symbolFilter}
            onChangeText={v => { setSymbolFilter(v.toUpperCase()); setPage(1) }}
            placeholder="Filter by symbol..."
            placeholderTextColor="#4b5563"
            style={{
              backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#252540',
              borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
              color: '#ffffff', fontSize: 13,
            }}
          />
        </View>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f0b429" />}
      >
        <View className="bg-dark-800 mx-4 rounded-xl border border-dark-700 overflow-hidden">
          {tab === 'active' ? (
            activeTrades.length === 0 ? (
              <Text className="text-gray-600 text-center py-10">No open positions</Text>
            ) : (
              activeTrades.map(t => <TradeRow key={t.id} trade={t} />)
            )
          ) : (
            <>
              {historyTrades.length === 0 ? (
                <Text className="text-gray-600 text-center py-10">No trade history</Text>
              ) : (
                historyTrades.map(t => <TradeRow key={t.id} trade={t} />)
              )}
              {/* Pagination */}
              {total > 30 && (
                <View className="flex-row items-center justify-center gap-4 py-3 border-t border-dark-700">
                  <TouchableOpacity onPress={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <Text style={{ color: page === 1 ? '#374151' : '#f0b429', fontSize: 20 }}>‹</Text>
                  </TouchableOpacity>
                  <Text className="text-gray-400 text-sm">{page} / {Math.ceil(total / 30)}</Text>
                  <TouchableOpacity onPress={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)}>
                    <Text style={{ color: page >= Math.ceil(total / 30) ? '#374151' : '#f0b429', fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
