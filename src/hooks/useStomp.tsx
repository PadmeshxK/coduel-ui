import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Client, type StompSubscription } from '@stomp/stompjs'
import { config } from '../lib/config'
import { useAuth } from './useAuth'

type Handler = (body: string) => void

interface Registration {
  destination: string
  handler: Handler
  sub?: StompSubscription // the live stomp subscription while connected; undefined when offline
}

interface StompApi {
  /**
   * Subscribe to a STOMP destination; returns an unsubscribe fn. Safe to call before the socket is
   * connected (it's applied on connect) and survives reconnects (re-applied automatically).
   */
  subscribe: (destination: string, handler: Handler) => () => void
  /** Fire-and-forget SEND to an /app destination (e.g. typing signals). No-op while disconnected. */
  publish: (destination: string, body: string) => void
  connected: boolean
}

const StompContext = createContext<StompApi>({
  subscribe: () => () => {},
  publish: () => {},
  connected: false,
})

/**
 * The app's single STOMP connection. One WebSocket per session carries every live destination —
 * notifications, run/submission results, match and room topics — as separate SUBSCRIBE frames, instead
 * of each feature opening its own socket. The connection is bound to auth (up while signed in, torn
 * down on logout). stomp.js does NOT restore subscriptions after a reconnect, so we keep a registry
 * and re-apply all of them on every (re)connect.
 */
export function StompProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const clientRef = useRef<Client | null>(null)
  const connectedRef = useRef(false)
  const regs = useRef(new Map<number, Registration>())
  const nextId = useRef(0)
  const [connected, setConnected] = useState(false)

  const subscribe = useCallback((destination: string, handler: Handler) => {
    const id = ++nextId.current
    const reg: Registration = { destination, handler }
    regs.current.set(id, reg)
    // Connected already → subscribe now; otherwise onConnect will apply it.
    if (connectedRef.current && clientRef.current) {
      reg.sub = clientRef.current.subscribe(destination, (frame) => handler(frame.body))
    }
    return () => {
      const r = regs.current.get(id)
      if (r?.sub) {
        try {
          r.sub.unsubscribe()
        } catch {
          // socket already gone — nothing to clean up
        }
      }
      regs.current.delete(id)
    }
  }, [])

  const publish = useCallback((destination: string, body: string) => {
    if (connectedRef.current && clientRef.current) {
      clientRef.current.publish({ destination, body })
    }
  }, [])

  useEffect(() => {
    // Only hold a socket while authenticated — the handshake needs the session cookie, and logout
    // (user → null) tears it down here.
    if (loading || !user) return

    const client = new Client({
      brokerURL: config.wsUrl,
      reconnectDelay: 3000,
      onConnect: () => {
        connectedRef.current = true
        setConnected(true)
        // Re-apply every active subscription (initial connect AND every reconnect).
        for (const reg of regs.current.values()) {
          reg.sub = client.subscribe(reg.destination, (frame) => reg.handler(frame.body))
        }
      },
      onWebSocketClose: () => {
        connectedRef.current = false
        setConnected(false)
        // Drop stale handles; they're recreated on the next onConnect.
        for (const reg of regs.current.values()) reg.sub = undefined
      },
    })
    clientRef.current = client
    client.activate()

    return () => {
      connectedRef.current = false
      setConnected(false)
      // Explicitly tear down each live subscription, then null its handle. Without the unsubscribe the
      // broker-side subs are only dropped by deactivate(); nulling the handle lets a still-mounted
      // consumer re-subscribe on the next connect (self-heal) while leaving no zombie behind after a
      // full logout→login cycle. (Unmounted consumers have already removed their own registration.)
      for (const reg of regs.current.values()) {
        if (reg.sub) {
          try {
            reg.sub.unsubscribe()
          } catch {
            // socket already gone — nothing to clean up
          }
        }
        reg.sub = undefined
      }
      void client.deactivate()
      clientRef.current = null
    }
  }, [user, loading])

  const value = useMemo(() => ({ subscribe, publish, connected }), [subscribe, publish, connected])
  return <StompContext.Provider value={value}>{children}</StompContext.Provider>
}

export function useStomp() {
  return useContext(StompContext)
}
