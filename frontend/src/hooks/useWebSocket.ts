import { useEffect, useRef, useCallback, useState } from 'react'
import type { LiveEvent } from '../types'

interface UseWebSocketOptions {
  maxEvents?: number
  onEvent?: (event: LiveEvent) => void
}

export function useWebSocket({ maxEvents = 100, onEvent }: UseWebSocketOptions = {}) {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/live`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      reconnectDelay.current = 1000 // Reset backoff
      // Keep-alive ping every 30s
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping')
        }
      }, 30000)
      ws.onclose = () => {
        clearInterval(pingInterval)
        setIsConnected(false)
        // Reconnect with exponential backoff
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
          connect()
        }, reconnectDelay.current)
      }
    }

    ws.onmessage = (e) => {
      if (e.data === 'pong') return
      try {
        const event: LiveEvent = JSON.parse(e.data)
        setEvents(prev => [event, ...prev].slice(0, maxEvents))
        onEvent?.(event)
      } catch {
        // ignore malformed
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [maxEvents, onEvent])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, isConnected, clearEvents }
}
