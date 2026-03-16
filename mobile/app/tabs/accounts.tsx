import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getAccounts, toggleAccount } from '../../lib/api'
import { formatCurrency, getBrokerBadgeColor } from '../../lib/utils'
import type { Account } from '../../lib/types'

function AccountCard({ account, onToggle }: { account: Account; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const brokerColors = getBrokerBadgeColor(account.broker_type)

  return (
    <View className="mx-4 mb-3 bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
        <View className="p-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-row items-center flex-1">
              {/* Connection dot */}
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: account.is_connected ? '#00d084' : '#ff4d6d',
                marginRight: 10, marginTop: 3,
              }} />
              <View className="flex-1">
                <Text className="text-white font-bold text-base">{account.name}</Text>
                <View className="flex-row items-center mt-1.5 gap-2">
                  <View style={{ backgroundColor: brokerColors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: brokerColors.text, fontSize: 11, fontWeight: '700' }}>{account.broker_type}</Text>
                  </View>
                  <View style={{
                    backgroundColor: account.role === 'MASTER' ? '#f0b42920' : '#60a5fa20',
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
                  }}>
                    <Text style={{ color: account.role === 'MASTER' ? '#f0b429' : '#60a5fa', fontSize: 11, fontWeight: '700' }}>
                      {account.role}
                    </Text>
                  </View>
                  {account.is_copy_paused && (
                    <View style={{ backgroundColor: '#fbbf2420', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700' }}>PAUSED</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            {/* Toggle switch */}
            <TouchableOpacity onPress={onToggle}
              style={{
                backgroundColor: account.is_active ? '#00d08420' : '#374151',
                borderWidth: 1, borderColor: account.is_active ? '#00d084' : '#4b5563',
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              }}
            >
              <Text style={{ color: account.is_active ? '#00d084' : '#9ca3af', fontSize: 12, fontWeight: '700' }}>
                {account.is_active ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View className="flex-row mt-3 pt-3 border-t border-dark-700">
            <View className="flex-1 items-center">
              <Text className="text-gray-500 text-xs">Balance</Text>
              <Text className="text-white text-sm font-mono mt-0.5">
                {account.balance != null ? formatCurrency(account.balance) : '—'}
              </Text>
            </View>
            <View className="flex-1 items-center border-x border-dark-700">
              <Text className="text-gray-500 text-xs">Drawdown</Text>
              <Text style={{ color: account.current_drawdown > 3 ? '#ff4d6d' : '#ffffff', fontSize: 13, fontFamily: 'monospace', marginTop: 2 }}>
                {account.current_drawdown.toFixed(2)}%
              </Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-gray-500 text-xs">Open</Text>
              <Text className="text-white text-sm font-mono mt-0.5">{account.open_trades_count}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded details */}
      {expanded && (
        <View className="px-4 pb-4 border-t border-dark-700">
          <View className="flex-row flex-wrap mt-3 gap-y-2">
            {[
              ['Lot Mode', account.lot_mode],
              ['Ratio', `${account.lot_ratio}x`],
              ['Max DD', `${account.max_drawdown_pct}%`],
              ['Max Trades', String(account.max_trades)],
            ].map(([label, val]) => (
              <View key={label} className="w-1/2">
                <Text className="text-gray-500 text-xs">{label}</Text>
                <Text className="text-white text-sm font-mono">{val}</Text>
              </View>
            ))}
            {account.allowed_instruments.length > 0 && (
              <View className="w-full mt-1">
                <Text className="text-gray-500 text-xs">Instruments</Text>
                <Text className="text-white text-sm font-mono">{account.allowed_instruments.join(', ')}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

export default function AccountsScreen() {
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data: accounts = [], refetch } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
    refetchInterval: 15000,
  })

  const toggleMut = useMutation({
    mutationFn: toggleAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const masters = accounts.filter(a => a.role === 'MASTER')
  const slaves = accounts.filter(a => a.role === 'SLAVE')

  return (
    <SafeAreaView className="flex-1 bg-dark-950">
      <View className="px-4 pt-4 pb-3">
        <Text className="text-white text-xl font-bold">Accounts</Text>
        <Text className="text-gray-500 text-sm mt-1">{masters.length} master · {slaves.length} slave</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f0b429" />}
      >
        {masters.length > 0 && (
          <>
            <Text className="text-gold text-xs font-bold uppercase tracking-widest px-4 mb-2">Master Accounts</Text>
            {masters.map(a => (
              <AccountCard key={a.id} account={a} onToggle={() => toggleMut.mutate(a.id)} />
            ))}
          </>
        )}

        {slaves.length > 0 && (
          <>
            <Text className="text-blue-400 text-xs font-bold uppercase tracking-widest px-4 mb-2 mt-2">Slave Accounts</Text>
            {slaves.map(a => (
              <AccountCard key={a.id} account={a} onToggle={() => toggleMut.mutate(a.id)} />
            ))}
          </>
        )}

        {accounts.length === 0 && (
          <View className="items-center py-20">
            <Text className="text-gray-600 text-4xl mb-4">👥</Text>
            <Text className="text-gray-500">No accounts configured</Text>
            <Text className="text-gray-600 text-sm mt-1">Add accounts via the web dashboard</Text>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
