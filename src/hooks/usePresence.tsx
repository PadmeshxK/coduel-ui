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
  const { subscribe } = useStomp()
  const [online, setOnline] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (loading || !user) {
      setOnline(new Set())
      return
    }
    let active = true
    presenceApi
      .onlineFriends()
      .then((ids) => {
        if (active) setOnline(new Set(ids))
      })
      .catch(() => {})

    const unsubscribe = subscribe('/user/queue/presence', (body) => {
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
    return () => {
      active = false
      unsubscribe()
    }
  }, [user, loading, subscribe])

  const isOnline = useCallback((userId: number) => online.has(userId), [online])
  const value = useMemo(() => ({ isOnline }), [isOnline])
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  return useContext(PresenceContext)
}
