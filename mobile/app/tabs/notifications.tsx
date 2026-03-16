import { View, Text, ScrollView, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useAppStore } from '../../store'
import { formatDateTime, getSeverityColor } from '../../lib/utils'
import type { LiveEvent } from '../../lib/types'

function EventItem({ event }: { event: LiveEvent }) {
  const color = getSeverityColor(event.severity)
  const icons: Record<string, string> = {
    COPY_SUCCESS: '✅', COPY_FAILED: '❌', TRADE_OPENED: '📈',
    TRADE_CLOSED: '📉', KILL_SWITCH: '🛑', RISK_ALERT: '⚠️', COPY_SKIPPED: '⏭️',
  }
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: color, marginBottom: 1 }}
      className="bg-dark-800 px-4 py-3">
      <View className="flex-row items-start">
        <Text style={{ fontSize: 14, marginRight: 8 }}>{icons[event.event_type] || '•'}</Text>
        <View className="flex-1">
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '500' }}>{event.message}</Text>
          <View className="flex-row items-center mt-1">
            <Text style={{ color: color, fontSize: 10, fontWeight: '700', marginRight: 8 }}>
              {event.event_type.replace(/_/g, ' ')}
            </Text>
            <Text className="text-gray-600 text-xs">{formatDateTime(event.timestamp)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function ToggleRow({ label, sub, value, onChange }: {
  label: string; sub: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <View className="flex-row items-center px-4 py-3.5 border-b border-dark-700">
      <View className="flex-1">
        <Text className="text-white text-sm font-medium">{label}</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#374151', true: '#f0b42960' }}
        thumbColor={value ? '#f0b429' : '#9ca3af'}
      />
    </View>
  )
}

export default function NotificationsScreen() {
  const { events } = useWebSocket()
  const {
    notifyCopySuccess, notifyCopyFailed, notifyDrawdown,
    setNotifyPref,
  } = useAppStore()

  return (
    <SafeAreaView className="flex-1 bg-dark-950">
      <View className="px-4 pt-4 pb-3">
        <Text className="text-white text-xl font-bold">Alerts</Text>
        <Text className="text-gray-500 text-sm mt-1">{events.length} live events</Text>
      </View>

      <ScrollView>
        {/* Push notification preferences */}
        <Text className="text-gray-500 text-xs uppercase tracking-widest px-4 mb-2">Push Notifications</Text>
        <View className="mx-4 bg-dark-800 rounded-xl border border-dark-700 overflow-hidden mb-4">
          <ToggleRow
            label="Copy Success"
            sub="Notify when a trade is successfully copied"
            value={notifyCopySuccess}
            onChange={v => setNotifyPref('notifyCopySuccess', v)}
          />
          <ToggleRow
            label="Copy Failed"
            sub="Notify when a copy attempt fails"
            value={notifyCopyFailed}
            onChange={v => setNotifyPref('notifyCopyFailed', v)}
          />
          <ToggleRow
            label="Drawdown Alert"
            sub="Notify when drawdown limit is approached"
            value={notifyDrawdown}
            onChange={v => setNotifyPref('notifyDrawdown', v)}
          />
        </View>

        {/* Live event history */}
        <Text className="text-gray-500 text-xs uppercase tracking-widest px-4 mb-2">Recent Events</Text>
        {events.length === 0 ? (
          <View className="items-center py-12">
            <Text className="text-gray-600 text-4xl mb-3">🔔</Text>
            <Text className="text-gray-500">No events yet</Text>
          </View>
        ) : (
          <View className="mx-4 rounded-xl overflow-hidden border border-dark-700">
            {events.map((e, i) => <EventItem key={i} event={e} />)}
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
