import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../ui/Avatar'
import { Loader } from '../ui/Loader'
import { SwordsIcon } from '../play/icons'
import { chatApi, friendApi } from '../../lib/api'
import { usePresence } from '../../hooks/usePresence'
import { useLenisBox } from '../../hooks/useLenisBox'
import type { FriendData } from '../../types'

/**
 * "Challenge a friend" on the Solve page. Opens a themed friend picker; choosing a friend drops a
 * shared-problem card into that DM and jumps to the thread, where either side can launch the duel on
 * THIS problem. Discovery-first entry point (the conversation-first one lives in the chat composer).
 */
export function ChallengeFriendButton({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const { isOnline } = usePresence()
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<FriendData[] | null>(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load the friend list the first time the picker opens (cached after).
  useEffect(() => {
    if (!open || friends !== null) return
    void friendApi
      .list()
      .then(setFriends)
      .catch(() => setFriends([]))
  }, [open, friends])

  // Dismiss on outside-click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function share(f: FriendData) {
    if (sending !== null) return
    setSending(f.userId)
    try {
      await chatApi.send(f.userId, '', { kind: 'PROBLEM_SHARE', sharedRef: slug })
      navigate(`/messages/${f.userId}`)
    } catch {
      setSending(null) // share targets confirmed friends only, so this is rare — re-enable on failure
    }
  }

  const q = query.trim().toLowerCase()
  const shown = (friends ?? [])
    .filter((f) => !q || (f.displayName ?? '').toLowerCase().includes(q))
    // Online friends first — they can accept right now.
    .sort((a, b) => Number(isOnline(b.userId)) - Number(isOnline(a.userId)))

  // Momentum scroll for the friend list when it overflows (re-measures on open + result-count change).
  useLenisBox(listRef, [open, shown.length])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] transition active:scale-[0.98] ${
          open
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-accent/40 text-accent hover:border-accent hover:bg-accent/[0.06]'
        }`}
      >
        <SwordsIcon size={14} />
        Challenge a friend
      </button>

      {open && (
        <div className="animate-reveal absolute right-0 top-full z-30 mt-2 w-[300px] overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_50px_-20px_rgba(27,24,19,0.6)]">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">Duel a friend on this</span>
          </div>
          <div className="px-3 pb-2.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends…"
              className="w-full rounded-lg border border-line bg-paper-2 px-3 py-2 text-[13px] outline-none transition focus:border-accent"
            />
          </div>
          <div ref={listRef} data-lenis-prevent className="no-scrollbar max-h-64 overflow-y-auto">
            <div className="px-2.5 pb-2.5">
            {friends === null ? (
              <div className="grid h-24 place-items-center">
                <Loader inline size={16} label="loading" />
              </div>
            ) : shown.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-ink-soft">
                {q ? 'No matching friends.' : 'No friends yet — add some to duel them.'}
              </p>
            ) : (
              shown.map((f, i) => {
                const online = isOnline(f.userId)
                return (
                  <button
                    key={f.userId}
                    onClick={() => share(f)}
                    disabled={sending !== null}
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    className="animate-reveal flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-line hover:bg-paper-2 disabled:opacity-60"
                  >
                    <span className="relative inline-block shrink-0" style={{ width: 34, height: 34 }}>
                      <Avatar initial={(f.displayName ?? '?').charAt(0).toUpperCase()} src={f.avatarUrl} size={34} />
                      {online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-accent-2" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{f.displayName ?? 'Unknown'}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                        {online ? <span className="text-accent-2">online</span> : 'offline'}
                      </span>
                    </span>
                    {sending === f.userId ? (
                      <span className="loader-ring shrink-0" style={{ width: 15, height: 15 }} />
                    ) : (
                      <span className="shrink-0 text-ink-soft transition group-hover:text-accent">
                        <SwordsIcon size={15} />
                      </span>
                    )}
                  </button>
                )
              })
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
