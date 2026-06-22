import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { challengeApi, friendApi, roomApi } from '../../lib/api'
import { useNotifications, notificationKey } from '../../hooks/useNotifications'
import type { NotificationData } from '../../types'

function timeAgo(ms?: number | null): string {
  if (!ms) return ''
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/** Header notification center: a bell with an unread badge that opens a dropdown of recent
 *  notifications (friend requests + room invites), each actionable inline. */
export function NotificationBell() {
  const { notifications, dismiss, notifyFriendsChanged } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click outside closes the panel (it's a click-toggle, not hover — you interact with it).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const count = notifications.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={`relative grid h-9 w-9 place-items-center rounded-full border transition active:scale-90 ${
          open
            ? 'border-line bg-paper-2 text-ink'
            : 'border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink'
        }`}
      >
        <BellIcon />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Always mounted, toggled with a scale+fade so it eases open AND closed (anchored at the bell). */}
      <div
        className={`reflective absolute right-0 top-full z-40 mt-2 w-[360px] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-2xl border border-line bg-paper-2 shadow-[0_24px_60px_-24px_rgba(27,24,19,0.6)] transition duration-200 ${
          open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
            Notifications
          </span>
          {count > 0 && <span className="font-mono text-[11px] text-accent">{count}</span>}
        </div>

        {count === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-ink-soft">
            You're all caught up.
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto">
            {notifications.map((n) => (
              <NotificationRow
                key={notificationKey(n)}
                notification={n}
                onResolve={() => dismiss(n)}
                onFriendChange={notifyFriendsChanged}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NotificationRow({
  notification,
  onResolve,
  onFriendChange,
  onNavigate,
}: {
  notification: NotificationData
  onResolve: () => void
  onFriendChange: () => void
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const { acceptFriendRequest } = useNotifications()
  const [busy, setBusy] = useState(false)
  const isInvite = notification.type === 'ROOM_INVITE'
  const isChallenge = notification.type === 'DUEL_CHALLENGE'
  const isDm = notification.type === 'DM_RECEIVED'
  const fromName = notification.fromDisplayName ?? 'Someone'

  // A DM is a passive heads-up (it TTLs out on its own) — the whole row just opens the thread.
  if (isDm) {
    return (
      <button
        onClick={() => {
          onResolve()
          onNavigate()
          navigate(`/messages/${notification.fromUserId}`)
        }}
        className="animate-reveal flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition last:border-b-0 hover:bg-accent/[0.04]"
      >
        <Avatar initial={fromName.charAt(0).toUpperCase()} src={notification.fromAvatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug">
            <span className="font-semibold">{fromName}</span>{' '}
            <span className="text-ink-soft">sent you a message</span>
          </p>
          {notification.createdAtMs != null && (
            <span className="mt-0.5 block font-mono text-[10px] text-ink-soft">
              {timeAgo(notification.createdAtMs)}
            </span>
          )}
        </div>
      </button>
    )
  }

  async function accept() {
    setBusy(true)
    try {
      if (isInvite) {
        await roomApi.join(notification.roomId!)
        onResolve()
        onNavigate()
        navigate(`/room/${notification.roomId}`)
      } else if (isChallenge) {
        const res = await challengeApi.accept(notification.challengeId!)
        onResolve()
        onNavigate()
        if (res.matchId) navigate(`/match/${res.matchId}`)
      } else {
        // Centralised: flips the shared notification to its "now friends ✓" confirmation (this row
        // and the toast update together), then clears it. No local state to drift out of sync.
        await acceptFriendRequest(notification)
      }
    } catch {
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    try {
      if (isInvite) {
        // Room invites aren't persisted on decline (they TTL out) — just clear locally.
        onResolve()
      } else if (isChallenge) {
        await challengeApi.decline(notification.challengeId!)
        onResolve()
      } else {
        await friendApi.decline(notification.requestId!)
        onResolve()
        onFriendChange()
      }
    } catch {
      setBusy(false)
    }
  }

  if (notification.accepted) {
    return (
      <div className="animate-reveal flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
        <Avatar initial={fromName.charAt(0).toUpperCase()} src={notification.fromAvatarUrl} size={36} />
        <div className="min-w-0 flex-1 self-center">
          <p className="text-[13px] leading-snug">
            <span className="font-semibold">{fromName}</span>{' '}
            <span className="text-accent-2">and you are now friends ✓</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-reveal flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
      <Avatar initial={fromName.charAt(0).toUpperCase()} src={notification.fromAvatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          <span className="font-semibold">{fromName}</span>{' '}
          <span className="text-ink-soft">
            {isInvite
              ? 'invited you to a room'
              : isChallenge
                ? 'challenged you to a duel'
                : 'sent you a friend request'}
          </span>
        </p>
        {notification.createdAtMs != null && (
          <span className="mt-0.5 block font-mono text-[10px] text-ink-soft">
            {timeAgo(notification.createdAtMs)}
          </span>
        )}
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" disabled={busy} onClick={accept}>
            {isInvite ? 'Join' : 'Accept'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={reject}>
            {isInvite ? 'Dismiss' : 'Decline'}
          </Button>
        </div>
      </div>
    </div>
  )
}
