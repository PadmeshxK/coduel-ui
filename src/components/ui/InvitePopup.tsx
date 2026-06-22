import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Toast } from './Toast'
import { challengeApi, friendApi, roomApi } from '../../lib/api'
import { useNotifications, notificationKey, type FlashToast } from '../../hooks/useNotifications'
import type { NotificationData } from '../../types'

// How long a toast lingers before it slips away on its own. The notification itself lives on in the
// bell until it expires or is acted on — the toast is just the loud, time-sensitive cue.
const AUTO_HIDE_MS = 12000
// "You're now friends" confirmation toast lifetime.
const FLASH_MS = 3500
// How long the in-card "now friends ✓" confirmation lingers before the toast slides out. Kept under
// the context's 2s removal so the exit animation finishes before the shared notification is cleared.
const CONFIRM_MS = 1500

const toastKey = (n: NotificationData): string =>
  `${notificationKey(n)}:${n.createdAtMs ?? 'live'}`

/**
 * Toasts for live notifications. Auto-hiding only dismisses the toast — the notification persists in
 * the bell until the user acts on it there or in this toast. Every toast type shares the Toast shell,
 * so they all enter/exit with the same slide animation.
 */
export function InvitePopupLayer() {
  const { notifications, flashToasts, liveKeys } = useNotifications()
  // Toast keys the user closed / that timed out — hides the toast WITHOUT removing it from the bell.
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  // Only events that arrived LIVE this session pop a toast — notifications hydrated from the server
  // on load (or after a refresh) stay in the bell only, so they never re-pop.
  // Total toasts on screen is capped at 3. Flash toasts (≤3 at the source, always rendered so they
  // auto-dismiss) take priority; invite/notification toasts fill whatever slots remain.
  const toasts = notifications
    .filter((n) => liveKeys.has(notificationKey(n)) && !hidden.has(toastKey(n)))
    .slice(0, Math.max(0, 3 - flashToasts.length))

  if (toasts.length === 0 && flashToasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* "you're now friends" confirmations (shown to the requester on accept) */}
      {flashToasts.map((t) => (
        <FlashCard key={t.id} toast={t} />
      ))}
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

// A transient success card: "You and <name> are now friends ✓". Self-dismisses via the Toast timer.
function FlashCard({ toast }: { toast: FlashToast }) {
  const { dismissFlash } = useNotifications()
  const navigate = useNavigate()

  // DM: a clickable cue → opens the thread. Shown only when you're NOT already in that conversation
  // (the provider suppresses it otherwise).
  if (toast.kind === 'dm') {
    return (
      <Toast onClose={() => dismissFlash(toast.id)} duration={FLASH_MS} className="border-accent/40">
        <button
          type="button"
          onClick={() => {
            if (toast.to) navigate(toast.to)
            dismissFlash(toast.id)
          }}
          className="flex w-full items-center gap-3 text-left"
        >
          <Avatar initial={toast.name.charAt(0).toUpperCase()} src={toast.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">● Message</p>
            <p className="mt-1 text-[14px] font-semibold leading-snug">
              <span className="text-ink">{toast.name}</span>{' '}
              <span className="text-ink-soft">sent you a message</span>
            </p>
          </div>
        </button>
      </Toast>
    )
  }

  // Friend: the "you're now friends" confirmation (not actionable).
  return (
    <Toast onClose={() => dismissFlash(toast.id)} duration={FLASH_MS} className="border-accent-2/40">
      <div className="flex items-center gap-3">
        <Avatar initial={toast.name.charAt(0).toUpperCase()} src={toast.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent-2">● Friends</p>
          <p className="mt-1 text-[14px] font-semibold leading-snug">
            <span className="text-ink">You and {toast.name}</span>{' '}
            <span className="text-accent-2">are now friends ✓</span>
          </p>
        </div>
      </div>
    </Toast>
  )
}

function InviteCard({
  notification,
  onHide,
}: {
  notification: NotificationData
  onHide: () => void
}) {
  const { dismiss, notifyFriendsChanged, acceptFriendRequest } = useNotifications()
  const navigate = useNavigate()
  // The Toast hands us its imperative close() (plays the exit, then onHide) so the buttons can dismiss.
  const closeRef = useRef<() => void>(() => {})

  const isInvite = notification.type === 'ROOM_INVITE'
  const isChallenge = notification.type === 'DUEL_CHALLENGE'
  // Shared flag set by acceptFriendRequest, so this toast and the bell row flip to "now friends ✓"
  // (and clear) together.
  const friendAccepted = notification.accepted === true
  const fromName = notification.fromDisplayName ?? 'Someone'

  async function handleAccept() {
    try {
      if (isInvite) {
        await roomApi.join(notification.roomId!)
        dismiss(notification)
        navigate(`/room/${notification.roomId}`)
        closeRef.current()
        return
      }
      if (isChallenge) {
        const res = await challengeApi.accept(notification.challengeId!)
        dismiss(notification)
        if (res.matchId) navigate(`/match/${res.matchId}`)
        closeRef.current()
        return
      }
      // Friend request: flips notification.accepted (this card shows the confirmation), then slide
      // the toast out once the confirmation has lingered.
      await acceptFriendRequest(notification)
      setTimeout(() => closeRef.current(), CONFIRM_MS)
    } catch {
      closeRef.current()
    }
  }

  async function handleDecline() {
    if (isInvite) {
      closeRef.current()
      return
    }
    if (isChallenge) {
      try {
        await challengeApi.decline(notification.challengeId!)
        dismiss(notification)
      } finally {
        closeRef.current()
      }
      return
    }
    try {
      await friendApi.decline(notification.requestId!)
      dismiss(notification)
      notifyFriendsChanged()
    } finally {
      closeRef.current()
    }
  }

  return (
    <Toast
      onClose={onHide}
      duration={friendAccepted ? null : AUTO_HIDE_MS}
      pauseOnHover={!friendAccepted}
      fuse={!friendAccepted}
      closeRef={closeRef}
    >
      <div className="flex items-start gap-3">
        <Avatar initial={fromName.charAt(0).toUpperCase()} src={notification.fromAvatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
            {isInvite
              ? '● Room invite'
              : isChallenge
                ? '● Duel challenge'
                : friendAccepted
                  ? '● Friends'
                  : '● Friend request'}
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-snug">
            <span className="text-ink">{fromName}</span>{' '}
            <span className={friendAccepted ? 'text-accent-2' : 'text-ink-soft'}>
              {friendAccepted
                ? 'and you are now friends ✓'
                : isInvite
                  ? 'invited you to play'
                  : isChallenge
                    ? 'challenged you to a duel'
                    : 'sent you a friend request'}
            </span>
          </p>
        </div>
      </div>

      {!friendAccepted && (
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" onClick={handleAccept} className="flex-1">
            {isInvite ? 'Join' : 'Accept'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDecline} className="flex-1">
            {isInvite ? 'Dismiss' : 'Decline'}
          </Button>
        </div>
      )}
    </Toast>
  )
}
