import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Loader } from '../components/ui/Loader'
import { Reveal } from '../components/ui/Reveal'
import { SectionLabel } from '../components/ui/SectionLabel'
import { roomApi, friendApi, matchApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useStomp } from '../hooks/useStomp'
import { useLenisBox } from '../hooks/useLenisBox'
import type Lenis from 'lenis'
import type { FriendData, RoomChatData, RoomData, RoomEventData } from '../types'

// Cool host marker — a small gold crown that sits above the host's avatar.
function HostCrown() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      className="absolute -top-3 left-1/2 -translate-x-1/2 text-gold drop-shadow"
      fill="currentColor"
      aria-label="Host"
    >
      <path d="M6 16 4 8 8.5 11 12 6 15.5 11 20 8 18 16Z" />
    </svg>
  )
}

/**
 * The persistent room lobby. It outlives matches: the host starts a match (everyone jumps to the
 * arena), it finishes, players come back here, and the host can start another. Subscribes to the
 * room topic for roster changes, match starts, and room closure.
 */
export function RoomPage() {
  const { roomId: roomIdParam } = useParams()
  const roomId = Number(roomIdParam)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { subscribe, publish, connected } = useStomp()

  const [room, setRoom] = useState<RoomData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [closed, setClosed] = useState(false)
  // True when a match is running that I'm not in (I forfeited it) — I wait in the lobby for it to end.
  const [waitingForMatch, setWaitingForMatch] = useState(false)

  const [friends, setFriends] = useState<FriendData[]>([])
  const [inviteSent, setInviteSent] = useState<Set<number>>(new Set())
  const [inviting, setInviting] = useState<number | null>(null)

  const [chat, setChat] = useState<RoomChatData[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatLenis = useRef<Lenis | null>(null)
  // First fill jumps to the latest; after that we only auto-follow if you're already near the bottom.
  const chatInitedRef = useRef(false)

  const seatRowRef = useRef<HTMLDivElement>(null)
  // Seat positions are stored RELATIVE TO THE SEAT ROW (not the viewport), so page scroll or layout
  // shifts elsewhere on the page don't contaminate the FLIP delta.
  const prevRects = useRef<Map<string, { left: number; top: number }>>(new Map())
  // True once WE choose to leave — suppresses room events (e.g. our own leave closing the room) so
  // we don't flash the "closed" screen on the way out.
  const leavingRef = useRef(false)

  // Decide what to render for a freshly-loaded room: jump into the active match if I'm still a live
  // player, wait in the lobby if I forfeited it, or show the normal lobby when nothing's running.
  async function resolveRoom(data: RoomData) {
    if (data.activeMatchId) {
      try {
        const match = await matchApi.get(data.activeMatchId)
        const mine = match.participants.find((p) => p.userId === user?.id)
        if (mine && !mine.forfeit) {
          navigate(`/match/${data.activeMatchId}`)
          return
        }
      } catch {
        // can't read the match — keep the player waiting in the lobby
      }
      setRoom(data)
      setWaitingForMatch(true)
      return
    }
    setRoom(data)
    setWaitingForMatch(false)
  }

  // resolveRoom closes over `user` (and navigate); the room/reconnect subscriptions are keyed only by
  // roomId, so if `user` resolves AFTER they first run they'd keep routing with user===undefined and
  // park a live player in waitingForMatch. Route every async caller through a ref that always holds the
  // latest resolveRoom (same pattern as useMatchSocket's onEvent ref) — no resubscribe churn.
  const resolveRoomRef = useRef(resolveRoom)
  resolveRoomRef.current = resolveRoom

  // ---- load ----
  useEffect(() => {
    let activeLoad = true
    // Reset per-room state so switching rooms (e.g. accepting an invite while on a closed room's
    // screen) shows the new room, not the previous one's closed/error/waiting state.
    setClosed(false)
    setWaitingForMatch(false)
    setError(null)
    setLoading(true)
    roomApi
      .get(roomId)
      .then((data) => {
        if (activeLoad) void resolveRoomRef.current(data)
      })
      .catch((e) => activeLoad && setError(e instanceof Error ? e.message : 'Failed to load room'))
      .finally(() => activeLoad && setLoading(false))
    void friendApi.list().then((f) => activeLoad && setFriends(f)).catch(() => {})
    return () => {
      activeLoad = false
    }
    // Re-run on location.key too: navigating to /room/X while already on /room/X (e.g. accepting a
    // re-invite to the room you're viewing as a non-member) keeps the same roomId, so without this
    // the load never re-fires and the stale "not a member" error sticks until a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, location.key])

  // ---- room topic (on the shared socket): roster changes, match start, room close ----
  useEffect(() => {
    return subscribe(`/topic/room/${roomId}`, (body) => {
      if (leavingRef.current) return // we're on our way out — ignore our own leave's events
      try {
        const e = JSON.parse(body) as RoomEventData
        if (e.type === 'ROSTER_CHANGED') {
          void roomApi.get(roomId).then((d) => resolveRoomRef.current(d)).catch(() => {})
        } else if (e.type === 'MATCH_STARTED' && e.matchId) {
          navigate(`/match/${e.matchId}`)
        } else if (e.type === 'ROOM_CLOSED') {
          // Don't yank them away silently — show the closed screen so they know what happened.
          setClosed(true)
        }
      } catch {
        // ignore malformed frames
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // ---- reconnect catch-up: /topic is fire-and-forget with no replay, so a ROSTER_CHANGED published
  // while our socket was briefly down (e.g. someone readied up during a blip) is lost forever and the
  // roster only fixes itself on a manual refresh. Re-fetch the room on every RE-connect so it self-heals.
  const hadConnectedRef = useRef(false)
  useEffect(() => {
    if (!connected) return
    if (hadConnectedRef.current && !leavingRef.current) {
      void roomApi.get(roomId).then((d) => resolveRoomRef.current(d)).catch(() => {})
    }
    hadConnectedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, roomId])

  // ---- lobby chat (members only): hydrate recent history + live updates on the chat sub-topic ----
  useEffect(() => {
    let activeChat = true
    roomApi.chat(roomId).then((c) => activeChat && setChat(c)).catch(() => {})
    const unsub = subscribe(`/topic/room/${roomId}/chat`, (body) => {
      try {
        const m = JSON.parse(body) as RoomChatData
        setChat((prev) => [...prev, m])
      } catch {
        // ignore malformed frames
      }
    })
    return () => {
      activeChat = false
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Momentum smooth-scroll for the chat box (matches the DM thread + the rest of the site).
  useLenisBox(chatScrollRef, [chat.length], chatLenis)

  // Keep the latest line in view via Lenis (smooth) — falls back to native if Lenis is off (reduced
  // motion). On first fill, jump to the bottom; afterwards only follow if you're already near it.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const lenis = chatLenis.current
    const toBottom = (immediate: boolean) => {
      if (lenis) {
        lenis.resize()
        lenis.scrollTo(el.scrollHeight, immediate ? { immediate: true } : {})
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
    if (!chatInitedRef.current) {
      toBottom(true)
      if (chat.length > 0) chatInitedRef.current = true
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) toBottom(false)
  }, [chat])

  function sendChat() {
    const text = chatInput.trim()
    if (!text) return
    // The broadcast echoes back to us via the topic, so no optimistic append — it arrives live.
    publish(`/app/chat/room/${roomId}`, text)
    setChatInput('')
  }

  // While waiting out a match I forfeited, poll for it to finish so the lobby reopens for a rematch.
  useEffect(() => {
    if (!waitingForMatch) return
    const t = setInterval(() => {
      void roomApi.get(roomId).then((d) => resolveRoomRef.current(d)).catch(() => {})
    }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForMatch, roomId])

  const participants = room?.participants ?? []
  const participantIds = participants.map((p) => p.userId).join(',')

  // Once a friend joins, their invite is consumed — drop the local "Invited ✓" flag so the host can
  // invite them again if they later leave.
  useEffect(() => {
    setInviteSent((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      for (const p of participants) next.delete(p.userId)
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantIds])

  // FLIP: slide seats to their new (centered) positions when the roster changes; fade-scale newcomers in.
  useLayoutEffect(() => {
    const row = seatRowRef.current
    if (!row) return
    const rowRect = row.getBoundingClientRect()
    const seats = Array.from(row.querySelectorAll<HTMLElement>('[data-seat]'))
    const next = new Map<string, { left: number; top: number }>()
    for (const seat of seats) {
      const id = seat.dataset.seat!
      const r = seat.getBoundingClientRect()
      // Relative to the row, so a scrolled/reflowed page can't fake a vertical delta.
      const pos = { left: r.left - rowRect.left, top: r.top - rowRect.top }
      next.set(id, pos)
      const prev = prevRects.current.get(id)
      if (prev) {
        const dx = prev.left - pos.left
        const dy = prev.top - pos.top
        if (dx || dy) {
          seat.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          )
        }
      } else {
        // Fade in to the seat's actual opacity (dimmed if not ready) so a not-ready newcomer
        // doesn't flash full-brightness and snap to 40%.
        const targetOpacity = getComputedStyle(seat).opacity
        seat.animate(
          [
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: targetOpacity, transform: 'scale(1)' },
          ],
          { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        )
      }
    }
    prevRects.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantIds])

  async function handleStart() {
    try {
      const data = await roomApi.start(roomId)
      if (data.activeMatchId) navigate(`/match/${data.activeMatchId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start failed')
    }
  }

  async function handleReady(ready: boolean) {
    try {
      setRoom(await roomApi.ready(roomId, ready))
    } catch {
      void syncRoom() // room may have closed — re-sync so the user finds out
    }
  }

  function handleLeave() {
    // Go home immediately so the person leaving never sees the "room closed" screen — leaving as the
    // host/last member closes the room, which would otherwise fire ROOM_CLOSED back to us before the
    // redirect. The leave request finishes in the background.
    leavingRef.current = true
    void roomApi.leave(roomId).catch(() => {})
    navigate('/', { replace: true })
  }

  // Re-sync after a failed action (e.g. the room closed underneath us): refresh the room so the
  // closed-room screen shows, or head home if we're no longer in it.
  async function syncRoom() {
    try {
      setRoom(await roomApi.get(roomId))
    } catch {
      navigate('/')
    }
  }

  async function handleInvite(friendId: number) {
    setInviting(friendId)
    try {
      await roomApi.invite(roomId, friendId)
      setInviteSent((prev) => new Set([...prev, friendId]))
      // Show ✓ briefly, then revert so the host can re-invite (re-sending is idempotent).
      setTimeout(() => {
        setInviteSent((prev) => {
          const next = new Set(prev)
          next.delete(friendId)
          return next
        })
      }, 4000)
    } catch {
      void syncRoom() // invite failed (e.g. room closed) — re-sync so the user finds out
    } finally {
      setInviting(null)
    }
  }

  // ---- render ----
  if (loading) {
    return (
      <div className="mt-10">
        <Card className="grid place-items-center py-16">
          <Loader label="Loading room" />
        </Card>
      </div>
    )
  }

  // The room was closed (host left, or it emptied out) — show a clear screen, not a dead lobby.
  if (closed || room?.state === 'CLOSED') {
    return (
      <Reveal>
        <div className="mt-16 flex justify-center">
          <Card className="w-full max-w-md text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Room closed
            </div>
            <h1 className="mt-2 font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
              This room has closed
            </h1>
            <p className="mt-2 text-ink-soft">
              The host ended it. Start a fresh room or jump into a duel from home.
            </p>
            <Button className="mt-6" onClick={() => navigate('/')}>
              Back home
            </Button>
          </Card>
        </div>
      </Reveal>
    )
  }

  if (error || !room) {
    return (
      <div className="mt-10">
        <Card>
          <p className="font-mono text-sm text-accent">{error ?? 'Room not found'}</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/')}>
            Back home
          </Button>
        </Card>
      </div>
    )
  }

  if (!participants.some((p) => p.userId === user?.id)) {
    return (
      <div className="mt-10">
        <Card>
          <p className="text-ink-soft">You are not in this room.</p>
        </Card>
      </div>
    )
  }

  // I forfeited the running match — wait here (still a member) until it ends, then rematch.
  if (waitingForMatch) {
    return (
      <Reveal>
        <div className="mt-16 flex justify-center">
          <Card className="w-full max-w-md text-center">
            <Loader label="Match in progress" />
            <p className="mt-4 font-display text-[20px] font-bold">You're out of this round</p>
            <p className="mt-2 text-ink-soft">
              You forfeited — you'll rejoin everyone the moment this match wraps up.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {room.activeMatchId && (
                <Button onClick={() => navigate(`/match/${room.activeMatchId}`)}>Watch match</Button>
              )}
              <Button variant="secondary" onClick={handleLeave}>
                Leave room
              </Button>
            </div>
          </Card>
        </div>
      </Reveal>
    )
  }

  const me = participants.find((p) => p.userId === user?.id)
  const nonHostMembers = participants.filter((p) => !p.host)
  const everyoneReady = nonHostMembers.length > 0 && nonHostMembers.every((p) => p.ready)
  const canStart = room.host && participants.length >= 2 && everyoneReady
  const needed = Math.max(0, 2 - participants.length)
  const openSeats = Math.max(0, room.maxPlayers - participants.length)
  const uninvitedFriends = friends.filter(
    (f) => !participants.some((p) => p.userId === f.userId),
  )

  return (
    <Reveal>
      <div className="mt-10 [@media(max-height:780px)]:mt-6">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent [@media(max-height:780px)]:hidden">
          {/* live pulse — the room is open and waiting */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Private room · #{roomId}
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[52px] lg:leading-none [@media(max-height:780px)]:!text-[24px] [@media(max-height:780px)]:!leading-tight">
          The lobby
        </h1>
        <p className="mt-4 max-w-xl text-ink-soft [@media(max-height:780px)]:hidden">
          {room.host
            ? 'Pull in your friends and hit start when you’re ready'
            : 'You’re in. Sit tight — the host drops everyone into the problem at the same moment.'}
        </p>

        {/* lobby grid — players + invite on the left, chat alongside on the right (all in view) */}
        <div className="mt-8 grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-[22px]">
            {/* seats — the room filling up */}
            <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Players</SectionLabel>
            <span className="font-mono text-[11px] text-ink-soft">
              {participants.length} / {room.maxPlayers}
            </span>
          </div>

          <div ref={seatRowRef} className="mt-6 flex flex-wrap justify-center gap-x-7 gap-y-6">
            {participants.map((p) => {
              const you = p.userId === user?.id
              const notReady = !p.host && !p.ready
              return (
                <div
                  key={p.userId}
                  data-seat={p.userId}
                  className={`flex w-[80px] flex-col items-center gap-2 text-center transition-opacity ${
                    notReady ? 'opacity-40' : ''
                  }`}
                >
                  <div className="relative">
                    {p.host && <HostCrown />}
                    <Avatar
                      initial={(p.displayName ?? '?').charAt(0).toUpperCase()}
                      src={p.avatarUrl}
                      size={60}
                      className={
                        p.host
                          ? 'ring-2 ring-gold/70'
                          : p.ready
                            ? 'ring-2 ring-accent-2/70'
                            : you
                              ? 'ring-2 ring-accent/50'
                              : ''
                      }
                    />
                    {/* ready check for non-host members */}
                    {!p.host && p.ready && (
                      <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-accent-2 text-[10px] font-bold text-white ring-2 ring-paper-2">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className="w-full truncate text-[12px] font-semibold">
                    {you ? 'You' : p.displayName ?? 'player'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* action bar */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {room.host ? (
              <Button onClick={handleStart} disabled={!canStart} className={canStart ? 'attract' : ''}>
                {needed > 0
                  ? `Need ${needed} more player${needed === 1 ? '' : 's'}`
                  : everyoneReady
                    ? 'Start match'
                    : 'Waiting for players to ready up…'}
              </Button>
            ) : (
              <Button
                onClick={() => handleReady(!(me?.ready ?? false))}
                variant={me?.ready ? 'secondary' : 'primary'}
                className={me?.ready ? '' : 'attract'}
              >
                {me?.ready ? 'Not ready' : 'Ready up'}
              </Button>
            )}
            <Button variant="secondary" onClick={handleLeave} className="ml-auto">
              Leave
            </Button>
          </div>
        </Card>

            {/* invite friends — any member can pull people in, not just the host */}
            {openSeats > 0 && (
              <Card>
                <SectionLabel>Invite friends</SectionLabel>
            {uninvitedFriends.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-soft">
                {friends.length === 0
                  ? 'No friends yet — add some from the Friends page.'
                  : 'Everyone’s already here.'}
              </p>
            ) : (
              <div
                data-lenis-prevent
                className="no-scrollbar mt-3.5 flex max-h-[184px] flex-wrap gap-2 overflow-y-auto"
              >
                {uninvitedFriends.map((f) => {
                  const sent = inviteSent.has(f.userId)
                  const loading = inviting === f.userId
                  return (
                    <button
                      key={f.userId}
                      type="button"
                      title={sent ? 'Invited' : `Invite ${f.displayName ?? 'player'}`}
                      disabled={sent || loading}
                      onClick={() => handleInvite(f.userId)}
                      className="group flex items-center gap-2.5 rounded-full border border-line bg-paper py-1.5 pl-1.5 pr-3 transition hover:border-accent hover:bg-paper-2 disabled:opacity-70 disabled:hover:border-line disabled:hover:bg-paper"
                    >
                      <Avatar
                        initial={(f.displayName ?? '?').charAt(0).toUpperCase()}
                        src={f.avatarUrl}
                        size={30}
                      />
                      <span className="max-w-[140px] truncate text-[13px] font-semibold">
                        {f.displayName ?? 'player'}
                      </span>
                      <span className="grid h-5 w-5 place-items-center font-mono text-[15px] leading-none">
                        {sent ? (
                          <span className="text-accent-2">✓</span>
                        ) : loading ? (
                          <span className="text-ink-soft">…</span>
                        ) : (
                          <span className="text-ink-soft transition group-hover:text-accent">+</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
              </Card>
            )}
          </div>

          {/* right column — lobby chat lives alongside, full-height (no scrolling to find it).
              Ephemeral, members only; there's deliberately no chat during the actual match. */}
          <Card className="flex min-h-0 flex-col">
            <SectionLabel>Lobby chat</SectionLabel>
            {/* premium fade hairline — no harsh edge-to-edge rule */}
            <div className="mt-3 h-px bg-gradient-to-r from-transparent via-line to-transparent" />

            <div
              ref={chatScrollRef}
              data-lenis-prevent
              className="no-scrollbar mt-3 h-[280px] overflow-y-auto pr-1 lg:h-[52vh]"
            >
              <div className="flex min-h-full flex-col space-y-2.5">
              {chat.length === 0 ? (
                <div className="grid flex-1 place-items-center px-6 text-center">
                  <div>
                    <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-line bg-paper text-ink-soft">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
                      </svg>
                    </div>
                    <p className="text-[13px] text-ink-soft">No messages yet — say hello to the lobby.</p>
                  </div>
                </div>
              ) : (
                chat.map((m, i) => {
                  const mine = m.senderId === user?.id
                  const time = m.createdAtMs
                    ? new Date(m.createdAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ''
                  return (
                    <div
                      key={`${m.createdAtMs}-${m.senderId}-${i}`}
                      className={`animate-reveal flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!mine && (
                        <Avatar
                          initial={(m.senderName ?? '?').charAt(0).toUpperCase()}
                          src={m.senderAvatarUrl}
                          size={26}
                        />
                      )}
                      <div
                        title={time}
                        className={`max-w-[78%] whitespace-pre-wrap break-words px-3.5 py-2 text-[13px] leading-snug shadow-sm ${
                          mine
                            ? 'rounded-2xl rounded-br-md bg-accent text-white'
                            : 'rounded-2xl rounded-bl-md border border-line bg-paper-2 text-ink'
                        }`}
                      >
                        {!mine && (
                          <div className="mb-0.5 text-[11px] font-semibold text-accent-2">
                            {m.senderName ?? 'player'}
                          </div>
                        )}
                        {m.body}
                      </div>
                    </div>
                  )
                })
              )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    sendChat()
                  }
                }}
                placeholder="Message the lobby…"
                className="flex-1 rounded-2xl border border-line bg-paper px-3.5 py-2.5 text-[13.5px] outline-none transition focus:border-accent"
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim()}
                aria-label="Send"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white transition active:scale-90 disabled:opacity-40"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 20V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </Reveal>
  )
}
