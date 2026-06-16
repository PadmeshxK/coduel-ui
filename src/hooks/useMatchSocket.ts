import { useEffect, useRef, useState } from 'react'
import { Client } from '@stomp/stompjs'
import { config } from '../lib/config'
import type { MatchEventData } from '../types'

/**
 * Connects a STOMP client over the native WebSocket and subscribes to /topic/match/{matchId}.
 * The session cookie rides the handshake (same-site), so the backend authenticates and the
 * MatchSubscriptionInterceptor authorizes the subscription. The publisher sends a JSON string,
 * so we parse the frame body. Returns the live connection status.
 */
export function useMatchSocket(
  matchId: string | undefined,
  onEvent: (event: MatchEventData) => void,
) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!matchId) return

    const client = new Client({
      brokerURL: config.wsUrl,
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true)
        client.subscribe(`/topic/match/${matchId}`, (frame) => {
          try {
            onEventRef.current(JSON.parse(frame.body) as MatchEventData)
          } catch {
            // ignore malformed frames
          }
        })
      },
      onWebSocketClose: () => setConnected(false),
    })

    client.activate()
    return () => {
      void client.deactivate()
    }
  }, [matchId])

  return { connected }
}
