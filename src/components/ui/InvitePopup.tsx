import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { friendApi, roomApi } from '../../lib/api'
import { useNotifications, notificationKey } from '../../hooks/useNotifications'
import type { NotificationData } from '../../types'

// How long a toast lingers before it slips away on its own. The notification itself lives on in the
// bell until it expires or is acted on — the toast is just the loud, time-sensitive cue.
const AUTO_HIDE_MS = 12000

const toastKey = (n: NotificationData): string =>
  `${notificationKey(n)}:${n.createdAtMs ?? 'live'}`

/**
 * Toasts for live notifications. Auto-hiding only dismisses the toast — the notification persists in
 * the bell until the user acts on it there or in this toast.
 */
export function InvitePopupLayer() {
  const { notifications } = useNotifications()
  // Toast keys the user closed / that timed out — hides the toast WITHOUT removing it from the bell.
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toasts = notifications
    .filter((n) => !hidden.has(toastKey(n)))
    .slice(0, 3)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {toasts.map((n) => (
        <InviteCard
          key={toastKey(n)}
          notification={n}
          onHide={() => setHidden((prev) => new Set(prev).add(toastKey(n)))}
        />
      ))}
    </div>
  )
}

function InviteCard({
  notification,
  onHide,
}: {
  notification: NotificationData
  onHide: () => void
}) {
  const { dismiss, notifyFriendsChanged } = useNotifications()
  const navigate = useNavigate()

  // The fuse bar (CSS) and the auto-hide timeout (JS) share one lifetime and pause together on hover,
  // so the visual countdown always matches when the toast actually slips away.
  const [paused, setPaused] = useState(false)
  const remainingRef = useRef(AUTO_HIDE_MS)
  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const isInvite = notification.type === 'ROOM_INVITE'

  // Slide + fade the toast out, then actually remove it — a smooth exit instead of a snap.
  function leave() {
    if (timerRef.current) clearTimeout(timerRef.current)
    const el = rootRef.current
    if (!el) {
      onHide()
      return
    }
    const anim = el.animate(
      [
        { opacity: 1, transform: 'translateX(0) scale(1)' },
        { opacity: 0, transform: 'translateX(24px) scale(0.96)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
    anim.onfinish = onHide
  }

  useEffect(() => {
    startRef.current = Date.now()
    timerRef.current = setTimeout(leave, remainingRef.current)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pause() {
    if (timerRef.current) clearTimeout(timerRef.current)
    remainingRef.current -= Date.now() - startRef.current // bank the time already elapsed
    setPaused(true)
  }

  function resume() {
    startRef.current = Date.now()
    timerRef.current = setTimeout(leave, remainingRef.current)
    setPaused(false)
  }

  async function handleAccept() {
    try {
      if (isInvite) {
        await roomApi.join(notification.roomId!)
        dismiss(notification)
        onHide()
        navigate(`/room/${notification.roomId}`)
        return
      }

      await friendApi.accept(notification.requestId!)
      dismiss(notification)
      notifyFriendsChanged()
      onHide()
    } catch {
      onHide()
    }
  }

  async function handleDecline() {
    if (isInvite) {
      leave()
      return
    }

    try {
      await friendApi.decline(notification.requestId!)
      dismiss(notification)
      notifyFriendsChanged()
      onHide()
    } catch {
      onHide()
    }
  }

  const fromName = notification.fromDisplayName ?? 'Someone'

  return (
    <div
      ref={rootRef}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className="reflective animate-reveal relative w-[320px] overflow-hidden rounded-2xl border border-line bg-paper-2 p-4 shadow-[0_20px_50px_-20px_rgba(27,24,19,0.6)]"
    >
      <div className="flex items-start gap-3">
        <Avatar
          initial={fromName.charAt(0).toUpperCase()}
          src={notification.fromAvatarUrl}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
            {isInvite ? '● Room invite' : '● Friend request'}
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-snug">
            <span className="text-ink">{fromName}</span>{' '}
            <span className="text-ink-soft">
              {isInvite ? 'invited you to play' : 'sent you a friend request'}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex gap-2">
        <Button size="sm" onClick={handleAccept} className="flex-1">
          {isInvite ? 'Join' : 'Accept'}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDecline} className="flex-1">
          {isInvite ? 'Dismiss' : 'Decline'}
        </Button>
      </div>

      {/* countdown fuse — depletes over the toast's lifetime, freezes while hovered */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gradient-to-r from-accent to-gold"
        style={{
          animation: `invite-countdown ${AUTO_HIDE_MS}ms linear forwards`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  )
}
