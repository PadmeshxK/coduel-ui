import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { Client } from '@stomp/stompjs'
import { config } from '../lib/config'
import { useAuth } from './useAuth'
import { notificationApi } from '../lib/api'
import type { NotificationData } from '../types'

// Stable identity per notification — invites key on matchId, friend requests on requestId.
export function notificationKey(n: NotificationData): string {
  return n.type === 'ROOM_INVITE' ? `room:${n.roomId}` : `friend:${n.requestId}`
}

const MAX_NOTIFICATIONS = 20

const sortCap = (list: NotificationData[]): NotificationData[] =>
  [...list]
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
    .slice(0, MAX_NOTIFICATIONS)

interface NotificationsState {
  notifications: NotificationData[]
  dismiss: (n: NotificationData) => void
  // Bumped whenever a friend relationship changes (from the bell or the Friends page) — the Friends
  // page watches it to re-sync. Call notifyFriendsChanged() after any friend mutation.
  friendsVersion: number
  notifyFriendsChanged: () => void
}

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  dismiss: () => {},
  friendsVersion: 0,
  notifyFriendsChanged: () => {},
})

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [friendsVersion, setFriendsVersion] = useState(0)
  const clientRef = useRef<Client | null>(null)

  // Authoritative reload — GET /notification is the full pending set (invites in Redis, requests in
  // DB), so a replace correctly drops anything that's no longer pending (e.g. an accepted request).
  const refresh = useCallback(() => {
    notificationApi
      .getPending()
      .then((list) => setNotifications(sortCap(list)))
      .catch(() => {})
  }, [])

  const dismiss = useCallback((n: NotificationData) => {
    const key = notificationKey(n)
    setNotifications((prev) => prev.filter((x) => notificationKey(x) !== key))
  }, [])

  // Keep both friend surfaces in sync: refetch the bell + signal the Friends page to reload.
  const notifyFriendsChanged = useCallback(() => {
    setFriendsVersion((v) => v + 1)
    refresh()
  }, [refresh])

  // A single live notification — dedupe by key, most-recent-first, capped.
  const append = useCallback((incoming: NotificationData) => {
    const normalized = { ...incoming, createdAtMs: incoming.createdAtMs ?? Date.now() }
    setNotifications((prev) => {
      const byKey = new Map<string, NotificationData>()
      for (const n of [...prev, normalized]) byKey.set(notificationKey(n), n)
      return sortCap([...byKey.values()])
    })
    if (incoming.type === 'FRIEND_REQUEST') setFriendsVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    // Wait until auth is resolved. If no user, do nothing (the WS handshake would fail).
    if (loading || !user) return

    // Hydrate from whatever's already pending so a reload / offline gap doesn't hide notifications.
    refresh()

    // Live feed for anything that arrives while the app is open.
    const client = new Client({
      brokerURL: config.wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        // /user/queue/notification is routed exclusively to this session's principal.
        client.subscribe('/user/queue/notification', (frame) => {
          try {
            append(JSON.parse(frame.body) as NotificationData)
          } catch {
            // ignore malformed frames
          }
        })
      },
    })
    client.activate()
    clientRef.current = client

    return () => {
      void client.deactivate()
      clientRef.current = null
    }
  }, [user, loading, refresh, append])

  return (
    <NotificationsContext.Provider
      value={{ notifications, dismiss, friendsVersion, notifyFriendsChanged }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
