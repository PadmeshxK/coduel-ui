import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Reveal } from '../components/ui/Reveal'
import { Loader } from '../components/ui/Loader'
import { friendApi, userApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import type { FriendData, FriendRequestData } from '../types'

export function Friends() {
  const { user } = useAuth()
  const { notifyFriendsChanged, friendsVersion } = useNotifications()

  const [friends, setFriends] = useState<FriendData[]>([])
  const [requests, setRequests] = useState<FriendRequestData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FriendData[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [sentTo, setSentTo] = useState<number[]>([])
  const [busy, setBusy] = useState<number | null>(null)

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

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mb-8 mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">● Friends</div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none">
          Your circle
        </h1>
        <p className="mt-4 text-ink-soft">Add friends, then challenge them to a private room.</p>
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
                  const already = friendIds.has(u.userId)
                  const sent = sentTo.includes(u.userId)
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
                {friends.map((f, i) => (
                  <Row key={f.userId} person={f} first={i === 0}>
                    <Button size="sm" variant="secondary" disabled={busy === f.userId} onClick={() => act(f.userId, async () => { await friendApi.unfriend(f.userId); notifyFriendsChanged() })}>
                      Remove
                    </Button>
                  </Row>
                ))}
              </Card>
            )}
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
  children,
}: {
  person: FriendData
  first: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex items-center gap-4 px-[22px] py-4 ${first ? '' : 'border-t border-line'}`}>
      <Avatar initial={(person.displayName ?? '?').charAt(0).toUpperCase()} src={person.avatarUrl} size={40} />
      <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">
        {person.displayName ?? 'Unknown'}
      </span>
      {children}
    </div>
  )
}
