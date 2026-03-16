import { useEffect, useRef, useCallback, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { getApiUrl } from '../lib/api'
import type { LiveEvent } from '../lib/types'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function scheduleLocalNotification(event: LiveEvent) {
  if (event.severity === 'success' || event.severity === 'error') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: event.event_type.replace(/_/g, ' '),
        body: event.message,
        data: event,
        color: event.severity === 'success' ? '#00d084' : '#ff4d6d',
      },
      trigger: null, // immediate
    })
  }
}

export function useWebSocket(maxEvents = 50) {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoff = useRef(1000)

  const connect = useCallback(async () => {
    const apiUrl = await getApiUrl()
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws/live'

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      backoff.current = 1000
    }

    ws.onmessage = async (e) => {
      if (e.data === 'pong') return
      try {
        const event: LiveEvent = JSON.parse(e.data)
        setEvents(prev => [event, ...prev].slice(0, maxEvents))
        await scheduleLocalNotification(event)
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      reconnectTimer.current = setTimeout(() => {
        backoff.current = Math.min(backoff.current * 2, 30000)
        connect()
      }, backoff.current)
    }

    ws.onerror = () => ws.close()
  }, [maxEvents])

  useEffect(() => {
    // Request notification permissions
    Notifications.requestPermissionsAsync()
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { events, isConnected, clearEvents: () => setEvents([]) }
}
