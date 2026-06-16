import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Collapsible } from '../components/ui/Collapsible'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { CodeEditor } from '../components/editor/CodeEditor'
import { Loader } from '../components/ui/Loader'
import { matchApi, problemApi, submissionApi } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { useMatchSocket } from '../hooks/useMatchSocket'
import { useAuth } from '../hooks/useAuth'
import { VERDICT_LABEL, verdictTone } from '../lib/verdict'
import type { Language, MatchEndReason, MatchEventData, Verdict } from '../types'

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

export function DuelPage() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, loading, error } = useAsync(async () => {
    const match = await matchApi.get(matchId!)
    const problem = await problemApi.getBySlug(match.slug)
    return { match, problem }
  }, [matchId])

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState<Language>('PYTHON')
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // live match state
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [winnerUserId, setWinnerUserId] = useState<number | null>(null)
  const [endReason, setEndReason] = useState<MatchEndReason | null>(null)
  const [ended, setEnded] = useState(false)
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  const [forfeiting, setForfeiting] = useState(false)

  // Pre-match: once both players are present (MATCH_READY), play a short VS countdown, then start.
  useEffect(() => {
    if (!ready || started || ended) return
    setCountdown(3)
    const id = window.setInterval(() => {
      setCountdown((c) => (c === null ? null : c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [ready, started, ended])

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
    const over = data.match.state !== 'ACTIVE'
    setEnded(over)
    // Reload of a match whose pre-match intro already played this session → skip straight to the
    // editor (a reconnect re-fires MATCH_READY, which would otherwise replay the countdown).
    if (!over && matchId && sessionStorage.getItem(`coduel-duel-intro-${matchId}`)) {
      setStarted(true)
    }
  }, [data, matchId])

  // Once the match has started, remember it so a reload doesn't replay the intro.
  useEffect(() => {
    if (started && matchId) sessionStorage.setItem(`coduel-duel-intro-${matchId}`, '1')
  }, [started, matchId])

  const participants = data?.match.participants ?? []
  const me = participants.find((p) => p.userId === user?.id)
  const opponent = participants.find((p) => p.userId !== user?.id)
  const opponentName = opponent?.displayName ?? 'your opponent'
  const nameFor = (id: number) =>
    participants.find((p) => p.userId === id)?.displayName ?? 'player'

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

  const matchOver = ended

  // Match-finish banner copy, chosen from the end reason + whether you're the winner / loser /
  // neither. Falls back to a generic line on reload (GET /matches carries no end reason).
  const matchOverMessage = (): { text: string; tone: string } => {
    const youWon = winnerUserId != null && winnerUserId === user?.id
    switch (endReason) {
      case 'SOLVED':
        return youWon
          ? { text: '🏆 You won — first to solve it!', tone: 'text-accent-2' }
          : { text: `${opponentName} solved it first.`, tone: 'text-accent' }
      case 'OPPONENT_FORFEIT':
        return youWon
          ? { text: '🏆 You won — your opponent forfeited.', tone: 'text-accent-2' }
          : { text: 'You forfeited — better luck next duel.', tone: 'text-accent' }
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
          ? { text: '🏆 You won the duel!', tone: 'text-accent-2' }
          : { text: `${nameFor(winnerUserId)} won the duel.`, tone: 'text-accent' }
    }
  }

  async function handleForfeit() {
    setForfeiting(true)
    try {
      await matchApi.forfeit(matchId!)
      // success: the MATCH_OVER event ends the match; leave the button disabled until it lands
    } catch {
      setForfeiting(false)
      setConfirmForfeit(false)
    }
  }

  async function handleSubmit() {
    if (!data) return
    setSubmitError(null)
    setSubmitMsg('judging…')
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
        setSubmitMsg('still judging — taking longer than expected.')
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
        setSubmitMsg(latest.verdict === 'INTERNAL_ERROR' ? 'judging failed — please try again.' : null)
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
            <span className="text-accent">~/duel/{data?.match.slug ?? matchId}</span> $
          </div>
          <h1 className="mt-1.5 font-display text-[22px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[26px] lg:text-[30px] lg:leading-none">
            {loading ? 'Loading…' : (data?.match.problemTitle ?? 'Duel')}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {started && !matchOver && (
            <div className="relative">
              <button
                onClick={() => setConfirmForfeit((o) => !o)}
                title="Leave the duel — your opponent wins"
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
                    <p className="font-display text-[16px] font-bold">Forfeit the duel?</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                      You'll leave the match and{' '}
                      <span className="font-semibold text-accent">{opponentName} wins</span>. This
                      can't be undone.
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
        <Card className="border-accent">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`font-display text-[22px] font-bold ${matchOverMessage().tone}`}>
              {matchOverMessage().text}
            </p>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to lobby
            </Button>
          </div>
        </Card>
      )}

      {data && !started && !matchOver && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Card className="animate-reveal w-full max-w-md text-center">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              {ready ? '● Get ready' : '● Match found'}
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

      {data && (started || matchOver) && (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:grid-rows-none">
          {/* left — scoreboard + problem + feed (the live layer, page-owned) */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <Card>
              <SectionLabel>Scoreboard</SectionLabel>
              {participants.map((p, i) => {
                const you = p.userId === user?.id
                const pr = progress[p.userId]
                const pct = pr?.total ? Math.round(((pr.passed ?? 0) / pr.total) * 100) : 0
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center gap-3 py-3 ${
                      i > 0 ? 'border-t border-dashed border-line' : ''
                    }`}
                  >
                    <Avatar
                      initial={(p.displayName ?? '?').charAt(0).toUpperCase()}
                      src={p.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[15px] font-semibold">
                        <span className="truncate">{p.displayName ?? 'player'}</span>
                        {you && (
                          <span className="rounded-[5px] bg-accent px-[7px] py-[2px] font-mono text-[10px] tracking-[0.15em] text-white">
                            YOU
                          </span>
                        )}
                        {winnerUserId === p.userId && <span>🏆</span>}
                      </div>
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
                    </div>
                  </div>
                )
              })}
            </Card>

            <Collapsible title="Problem" defaultOpen>
              <p className="whitespace-pre-line font-display text-[18px] font-medium leading-[1.55]">
                {data.problem.statement}
              </p>
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

          {/* right — shared editor + console (disabled once the match is over) */}
          <CodeEditor
            language={language}
            onLanguageChange={setLanguage}
            code={code}
            onCodeChange={setCode}
            samples={data.problem.testCases}
            filename={`${data.match.slug ?? 'duel'}.${language === 'PYTHON' ? 'py' : 'txt'}`}
            onSubmit={handleSubmit}
            submitView={submitView}
            disabled={matchOver}
            disabledHint="Match over — start a new duel from the lobby."
            className="min-h-[480px] lg:min-h-0"
          />
        </div>
      )}
    </div>
  )
}
