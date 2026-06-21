import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Reveal } from '../components/ui/Reveal'
import { Loader } from '../components/ui/Loader'
import { Pager } from '../components/ui/Pager'
import { challengeApi, friendApi, userApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import type { FriendData, FriendRequestData } from '../types'

const FRIENDS_PER_PAGE = 8

export function Friends() {
  const { user } = useAuth()
  const { notifyFriendsChanged, friendsVersion, declinedRequest, declinedChallenge } = useNotifications()

  const [friends, setFriends] = useState<FriendData[]>([])
  const [requests, setRequests] = useState<FriendRequestData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FriendData[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [sentTo, setSentTo] = useState<number[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [friendsPage, setFriendsPage] = useState(0)
  // The friend we've sent a duel challenge to and are waiting on (null = none in flight).
  const [duelingId, setDuelingId] = useState<number | null>(null)

  // A request we sent was declined (live, silent signal) — drop the local "Requested" flag so this
  // person's button reverts to "Add". declinedRequest.userId is the decliner = the search-result user.
  useEffect(() => {
    if (declinedRequest) setSentTo((s) => s.filter((id) => id !== declinedRequest.userId))
  }, [declinedRequest])

  // A duel we sent was declined (live) — drop the "Waiting…" state on that friend's row.
  useEffect(() => {
    if (duelingId && declinedChallenge && declinedChallenge.userId === duelingId) setDuelingId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declinedChallenge])

  // A sent duel self-expires (~90s) if unanswered — mirror that so the button doesn't hang. (On
  // accept, the CHALLENGE_ACCEPTED push navigates us into the match before this fires.)
  useEffect(() => {
    if (duelingId === null) return
    const t = setTimeout(() => setDuelingId(null), 95_000)
    return () => clearTimeout(t)
  }, [duelingId])

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([friendApi.list(), friendApi.requests()])
      setFriends(f)
      setRequests(r)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, friendsVersion])

  // Debounced directory search — hits the backend only when the box is non-empty.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      userApi
        .search(q)
        .then((data) => active && setResults(data))
        .catch(() => active && setResults([]))
        .finally(() => active && setSearching(false))
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query])

  const friendIds = new Set(friends.map((f) => f.userId))

  // Client-side pagination of the friends list (the list is small enough to load whole).
  const friendsTotalPages = Math.max(1, Math.ceil(friends.length / FRIENDS_PER_PAGE))
  const friendsSafePage = Math.min(friendsPage, friendsTotalPages - 1)
  const friendsShown = friends.slice(
    friendsSafePage * FRIENDS_PER_PAGE,
    friendsSafePage * FRIENDS_PER_PAGE + FRIENDS_PER_PAGE,
  )

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  // Challenge a friend to a duel from their row. On accept the CHALLENGE_ACCEPTED push navigates both
  // players into the match; on decline/timeout the row's "Waiting…" reverts (effects above).
  async function startDuel(f: FriendData) {
    setDuelingId(f.userId)
    try {
      await challengeApi.create(f.userId)
    } catch {
      setDuelingId(null)
    }
  }

  return (
    <>
      <div className="mb-8 mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">● Friends</div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none">
          Your circle
        </h1>
        <p className="mt-4 text-ink-soft">
          Find new players, manage your requests, and challenge friends to a duel.
        </p>
      </div>

      {/* find + add */}
      <div className="relative mb-6">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-soft">⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find people by name…"
          className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-4 font-mono text-[13px] outline-none transition focus:border-accent"
        />
      </div>

      {results !== null && (
        <Reveal key={query}>
          <Card className="mb-8 overflow-hidden !p-0">
            {searching && results.length === 0 ? (
              <div className="px-[22px] py-5 font-mono text-[13px] text-ink-soft">Searching…</div>
            ) : results.filter((u) => u.userId !== user?.id).length === 0 ? (
              <div className="px-[22px] py-5 text-ink-soft">No one matches “{query.trim()}”.</div>
            ) : (
              results
                .filter((u) => u.userId !== user?.id)
                .map((u, i) => {
                  // Backend flags reflect real state (survive reload); sentTo covers the just-clicked
                  // session case before a re-search.
                  const already = u.friend || friendIds.has(u.userId)
                  const sent = u.pending || sentTo.includes(u.userId)
                  return (
                    <Row key={u.userId} person={u} first={i === 0}>
                      {already ? (
                        <Tag tone="text-accent-2">Friend</Tag>
                      ) : sent ? (
                        <Tag tone="text-ink-soft">Requested</Tag>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy === u.userId}
                          onClick={() =>
                            act(u.userId, async () => {
                              await friendApi.sendRequest(u.userId)
                              setSentTo((s) => [...s, u.userId])
                            })
                          }
                        >
                          Add
                        </Button>
                      )}
                    </Row>
                  )
                })
            )}
          </Card>
        </Reveal>
      )}

      {error && (
        <Card>
          <p className="font-mono text-sm text-accent">Couldn't load friends: {error}</p>
        </Card>
      )}

      {!error && loading && (
        <Card className="grid place-items-center py-16">
          <Loader label="Loading friends" />
        </Card>
      )}

      {!error && !loading && (
        <Reveal className="space-y-8">
          {requests.length > 0 && (
            <section>
              <SectionHead>Requests · {requests.length}</SectionHead>
              <Card className="overflow-hidden !p-0">
                {requests.map((req, i) => (
                  <Row
                    key={req.requestId}
                    person={{ userId: req.userId, displayName: req.displayName, avatarUrl: req.avatarUrl }}
                    first={i === 0}
                  >
                    <div className="flex items-center gap-2">
                      {/* Accepting moves them straight into the Friends list below — that's the feedback. */}
                      <Button size="sm" disabled={busy === req.requestId} onClick={() => act(req.requestId, async () => { await friendApi.accept(req.requestId); notifyFriendsChanged() })}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy === req.requestId} onClick={() => act(req.requestId, async () => { await friendApi.decline(req.requestId); notifyFriendsChanged() })}>
                        Decline
                      </Button>
                    </div>
                  </Row>
                ))}
              </Card>
            </section>
          )}

          <section>
            <SectionHead>Friends · {friends.length}</SectionHead>
            {friends.length === 0 ? (
              <Card>
                <p className="text-ink-soft">No friends yet — search above to add some.</p>
              </Card>
            ) : (
              <Card className="overflow-hidden !p-0">
                {friendsShown.map((f, i) => (
                  <Row key={f.userId} person={f} first={i === 0} meta={friendsFor(f.friendsSinceMs)}>
                    <div className="flex items-center gap-2">
                      <Button size="sm" disabled={duelingId !== null} onClick={() => startDuel(f)}>
                        {duelingId === f.userId ? 'Waiting…' : 'Duel'}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy === f.userId} onClick={() => act(f.userId, async () => { await friendApi.unfriend(f.userId); notifyFriendsChanged() })}>
                        Remove
                      </Button>
                    </div>
                  </Row>
                ))}
              </Card>
            )}
            <Pager page={friendsSafePage} totalPages={friendsTotalPages} onChange={setFriendsPage} />
          </section>
        </Reveal>
      )}
    </>
  )
}

