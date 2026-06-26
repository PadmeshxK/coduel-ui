import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
    case 'DM_RECEIVED':
      // Keyed by sender so repeated DMs collapse into one bell row (its TTL just refreshes).
      return `dm:${n.fromUserId}`
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
  // 'friend' = "you're now friends" confirmation; 'dm' = "X messaged you" (clickable → its thread).
  kind: 'friend' | 'dm'
  // For 'dm': the message kind, so the toast can say what they sent (image/code/problem/text).
  messageKind?: string | null
  to?: string
}

const MAX_NOTIFICATIONS = 20
const FRIEND_CONFIRM_MS = 2000
// Cap stacked flash toasts (DM / "now friends") so spamming can't bury the screen — keep the latest few.
const MAX_FLASH = 3
// How long a DM lingers in the bell after its toast — a grace window so a missed toast isn't lost.
const DM_BELL_TTL_MS = 12_000

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
  // The Messages page registers the conversation it's showing so a DM toast isn't popped for the
  // thread you're already looking at (null = no DM thread focused).
  setActiveDm: (userId: number | null) => void
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
  setActiveDm: () => {},
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
  // Which DM thread is open (ref, not state — it only gates toast suppression, never triggers a render).
  const activeDmRef = useRef<number | null>(null)
  const setActiveDm = useCallback((userId: number | null) => {
    activeDmRef.current = userId
  }, [])
  // Per-sender TTL timers that evict a DM from the bell once its grace window lapses.
  const dmTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const { subscribe, connected } = useStomp()

  // Keys we've already surfaced this session (popped live OR seen in a prior hydrate). The reconnect
  // catch-up pops a toast only for keys NOT in here — i.e. genuinely published while we were dropped —
  // so a cold load / plain reload never re-pops invites you've already got sitting in the bell.
  const surfacedRef = useRef<Set<string>>(new Set())

  // Authoritative reload — GET /notification is the full pending set (invites in Redis, requests in
  // DB), so a replace correctly drops anything that's no longer pending (e.g. an accepted request).
  // heal=true (a reconnect) pops a toast for anything pending we never surfaced live — self-healing a
  // push that was dropped during the gap (the broker has no replay), so it doesn't rot in the bell.
  const reload = useCallback((heal: boolean) => {
    notificationApi
      .getPending()
      .then((list) => {
        const capped = sortCap(list)
        setNotifications(capped)
        if (heal) {
          // GET /notification IS the definition of a durable, actionable notification — the transient
          // cues (DMs, accepts/declines, matchmaking) are early-returned in append() and never land
          // here. So every pending item we haven't surfaced yet is a legit missed push, regardless of
          // its type. No allowlist → any notification type added later self-heals for free.
          const missed = capped.filter((n) => !surfacedRef.current.has(notificationKey(n)))
          if (missed.length > 0) {
            setLiveKeys((prev) => {
              const next = new Set(prev)
              for (const n of missed) next.add(notificationKey(n))
              return next
            })
          }
        }
        for (const n of capped) surfacedRef.current.add(notificationKey(n))
      })
      .catch(() => {})
  }, [])

  const refresh = useCallback(() => reload(false), [reload])

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
          kind: 'friend' as const,
        },
      ].slice(-MAX_FLASH))
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
    // A DM arrived — suppress entirely while we're reading that exact thread (the /user/queue/dm stream
    // is already updating the open view). Otherwise pop a transient toast AND drop a bell row that
    // lingers for a grace window (DM_BELL_TTL_MS) so a missed toast isn't lost, then evicts itself.
    if (incoming.type === 'DM_RECEIVED') {
      if (activeDmRef.current === incoming.fromUserId) return
      const dm = { ...incoming, createdAtMs: incoming.createdAtMs ?? Date.now() }
      setFlashToasts((prev) => [
        ...prev,
        {
          id: `dm-${incoming.fromUserId}-${Date.now()}`,
          name: incoming.fromDisplayName ?? 'Someone',
          avatarUrl: incoming.fromAvatarUrl,
          kind: 'dm' as const,
          messageKind: incoming.messageKind,
          to: `/messages/${incoming.fromUserId}`,
        },
      ].slice(-MAX_FLASH))
      const key = notificationKey(dm)
      setNotifications((prev) => {
        const byKey = new Map<string, NotificationData>()
        for (const n of [...prev, dm]) byKey.set(notificationKey(n), n)
        return sortCap([...byKey.values()])
      })
      const existing = dmTimers.current.get(key)
      if (existing) clearTimeout(existing)
      dmTimers.current.set(
        key,
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => notificationKey(n) !== key))
          dmTimers.current.delete(key)
        }, DM_BELL_TTL_MS),
      )
      return
    }
    // The challenger withdrew a pending challenge — drop its popup/bell row for the challenged user.
    if (incoming.type === 'CHALLENGE_WITHDRAWN') {
      const key = `challenge:${incoming.challengeId}`
      setNotifications((prev) => prev.filter((x) => notificationKey(x) !== key))
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
    surfacedRef.current.add(notificationKey(normalized)) // a later reconnect won't re-pop this one
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

  // Re-hydrate on reconnect: the broker has no replay, so a notification published during a reconnect
  // gap is missed live. Re-fetching the pending set recovers the persisted ones (room invites, duel
  // challenges, friend requests) AND pops a toast for the genuinely-new ones (heal=true) — so a missed
  // push self-heals into a popup instead of silently rotting in the bell. The FIRST connect is skipped:
  // the live subscription is freshly in place and the cold-load hydrate already filled the bell, so
  // there's nothing to heal (and we must not re-pop your existing pending invites on open/reload).
  const hadConnectedRef = useRef(false)
  useEffect(() => {
    if (loading || !user || !connected) return
    if (!hadConnectedRef.current) {
      hadConnectedRef.current = true
      return
    }
    reload(true)
  }, [connected, user, loading, reload])

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
        setActiveDm,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
