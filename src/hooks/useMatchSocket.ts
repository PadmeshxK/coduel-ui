import { useEffect, useRef } from 'react'
import { useStomp } from './useStomp'
import type { MatchEventData } from '../types'

/**
 * Subscribes to /topic/match/{matchId} on the app's shared STOMP connection (see useStomp). The
 * session cookie authenticated the socket at the handshake, and the MatchSubscriptionInterceptor
 * authorizes this topic subscription. The publisher sends a JSON string, so we parse the frame body.
 * Returns the shared connection's live status.
 */
export function useMatchSocket(
  matchId: string | undefined,
  onEvent: (event: MatchEventData) => void,
) {
  const { subscribe, connected } = useStomp()
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!matchId) return
    return subscribe(`/topic/match/${matchId}`, (body) => {
      try {
        onEventRef.current(JSON.parse(body) as MatchEventData)
      } catch {
        // ignore malformed frames
      }
    })
  }, [matchId, subscribe])

  return { connected }
}
