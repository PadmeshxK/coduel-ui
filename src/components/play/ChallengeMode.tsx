import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../ui/Avatar'
import { Loader } from '../ui/Loader'
import { SearchIcon, SwordsIcon } from './icons'
import { challengeApi, friendApi } from '../../lib/api'
import { useNotifications } from '../../hooks/useNotifications'
import type { FriendData } from '../../types'

const PREVIEW = 3 // a few friends to duel in one tap; the rest live on the Friends page

type Pending = { userId: number; name: string }

/**
 * Challenge-a-friend action — deliberately tiny so it never stretches the home layout. A single line
 * of circular friend avatars (tap to duel, name on hover) plus a magnifier that jumps to the Friends
 * page where any friend can be duelled. Picking one opens a "waiting…" state; an accept pulls both
 * into the duel (via the CHALLENGE_ACCEPTED push in useNotifications), a decline/timeout returns here.
 */
export function ChallengeMode() {
  const navigate = useNavigate()
  const { declinedChallenge } = useNotifications()
  const [friends, setFriends] = useState<FriendData[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [declined, setDeclined] = useState<string | null>(null)

  useEffect(() => {
    void friendApi
      .list()
      .then(setFriends)
      .catch(() => setFriends([]))
  }, [])

  // The opponent declined (live signal) — drop the waiting state and note who, so they can pick again.
  useEffect(() => {
    if (pending && declinedChallenge && declinedChallenge.userId === pending.userId) {
      setDeclined(declinedChallenge.name)
      setPending(null)
    }
    // Only react to a fresh decline signal — pending is read at that moment, not a trigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declinedChallenge])

  // A sent challenge self-expires (~90s) if unanswered — mirror that so we don't wait forever.
  useEffect(() => {
    if (!pending) return
    const name = pending.name
    const t = setTimeout(() => {
      setDeclined(name)
      setPending(null)
    }, 95_000)
    return () => clearTimeout(t)
  }, [pending])

  async function challenge(f: FriendData) {
    setDeclined(null)
    setBusy(f.userId)
    try {
      await challengeApi.create(f.userId)
      setPending({ userId: f.userId, name: f.displayName ?? 'Your friend' })
    } catch {
      // create only targets confirmed friends, so this is rare — just release the avatar.
    } finally {
      setBusy(null)
    }
  }

  // Waiting for the opponent to respond.
  if (pending) {
    return (
      <div className="animate-reveal flex flex-col gap-2.5">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-3">
          <span className="loader-ring shrink-0" style={{ width: 16, height: 16 }} />
          <p className="text-[13.5px]">
            Waiting for <span className="font-semibold">{pending.name}</span> to accept…
          </p>
        </div>
        <button
          onClick={() => setPending(null)}
          className="self-start font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (friends === null) {
    return (
      <div className="py-1.5">
        <Loader inline size={16} label="loading friends" />
      </div>
    )
  }

  if (friends.length === 0) {
    return (
      <p className="text-[13.5px] text-ink-soft">
        No friends yet —{' '}
        <Link to="/friend" className="text-accent underline underline-offset-2">
          add some
        </Link>{' '}
        to challenge them.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {declined && (
        <p className="font-mono text-[11px] text-accent">✗ {declined} declined — try another.</p>
      )}

      {/* one tight line — circular friends + a magnifier; never wraps (shrink-0 items) */}
      <div className="flex items-center gap-2">
        {friends.slice(0, PREVIEW).map((f, i) => {
          const loading = busy === f.userId
          return (
            <span
              key={f.userId}
              className="animate-reveal z-20 flex shrink-0 items-center"
              style={{ animationDelay: `${i * 70}ms` }}
            >
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => challenge(f)}
              aria-label={`Duel ${f.displayName ?? 'player'}`}
              className="group relative rounded-full transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
            >
              <Avatar
                initial={(f.displayName ?? '?').charAt(0).toUpperCase()}
                src={f.avatarUrl}
                size={40}
                className="block"
              />
              {loading ? (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-paper-2/70">
                  <span className="loader-ring" style={{ width: 18, height: 18 }} />
                </span>
              ) : (
                <>
                  {/* on hover the circle fills with accent + crossed swords — the "click to duel" cue */}
                  <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-accent/85 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <SwordsIcon size={18} className="text-white" />
                  </span>
                  {/* floating label above the avatar — themed surface, matches the site's popovers */}
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-line bg-paper-2 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink opacity-0 shadow-[0_10px_24px_-10px_rgba(27,24,19,0.5)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                    Duel {f.displayName ?? 'player'}
                  </span>
                </>
              )}
            </button>
            </span>
          )
        })}

        <span
          className="animate-reveal z-20 shrink-0"
          style={{ animationDelay: `${PREVIEW * 70}ms` }}
        >
        <button
          type="button"
          onClick={() => navigate('/friend')}
          aria-label="Duel more friends"
          className="group relative grid h-10 w-10 place-items-center rounded-full border border-dashed border-line text-ink-soft transition hover:-translate-y-0.5 hover:border-accent hover:text-accent"
        >
          <SearchIcon size={16} />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-line bg-paper-2 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink opacity-0 shadow-[0_10px_24px_-10px_rgba(27,24,19,0.5)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            Duel friends
          </span>
        </button>
        </span>
      </div>
    </div>
  )
}
