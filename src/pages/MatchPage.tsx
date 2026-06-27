import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Collapsible } from '../components/ui/Collapsible'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { CodeEditor } from '../components/editor/CodeEditor'
import { ConfettiCannon } from '../components/ui/ConfettiCannon'
import { ProblemStatement } from '../components/ui/ProblemStatement'
import { Loader } from '../components/ui/Loader'
import { matchApi, problemApi, submissionApi } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { useLenisBox } from '../hooks/useLenisBox'
import { useMatchSocket } from '../hooks/useMatchSocket'
import { useAuth } from '../hooks/useAuth'
import { VERDICT_LABEL, verdictTone } from '../lib/verdict'
import { FILE_EXT } from '../lib/languages'
import type { Language, MatchEndReason, MatchEventData, Verdict } from '../types'

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// How long the finish screen lingers before auto-returning (home for duels, lobby for rooms).
// Stays under the 30s lobby-presence grace so a returning room player is never kicked en route.
const MATCH_RETURN_MS = 15_000

interface Progress {
  passed: number | null
  total: number | null
  verdict: Verdict | null
}
interface FeedEntry {
  t: string
  who: string
  text: string
  tone: string
}

export function MatchPage() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, loading, error } = useAsync(async () => {
    const match = await matchApi.get(matchId!)
    const problem = await problemApi.getBySlug(match.slug)
    return { match, problem }
  }, [matchId])

  // This same arena serves matchmaking duels and private-room games; roomId distinguishes them.
  const isRoom = data?.match.roomId != null

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState<Language>('PYTHON')
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // live match state
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const [forfeited, setForfeited] = useState<Set<number>>(new Set())
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [winnerUserId, setWinnerUserId] = useState<number | null>(null)
  const [endReason, setEndReason] = useState<MatchEndReason | null>(null)
  const [ended, setEnded] = useState(false)
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  const [forfeiting, setForfeiting] = useState(false)
  // I forfeited but stay to spectate — editor disabled, can watch and leave when I want.
  const [iForfeited, setIForfeited] = useState(false)

  // Pre-match countdown: duels start it once both players are present (MATCH_READY); room games
  // start it as soon as the match loads (everyone already readied up in the lobby). Then a 3-2-1.
  useEffect(() => {
    if ((!ready && !isRoom) || started || ended) return
    setCountdown(3)
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null
        if (c <= 1) {
          clearInterval(id) // reached 0 → stop ticking (it otherwise fired every 1s forever)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [ready, isRoom, started, ended])

  useEffect(() => {
    if (countdown === 0) setStarted(true)
  }, [countdown])

  // Elapsed is anchored to the match's server start (match.createdAt → startedAtMs), so it survives
  // a refresh and reads identically for both players — never a client counter from mount.
  const startedAtMs = data?.match.startedAtMs ?? null
  const endedAtMs = data?.match.endedAtMs ?? null
  const startedAtRef = useRef<number | null>(null)
  startedAtRef.current = startedAtMs
  const elapsedAt = () => {
    const start = startedAtRef.current
    return start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0
  }

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAtMs) return
    const compute = () =>
      setElapsed(Math.max(0, Math.floor(((endedAtMs ?? Date.now()) - startedAtMs) / 1000)))
    compute()
    if (ended) return // freeze once the match is over
    const t = setInterval(compute, 1000)
    return () => clearInterval(t)
  }, [startedAtMs, endedAtMs, ended])

  useEffect(() => {
    if (!data?.match) return
    setWinnerUserId(data.match.winnerUserId)
    // Seed forfeited players from the server so a refresh still shows who's dropped out.
    setForfeited(new Set(data.match.participants.filter((p) => p.forfeit).map((p) => p.userId)))
    // If I'm already forfeited (refresh / direct URL), drop into spectate mode.
    if (data.match.participants.find((p) => p.userId === user?.id)?.forfeit) setIForfeited(true)
    const over = data.match.state !== 'ACTIVE'
    setEnded(over)
    // Reload of a match whose pre-match intro already played this session → skip straight to the
    // editor (a reconnect re-fires MATCH_READY, which would otherwise replay the countdown).
    if (!over && matchId && sessionStorage.getItem(`coduel-match-intro-${matchId}`)) {
      setStarted(true)
    }
  }, [data, matchId])

  // Once the match has started, remember it so a reload doesn't replay the intro.
  useEffect(() => {
    if (started && matchId) sessionStorage.setItem(`coduel-match-intro-${matchId}`, '1')
  }, [started, matchId])

  const participants = data?.match.participants ?? []
  const me = participants.find((p) => p.userId === user?.id)
  const opponent = participants.find((p) => p.userId !== user?.id)
  const opponentName = opponent?.displayName ?? 'your opponent'
  const nameFor = (id: number) =>
    participants.find((p) => p.userId === id)?.displayName ?? 'player'

  // "Back to lobby" returns room games to their room; matchmaking duels go home. roomId is read via a
  // ref so the match-end timer always uses the latest value — a terminal state can arrive before
  // useAsync resolves `data`, and a stale closure would send a room game home instead of to its room.
  const roomIdRef = useRef<number | null>(null)
  roomIdRef.current = data?.match.roomId ?? null
  const backToLobby = () =>
    navigate(roomIdRef.current != null ? `/room/${roomIdRef.current}` : '/', { replace: true })

  const youWon = ended && winnerUserId != null && winnerUserId === user?.id

  const solvedLines = [
          'You cracked it first. Clean win.',
          'First correct submission. Nobody came close.',
          'Sharp solve — they were still thinking.',
          'You saw the answer. They were still reading.',
          'Decisive. No second place today.',
          'One and done. That\'s how you do it.',
          'You got there. That\'s all that matters.',
          'Outthought and outpaced. Textbook.',
          'They had the same problem. You had the better mind.',
          'Fast and correct. The only combo that counts.',
          'While they debugged, you submitted.',
          'First to finish. Last to doubt yourself.',
          'Clean solution. Cleaner execution.',
          'You didn\'t just solve it — you solved it first.',
          'The problem picked the wrong opponent.',
          'No hints. No luck. Just you.',
          'Flawless run. All tests green.',
          'They blinked. You shipped.',
          'Logic locked in. Problem locked out.',
          'You made it look easy.',
          'Efficiency: peak. Result: gold.',
          'That\'s what preparation looks like.',
          'Read it, solved it, submitted. Done.',
          'They\'re still typing. You\'re already here.',
          'No hesitation. No mercy.',
          'First blood. Match sealed.',
          'You saw the pattern before the problem finished loading.',
          'Dominant. No other word for it.',
          'One correct submission is all it takes. You knew that.',
          'They had time. You had answers.',
          'Problem met its match — and lost.',
          'Your code ran. Theirs didn\'t matter.',
          'Zero edge cases missed. Zero competition.',
          'All tests passed. All rivals passed over.',
          'You solved it like you\'d seen it before.',
          'The scoreboard never had a chance to get close.',
          'Faster to the finish line than anyone expected.',
          'Some people find the trick. You were the trick.',
          'Methodical. Precise. First.',
          'The gap between you and second? Decisive.',
          'Every second counted. You used them better.',
          'You kept your cool and they kept their wrong answer.',
          'Built different. Proved today.',
          'No noise. No panic. Just a correct solution.',
          'They had the same shot. You took yours.',
          'Pressure sharpens some people. You\'re one of them.',
          'Turned a hard problem into a closed match.',
          'That solve had your name on it from the start.',
          'W. No further comments.',
  ]

  // Pick once when the match ends — useMemo with [ended] so it never re-rolls on re-renders
  // (returnIn ticks every second, which would otherwise cycle through the list).
  const solvedSubtitle = useMemo(
    () => solvedLines[Math.floor(Math.random() * solvedLines.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ended],
  )

  const winReasonSubtitle = () => {
    switch (endReason) {
      case 'SOLVED':           return solvedSubtitle
      case 'OPPONENT_FORFEIT': return 'Your opponent tapped out. Still your win.'
      case 'OPPONENT_NO_SHOW': return 'They never showed. Walkover, but a win is a win.'
      default:                 return 'Well played.'
    }
  }


  function handleEvent(e: MatchEventData) {
    if (e.type === 'MATCH_READY') {
      setReady(true)
      return
    }
    if (e.type === 'SUBMISSION_JUDGED' && e.userId != null) {
      const userId = e.userId
      setProgress((prev) => ({
        ...prev,
        [userId]: {
          passed: e.passedTests ?? null,
          total: e.totalTests ?? null,
          verdict: e.verdict ?? null,
        },
      }))
      setFeed((f) =>
        [
          {
            t: fmt(elapsedAt()),
            who: nameFor(userId),
            text: `▸ ${e.verdict ? VERDICT_LABEL[e.verdict] : 'submitted'}`,
            tone: verdictTone(e.verdict ?? null),
          },
          ...f,
        ].slice(0, 40),
      )
      if (userId === user?.id) setSubmitMsg(null)
    } else if (e.type === 'PLAYER_FORFEIT' && e.userId != null) {
      const userId = e.userId
      setForfeited((prev) => new Set(prev).add(userId))
      setFeed((f) =>
        [{ t: fmt(elapsedAt()), who: nameFor(userId), text: '▸ forfeited', tone: 'text-accent' }, ...f],
      )
    } else if (e.type === 'MATCH_OVER') {
      setWinnerUserId(e.winnerUserId ?? null)
      setEndReason(e.endReason ?? null)
      setEnded(true)
      setFeed((f) =>
        [{ t: fmt(elapsedAt()), who: '', text: '▸ match over', tone: 'text-gold' }, ...f],
      )
    }
  }

  const { connected } = useMatchSocket(matchId, handleEvent)

  // Catch-up after a WS reconnect: /topic is pub/sub with no replay, so anything published while we
  // were dropped (notably MATCH_OVER) is lost. Re-read the authoritative match from the DB on the
  // reconnect edge and reconcile the terminal state, so a blip can't strand us on the duel screen.
  // (MatchData carries no live per-player progress, so the bars self-heal on the next event.)
  const hadConnected = useRef(false)
  useEffect(() => {
    if (!matchId || !connected) return
    if (hadConnected.current) {
      void matchApi
        .get(matchId)
        .then((m) => {
          setWinnerUserId(m.winnerUserId)
          setForfeited(new Set(m.participants.filter((p) => p.forfeit).map((p) => p.userId)))
          if (m.state !== 'ACTIVE') setEnded(true)
        })
        .catch(() => {})
    }
    hadConnected.current = true
  }, [connected, matchId])

  const matchOver = ended

  // Momentum smooth-scroll for the live left panel, matching the rest of the site. Re-measures when
  // the arena mounts (started/over) so Lenis attaches once the scroller is actually on screen.
  const problemScrollRef = useRef<HTMLDivElement>(null)
  useLenisBox(problemScrollRef, [data?.match.matchId, started, matchOver])

  // When the match ends, let the result sit (enough to savour a win), then return everyone to where
  // they belong — home for duels, the room lobby for room games. A visible countdown ticks it down;
  // the manual button is there for anyone who wants to leave sooner.
  const [returnIn, setReturnIn] = useState(0)
  useEffect(() => {
    if (!matchOver) return
    setReturnIn(Math.round(MATCH_RETURN_MS / 1000))
    const tick = setInterval(() => setReturnIn((s) => (s <= 1 ? 0 : s - 1)), 1000)
    const t = setTimeout(backToLobby, MATCH_RETURN_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchOver])

  // Match-finish banner copy, chosen from the end reason + whether you're the winner / loser /
  // neither. Falls back to a generic line on reload (GET /match carries no end reason).
  const matchOverMessage = (): { text: string; tone: string } => {
    const youWon = winnerUserId != null && winnerUserId === user?.id
    switch (endReason) {
      case 'SOLVED':
        return youWon
          ? { text: '🏆 You won — first to solve it!', tone: 'text-accent-2' }
          : { text: `${winnerUserId != null ? nameFor(winnerUserId) : 'Someone'} solved it first.`, tone: 'text-accent' }
      case 'OPPONENT_FORFEIT':
        return youWon
          ? { text: '🏆 You won — everyone else dropped out.', tone: 'text-accent-2' }
          : { text: 'You left the match — better luck next time.', tone: 'text-accent' }
      case 'OPPONENT_NO_SHOW':
        return youWon
          ? { text: '🏆 Walkover — your opponent never showed.', tone: 'text-accent-2' }
          : { text: `${opponentName} won by walkover.`, tone: 'text-accent' }
      case 'NO_SHOW_VOID':
        return { text: '⏱ Match voided — nobody showed up.', tone: 'text-gold' }
      case 'TIMEOUT':
        return { text: '⏱ Match expired — time ran out, no winner.', tone: 'text-gold' }
      default:
        if (winnerUserId == null) return { text: '⏱ Match over — no winner.', tone: 'text-gold' }
        return youWon
          ? { text: '🏆 You won the match!', tone: 'text-accent-2' }
          : { text: `${nameFor(winnerUserId)} won the match.`, tone: 'text-accent' }
    }
  }

  async function handleForfeit() {
    setForfeiting(true)
    try {
      await matchApi.forfeit(matchId!)
      // Stay and spectate — the editor disables, but you can watch the rest and see who wins, then
      // leave (or the match-over flow returns everyone) on your terms.
      setIForfeited(true)
      setConfirmForfeit(false)
    } catch {
      // ignore — surfaced by the disabled state / next event
    } finally {
      setForfeiting(false)
    }
  }

  async function handleSubmit() {
    if (!data) return
    setSubmitError(null)
    setSubmitMsg('Processing…')
    try {
      const created = await submissionApi.create({
        problemId: data.problem.id,
        matchId: Number(matchId),
        language,
        sourceCode: code,
      })
      // Poll our own submission as a reliable fallback: the WS event also updates the scoreboard,
      // but if judging errors or that one event is missed, this surfaces the result instead of hanging.
      let latest = created
      // Poll past the consumer retry window so a failed judge surfaces as INTERNAL_ERROR
      // (pushed once the message is dead-lettered) rather than hanging on "judging…".
      for (let i = 0; i < 30 && latest.verdict === 'PENDING'; i++) {
        await sleep(1000)
        latest = await submissionApi.get(created.submissionId)
      }
      if (latest.verdict === 'PENDING') {
        setSubmitMsg('Still processing — taking longer than expected.')
      } else {
        if (user) {
          setProgress((prev) => ({
            ...prev,
            [user.id]: {
              passed: latest.passedTests,
              total: latest.totalTests,
              verdict: latest.verdict,
            },
          }))
        }
        setSubmitMsg(latest.verdict === 'INTERNAL_ERROR' ? 'Something went wrong — please try again.' : null)
      }
    } catch (e) {
      setSubmitMsg(null)
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    }
  }

  const submitView = submitError ? (
    <div className="text-[#cf6b54]">error: {submitError}</div>
  ) : (
    <div className="text-[#8a7c66]">{submitMsg ?? 'submitted — result on the scoreboard.'}</div>
  )

  return (
    <div className="flex min-h-full flex-col gap-4 lg:h-full">
      {/* title row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[12px] text-ink-soft">
            <span className="text-accent-2">coduel</span>:
            <span className="text-accent">~/{isRoom ? 'room' : 'duel'}/{data?.match.slug ?? matchId}</span> $
          </div>
          <h1 className="mt-1.5 font-display text-[22px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[26px] lg:text-[30px] lg:leading-none">
            {loading ? 'Loading…' : (data?.match.problemTitle ?? 'Duel')}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {iForfeited && !matchOver && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                ⚑ Forfeited · spectating
              </span>
              <Button variant="secondary" size="sm" onClick={backToLobby}>
                Back to lobby
              </Button>
            </div>
          )}
          {started && !matchOver && !iForfeited && (
            <div className="relative">
              <button
                onClick={() => setConfirmForfeit((o) => !o)}
                title="Leave the match — you forfeit"
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 px-3.5 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-accent transition hover:bg-accent/10"
              >
                ⚑ Forfeit
              </button>

              {confirmForfeit && (
                <>
                  {/* click-away backdrop */}
                  <button
                    aria-hidden
                    onClick={() => setConfirmForfeit(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="reflective animate-reveal absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-accent/30 bg-paper-2 p-4 text-left shadow-[0_18px_44px_-18px_rgba(158,59,42,0.5)]">
                    <p className="font-display text-[16px] font-bold">Forfeit the match?</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                      You'll drop out of this match — this can't be undone.
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setConfirmForfeit(false)}>
                        Keep playing
                      </Button>
                      <Button size="sm" disabled={forfeiting} onClick={handleForfeit}>
                        {forfeiting ? 'Leaving…' : 'Forfeit'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <span
            className={`inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] ${
              connected ? 'text-accent-2' : 'text-ink-soft'
            }`}
          >
            <span
              className={`h-[7px] w-[7px] rounded-full ${connected ? 'animate-pulse bg-accent-2' : 'bg-ink-soft'}`}
            />
            {connected ? 'live' : 'connecting'}
          </span>
          <div className="text-right">
            <div className="font-mono text-[28px] font-medium leading-none tracking-[-0.02em]">
              {fmt(elapsed)}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
              elapsed
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Card>
          <p className="font-mono text-sm text-accent">Couldn't load match: {error}</p>
        </Card>
      )}

      {loading && !data && !error && (
        <div className="grid min-h-0 flex-1 place-items-center">
          <Loader label="Loading duel" />
        </div>
      )}

      {matchOver && (
        <>
          {youWon && <ConfettiCannon />}
          {youWon ? (
            // Win — gold border glow + clean entrance; the confetti does the heavy lifting above.
            <div
              className="animate-win-card reflective rounded-[14px] border border-gold/50 bg-paper-2 p-[22px]"
              style={{
                boxShadow:
                  '0 0 0 1px color-mix(in srgb,var(--color-gold) 10%,transparent),' +
                  '0 4px 24px -8px color-mix(in srgb,var(--color-gold) 18%,transparent)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold">
                    Match over
                  </div>
                  <p className="font-display text-[22px] font-bold text-gold">You won.</p>
                  <p className="mt-1 text-[13px] text-ink-soft">{winReasonSubtitle()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-ink-soft">
                    returning {isRoom ? 'to the lobby' : 'home'} in {returnIn}s
                  </span>
                  <Button variant="secondary" onClick={backToLobby}>
                    {isRoom ? 'Back to lobby' : 'Back home'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Lose — flat card, no fanfare. The asymmetry is the effect.
            <Card className="border-line">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`font-display text-[22px] font-bold ${matchOverMessage().tone}`}>
                  {matchOverMessage().text}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-ink-soft">
                    returning {isRoom ? 'to the lobby' : 'home'} in {returnIn}s
                  </span>
                  <Button variant="secondary" onClick={backToLobby}>
                    {isRoom ? 'Back to lobby' : 'Back home'}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {data && !started && !matchOver && !isRoom && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Card className="animate-reveal w-full max-w-md text-center">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              {ready ? 'Get ready' : 'Match found'}
            </div>
            <h2 className="mt-3 font-display text-[28px] font-extrabold leading-tight">
              {ready ? 'Duel starting' : `Waiting for ${opponentName}…`}
            </h2>
            <p className="mt-2 text-ink-soft">
              {ready
                ? 'Good luck — first correct submission takes it.'
                : "The duel begins the moment you're both here."}
            </p>
            <div className="mt-7 flex items-center justify-center gap-5">
              <div className="flex flex-col items-center gap-2">
                <Avatar
                  initial={(me?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase()}
                  src={me?.avatarUrl ?? user?.avatarUrl}
                  size={52}
                />
                <span className="font-mono text-[11px] text-ink-soft">you</span>
              </div>
              {/* center: a calm "vs" while waiting, a dramatic countdown once both are in */}
              <span
                className={
                  ready
                    ? 'font-display text-[40px] font-extrabold leading-none tabular-nums text-accent'
                    : 'font-display text-[20px] font-bold text-ink-soft'
                }
              >
                {ready ? (countdown && countdown > 0 ? countdown : 'Go') : 'vs'}
              </span>
              {/* opponent dims + pulses while we wait for them to arrive */}
              <div
                className={`flex flex-col items-center gap-2 ${ready ? '' : 'opacity-50 animate-pulse'}`}
              >
                <Avatar
                  initial={(opponent?.displayName ?? '?').charAt(0).toUpperCase()}
                  src={opponent?.avatarUrl}
                  size={52}
                />
                <span className="font-mono text-[11px] text-ink-soft">{opponentName}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* room pre-match: everyone readied in the lobby, so a clean N-player 3-2-1 (no VS framing) */}
      {data && isRoom && !started && !matchOver && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Card className="animate-reveal w-full max-w-md text-center">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Get ready</div>
            <h2 className="mt-3 font-display text-[28px] font-extrabold leading-tight">Match starting</h2>
            <p className="mt-2 text-ink-soft">
              {participants.length} players · first to solve it wins.
            </p>
            <div className="mt-7 font-display text-[56px] font-extrabold leading-none tabular-nums text-accent">
              {countdown && countdown > 0 ? countdown : 'Go'}
            </div>
          </Card>
        </div>
      )}

      {data && (started || matchOver) && (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:grid-rows-none">
          {/* left — scoreboard + problem + feed (the live layer, page-owned) */}
          <div ref={problemScrollRef} className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
            <Card>
              <SectionLabel>Scoreboard</SectionLabel>
              {participants.map((p, i) => {
                const you = p.userId === user?.id
                const pr = progress[p.userId]
                const isOut = forfeited.has(p.userId)
                const pct = pr?.total ? Math.round(((pr.passed ?? 0) / pr.total) * 100) : 0
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center gap-3 py-3 ${
                      i > 0 ? 'border-t border-dashed border-line' : ''
                    } ${isOut ? 'opacity-45' : ''}`}
                  >
                    <Avatar
                      initial={(p.displayName ?? '?').charAt(0).toUpperCase()}
                      src={p.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[15px] font-semibold">
                        <span className={`truncate ${isOut ? 'line-through' : ''}`}>
                          {p.displayName ?? 'player'}
                        </span>
                        {you && (
                          <span className="rounded-[5px] bg-accent px-[7px] py-[2px] font-mono text-[10px] tracking-[0.15em] text-white">
                            YOU
                          </span>
                        )}
                        {isOut && (
                          <span className="rounded-[5px] bg-accent/10 px-[7px] py-[2px] font-mono text-[10px] tracking-[0.15em] text-accent">
                            FORFEITED
                          </span>
                        )}
                        {winnerUserId === p.userId && (
                          <span className="text-gold" aria-label="winner">✦</span>
                        )}
                      </div>
                      {isOut ? (
                        <div className="font-mono text-xs text-accent">⚑ left the match</div>
                      ) : (
                        <>
                          <div className={`font-mono text-xs ${verdictTone(pr?.verdict ?? null)}`}>
                            {pr
                              ? pr.total != null
                                ? `${pr.passed}/${pr.total} tests · ${pr.verdict ? VERDICT_LABEL[pr.verdict] : ''}`
                                : (pr.verdict && VERDICT_LABEL[pr.verdict]) || 'submitted'
                              : 'no submission yet'}
                          </div>
                          <div className="mt-[7px] h-[7px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                            <i
                              className="block h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${pct}%`,
                                background: you
                                  ? 'linear-gradient(90deg, var(--color-accent), #c4573f)'
                                  : 'linear-gradient(90deg, var(--color-gold), #caa05a)',
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </Card>

            <Collapsible title="Problem" defaultOpen>
              <ProblemStatement text={data.problem.statement} />
            </Collapsible>

            <Card>
              <SectionLabel>Live feed</SectionLabel>
              <div className="mt-3.5 font-mono text-[12.5px] leading-[2]">
                {feed.length === 0 ? (
                  <span className="text-ink-soft">Submissions will appear here in real time.</span>
                ) : (
                  feed.map((f, i) => (
                    <div key={i}>
                      <span className="text-ink-soft">{f.t}</span>
                      {f.who && <>&nbsp;&nbsp;{f.who}</>}&nbsp;&nbsp;
                      <span className={f.tone}>{f.text}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
            </div>
          </div>

          {/* right — shared editor + console (disabled once the match is over) */}
          <CodeEditor
            language={language}
            onLanguageChange={setLanguage}
            code={code}
            onCodeChange={setCode}
            samples={data.problem.testCases}
            filename={`${data.match.slug ?? 'duel'}.${FILE_EXT[language]}`}
            onSubmit={handleSubmit}
            submitView={submitView}
            disabled={matchOver || iForfeited}
            disabledHint={
              iForfeited
                ? "You forfeited — you're spectating. You can't submit."
                : 'Match over — start a new match from the lobby.'
            }
            className="min-h-[480px] lg:min-h-0"
          />
        </div>
      )}
    </div>
  )
}
