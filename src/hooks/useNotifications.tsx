import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { useStomp } from './useStomp'
import { friendApi, notificationApi } from '../lib/api'
import type { NotificationData } from '../types'

// Stable identity per notification — invites key on roomId, challenges on challengeId, the rest on requestId.
export function notificationKey(n: NotificationData): string {
  switch (n.type) {
    case 'ROOM_INVITE':
      return `room:${n.roomId}`
    case 'DUEL_CHALLENGE':
      return `challenge:${n.challengeId}`
    default:
      return `friend:${n.requestId}`
  }
}

// A transient "you're now friends" confirmation toast — shown to the requester when their request
// is accepted (live FRIEND_ACCEPTED push). Ephemeral, not part of the actionable notification list.
export interface FlashToast {
  id: string
  name: string
  avatarUrl?: string | null
}

const MAX_NOTIFICATIONS = 20
const FRIEND_CONFIRM_MS = 2000

const sortCap = (list: NotificationData[]): NotificationData[] =>
  [...list]
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
    .slice(0, MAX_NOTIFICATIONS)

interface NotificationsState {
  notifications: NotificationData[]
  dismiss: (n: NotificationData) => void
  // Accept a friend request (from any surface): runs the API call, flips the shared notification to
  // its "now friends ✓" confirmation across every surface showing it, then clears it. Centralised
  // here so the bell and the toast never disagree (one would otherwise show a stale pending row).
  acceptFriendRequest: (n: NotificationData) => Promise<void>
  // Keys of notifications that arrived LIVE this session (via STOMP) — only these pop a toast. Ones
  // hydrated from GET /notification on load live in the bell only, so a refresh never re-pops them.
  liveKeys: Set<string>
  // Transient "you're now friends" toasts (shown to the requester on a live FRIEND_ACCEPTED push).
  flashToasts: FlashToast[]
  dismissFlash: (id: string) => void
  // Bumped whenever a friend relationship changes (from the bell or the Friends page) — the Friends
  // page watches it to re-sync. Call notifyFriendsChanged() after any friend mutation.
  friendsVersion: number
  notifyFriendsChanged: () => void
  // Set (with a rising tick so repeats re-fire) when a request WE sent is declined — the Friends
  // page clears its local "Requested" flag for this user so the button reverts to "Add". No toast.
  declinedRequest: { userId: number; tick: number } | null
  // Set (rising tick) when a duel challenge WE sent is declined — the challenger's Play card drops its
  // "waiting…" state for that opponent. userId is the decliner; name is shown in the "declined" note.
  declinedChallenge: { userId: number; name: string; tick: number } | null
  // Set (rising tick) when ranked matchmaking pairs us — RankedDuelMode shows an "opponent found"
  // beat, then navigates both players into the duel after a short cooldown.
  matchmakingFound: { matchId: number; tick: number } | null
}

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  dismiss: () => {},
  acceptFriendRequest: async () => {},
  liveKeys: new Set(),
  flashToasts: [],
  dismissFlash: () => {},
  friendsVersion: 0,
  notifyFriendsChanged: () => {},
  declinedRequest: null,
  declinedChallenge: null,
  matchmakingFound: null,
})

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [liveKeys, setLiveKeys] = useState<Set<string>>(new Set())
  const [flashToasts, setFlashToasts] = useState<FlashToast[]>([])
  const [friendsVersion, setFriendsVersion] = useState(0)
  const [declinedRequest, setDeclinedRequest] = useState<{ userId: number; tick: number } | null>(null)
  const [declinedChallenge, setDeclinedChallenge] = useState<{ userId: number; name: string; tick: number } | null>(null)
  const [matchmakingFound, setMatchmakingFound] = useState<{ matchId: number; tick: number } | null>(null)
  const { subscribe } = useStomp()

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

  const dismissFlash = useCallback((id: string) => {
    setFlashToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Keep both friend surfaces in sync: refetch the bell + signal the Friends page to reload.
  const notifyFriendsChanged = useCallback(() => {
    setFriendsVersion((v) => v + 1)
    refresh()
  }, [refresh])

  // Accept from any surface: flip the shared notification to "accepted" (every surface showing it
  // updates together), bump the friends list, then clear the row after the confirmation lingers.
  const acceptFriendRequest = useCallback(async (n: NotificationData) => {
    const key = notificationKey(n)
    try {
      await friendApi.accept(n.requestId!)
    } catch {
      // Already handled elsewhere / no longer valid — drop it silently.
      setNotifications((prev) => prev.filter((x) => notificationKey(x) !== key))
      return
    }
    setNotifications((prev) =>
      prev.map((x) => (notificationKey(x) === key ? { ...x, accepted: true } : x)),
    )
    setFriendsVersion((v) => v + 1)
    setTimeout(() => {
      setNotifications((prev) => prev.filter((x) => notificationKey(x) !== key))
    }, FRIEND_CONFIRM_MS)
  }, [])

  // A single live notification — dedupe by key, most-recent-first, capped.
  const append = useCallback((incoming: NotificationData) => {
    // The requester's "your request was accepted" cue: not actionable, so it never enters the bell
    // list — it pops a transient confirmation toast and refreshes the friends list.
    if (incoming.type === 'FRIEND_ACCEPTED') {
      setFlashToasts((prev) => [
        ...prev,
        {
          id: `friend-${incoming.fromUserId}-${Date.now()}`,
          name: incoming.fromDisplayName ?? 'Someone',
          avatarUrl: incoming.fromAvatarUrl,
        },
      ])
      setFriendsVersion((v) => v + 1)
      return
    }
    // A request we sent was declined — drop quietly (no toast), just signal the Friends page to
    // revert the "Requested" button back to "Add" for this user.
    if (incoming.type === 'FRIEND_DECLINED') {
      setDeclinedRequest((prev) => ({ userId: incoming.fromUserId, tick: (prev?.tick ?? 0) + 1 }))
      setFriendsVersion((v) => v + 1)
      return
    }
    // A challenge was accepted — both players are pushed this with the new matchId. Jump straight into
    // the duel from wherever we are (the challenger is "waiting…", the accepter just clicked Accept).
    if (incoming.type === 'CHALLENGE_ACCEPTED' && incoming.matchId) {
      navigate(`/match/${incoming.matchId}`)
      return
    }
    // Ranked matchmaking paired us (pushed to both players) — signal RankedDuelMode to show the
    // "opponent found" beat and navigate both players in after a short cooldown (no polling).
    if (incoming.type === 'MATCHMAKING_FOUND' && incoming.matchId) {
      const matchId = incoming.matchId
      setMatchmakingFound((prev) => ({ matchId, tick: (prev?.tick ?? 0) + 1 }))
      return
    }
    // A challenge we sent was declined — signal the challenger's Play card to drop "waiting…". No bell.
    if (incoming.type === 'CHALLENGE_DECLINED') {
      setDeclinedChallenge((prev) => ({
        userId: incoming.fromUserId,
        name: incoming.fromDisplayName ?? 'Your friend',
        tick: (prev?.tick ?? 0) + 1,
      }))
      return
    }
    const normalized = { ...incoming, createdAtMs: incoming.createdAtMs ?? Date.now() }
    // Live arrival → eligible for a toast. (refresh()/hydrate sets notifications directly and never
    // touches liveKeys, so reloaded pending items show in the bell but don't re-pop a toast.)
    setLiveKeys((prev) => new Set(prev).add(notificationKey(normalized)))
    setNotifications((prev) => {
      const byKey = new Map<string, NotificationData>()
      for (const n of [...prev, normalized]) byKey.set(notificationKey(n), n)
      return sortCap([...byKey.values()])
    })
    if (incoming.type === 'FRIEND_REQUEST') setFriendsVersion((v) => v + 1)
  }, [navigate])

  useEffect(() => {
    // Wait until auth is resolved. If no user, do nothing (the shared socket isn't up yet).
    if (loading || !user) return

    // Hydrate from whatever's already pending so a reload / offline gap doesn't hide notifications.
    refresh()

    // Live feed on the shared connection — /user/queue/notification is routed to this session only.
    const unsubscribe = subscribe('/user/queue/notification', (body) => {
      try {
        append(JSON.parse(body) as NotificationData)
      } catch {
        // ignore malformed frames
      }
    })
    return unsubscribe
  }, [user, loading, refresh, append, subscribe])

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        dismiss,
        acceptFriendRequest,
        liveKeys,
        flashToasts,
        dismissFlash,
        friendsVersion,
        notifyFriendsChanged,
        declinedRequest,
        declinedChallenge,
        matchmakingFound,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
