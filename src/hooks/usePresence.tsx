import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { presenceApi } from '../lib/api'
import { useAuth } from './useAuth'
import { useStomp } from './useStomp'
import type { PresenceData } from '../types'

interface PresenceState {
  /** True if that user (a friend) currently holds a live WebSocket session. */
  isOnline: (userId: number) => boolean
}

const PresenceContext = createContext<PresenceState>({ isOnline: () => false })

/**
 * Live friend presence. Seeds the online set from GET /presence/friends on connect, then keeps it in
 * sync from /user/queue/presence (the backend pushes each friend's online↔offline transition). Stored
 * as a fresh Set per update so consumers (chat header, conversation list, friends list) re-render.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { subscribe, connected } = useStomp()
  const [online, setOnline] = useState<Set<number>>(new Set())

  // Live transitions: subscribe once (the Stomp client re-applies it across reconnects).
  useEffect(() => {
    if (loading || !user) {
      setOnline(new Set())
      return
    }
    return subscribe('/user/queue/presence', (body) => {
      try {
        const p = JSON.parse(body) as PresenceData
        setOnline((prev) => {
          const next = new Set(prev)
          if (p.online) next.add(p.userId)
          else next.delete(p.userId)
          return next
        })
      } catch {
        // ignore malformed frames
      }
    })
  }, [user, loading, subscribe])

  // Seed / re-seed the authoritative online set on every (re)connect — NOT once at mount. The broker
  // has no replay, so a friend's "online" broadcast fired while we were mid-connect is missed live; and
  // on a simultaneous login the old one-shot mount seed ran before either side had registered its
  // session, leaving BOTH stuck "offline". Re-pulling once the socket is up (our subscription is already
  // live by then, applied in onConnect) recovers both cases and self-heals after any drop.
  useEffect(() => {
    if (loading || !user || !connected) return
    let active = true
    presenceApi
      .onlineFriends()
      .then((ids) => active && setOnline(new Set(ids)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user, loading, connected])

  const isOnline = useCallback((userId: number) => online.has(userId), [online])
  const value = useMemo(() => ({ isOnline }), [isOnline])
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  return useContext(PresenceContext)
}