function SectionHead({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">{children}</h2>
}

function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${tone}`}>{children}</span>
}

function Row({
  person,
  first,
  meta,
  children,
}: {
  person: FriendData
  first: boolean
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`flex items-center gap-4 px-[22px] py-4 ${first ? '' : 'border-t border-line'}`}>
      <Avatar initial={(person.displayName ?? '?').charAt(0).toUpperCase()} src={person.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold">{person.displayName ?? 'Unknown'}</div>
        {meta && <div className="mt-0.5 font-mono text-[11px] text-ink-soft">{meta}</div>}
      </div>
      {children}
    </div>
  )
}

// "Friends for…" — how long the friendship has existed (based on when it was created).
function friendsFor(sinceMs?: number | null): ReactNode {
  if (!sinceMs) return null
  const days = Math.floor((Date.now() - sinceMs) / 86_400_000)
  let label: string
  if (days < 1) label = 'Friends since today'
  else if (days < 30) label = `Friends for ${days} day${days === 1 ? '' : 's'}`
  else {
    const months = Math.floor(days / 30)
    if (months < 12) label = `Friends for ${months} month${months === 1 ? '' : 's'}`
    else {
      const years = Math.floor(days / 365)
      const rem = Math.floor((days - years * 365) / 30)
      label = rem > 0 ? `Friends for ${years}y ${rem}mo` : `Friends for ${years} year${years === 1 ? '' : 's'}`
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {label}
    </span>
  )
}
