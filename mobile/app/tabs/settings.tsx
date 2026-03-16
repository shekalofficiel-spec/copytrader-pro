import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getSettings, updateSettings, testTelegram, setApiUrl, getApiUrl } from '../../lib/api'
import { useAppStore } from '../../store'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mx-4 mb-4">
      <Text className="text-gray-500 text-xs uppercase tracking-widest mb-2 px-1">{title}</Text>
      <View className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        {children}
      </View>
    </View>
  )
}

function Field({ label, value, onChange, secure, placeholder, keyboardType }: {
  label: string
  value: string
  onChange: (v: string) => void
  secure?: boolean
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'url'
}) {
  return (
    <View className="px-4 py-3 border-b border-dark-700">
      <Text className="text-gray-400 text-xs mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor="#4b5563"
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={{
          color: '#ffffff', fontSize: 14,
          backgroundColor: '#252540', borderRadius: 8,
          paddingHorizontal: 12, paddingVertical: 8,
        }}
      />
    </View>
  )
}

export default function SettingsScreen() {
  const { drawdownAlertThreshold, setDrawdownAlertThreshold } = useAppStore()
  const { data: serverSettings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const [apiUrl, setApiUrlState] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [pollInterval, setPollInterval] = useState('100')
  const [saved, setSaved] = useState(false)

  const updateMut = useMutation({ mutationFn: updateSettings })
  const testTelegramMut = useMutation({ mutationFn: testTelegram })

  const handleSaveBackendUrl = async () => {
    if (!apiUrl.trim()) return
    await setApiUrl(apiUrl.trim())
    Alert.alert('Saved', 'Backend URL updated. Restart the app to reconnect.')
  }

  const handleSaveServerSettings = async () => {
    const payload: Record<string, unknown> = {}
    if (telegramToken) payload.telegram_bot_token = telegramToken
    if (telegramChatId) payload.telegram_chat_id = telegramChatId
    if (pollInterval) payload.copy_poll_interval_ms = parseInt(pollInterval)

    await updateMut.mutateAsync(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestTelegram = async () => {
    try {
      const r = await testTelegramMut.mutateAsync()
      Alert.alert(r.success ? '✅ Success' : '❌ Failed', r.success ? 'Test message sent!' : r.error)
    } catch {
      Alert.alert('Error', 'Could not connect to backend')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-950">
      <View className="px-4 pt-4 pb-3">
        <Text className="text-white text-xl font-bold">Settings</Text>
        <Text className="text-gray-500 text-sm mt-1">Backend & notification config</Text>
      </View>

      <ScrollView>
        {/* Backend URL */}
        <Section title="Backend Connection">
          <Field
            label="API URL (your server)"
            value={apiUrl}
            onChange={setApiUrlState}
            placeholder="http://192.168.1.100:8000"
            keyboardType="url"
          />
          <View className="px-4 py-3">
            <TouchableOpacity onPress={handleSaveBackendUrl}
              style={{ backgroundColor: '#f0b429', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#0a0a0f', fontWeight: '700' }}>Save URL</Text>
            </TouchableOpacity>
          </View>
          {serverSettings && (
            <View className="px-4 pb-3">
              <Text className="text-green-profit text-xs">✅ Connected to server</Text>
              <Text className="text-gray-500 text-xs mt-0.5">
                Poll: {serverSettings.copy_poll_interval_ms}ms · Retries: {serverSettings.copy_retry_count}x
              </Text>
            </View>
          )}
        </Section>

        {/* Telegram */}
        <Section title="Telegram Notifications">
          <Field
            label="Bot Token"
            value={telegramToken}
            onChange={setTelegramToken}
            secure
            placeholder={serverSettings?.telegram_configured ? '(configured ✅)' : '1234567890:AAF...'}
          />
          <Field
            label="Chat ID"
            value={telegramChatId}
            onChange={setTelegramChatId}
            placeholder={serverSettings?.telegram_chat_id || '-1001234567890'}
          />
          <View className="px-4 py-3 flex-row gap-3">
            <TouchableOpacity onPress={handleTestTelegram}
              style={{ flex: 1, backgroundColor: '#252540', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>Test Telegram</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Engine settings */}
        <Section title="Copy Engine">
          <Field
            label="Poll Interval (ms)"
            value={pollInterval}
            onChange={setPollInterval}
            keyboardType="numeric"
            placeholder="100"
          />
          <View className="px-4 py-3">
            <Text className="text-gray-400 text-xs mb-1.5">Drawdown Alert Threshold (%)</Text>
            <Text style={{ color: '#f0b429', fontSize: 18, fontWeight: '700' }}>
              {drawdownAlertThreshold.toFixed(1)}%
            </Text>
            <View className="flex-row gap-3 mt-2">
              {[3, 5, 8, 10].map(v => (
                <TouchableOpacity key={v} onPress={() => setDrawdownAlertThreshold(v)}
                  style={{
                    flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6,
                    backgroundColor: drawdownAlertThreshold === v ? '#f0b42920' : '#252540',
                    borderWidth: 1,
                    borderColor: drawdownAlertThreshold === v ? '#f0b429' : '#374151',
                  }}>
                  <Text style={{ color: drawdownAlertThreshold === v ? '#f0b429' : '#9ca3af', fontWeight: '600', fontSize: 13 }}>
                    {v}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Section>

        {/* Save */}
        <View className="mx-4 mb-4">
          <TouchableOpacity onPress={handleSaveServerSettings}
            style={{
              backgroundColor: saved ? '#00d08420' : '#f0b429',
              borderWidth: saved ? 1 : 0,
              borderColor: saved ? '#00d084' : 'transparent',
              borderRadius: 12, paddingVertical: 14, alignItems: 'center',
            }}>
            <Text style={{ color: saved ? '#00d084' : '#0a0a0f', fontWeight: '800', fontSize: 15 }}>
              {saved ? '✅ Saved!' : 'Save Server Settings'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Section title="About">
          <View className="px-4 py-4">
            <Text className="text-white font-bold">CopyTrader Pro v1.0.0</Text>
            <Text className="text-gray-500 text-xs mt-1">Mobile companion for your copy trading system</Text>
            <Text className="text-gray-600 text-xs mt-1">MT4 · MT5 · cTrader · Binance</Text>
          </View>
        </Section>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
