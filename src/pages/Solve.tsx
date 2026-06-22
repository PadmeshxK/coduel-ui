import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Collapsible } from '../components/ui/Collapsible'
import { CodeEditor } from '../components/editor/CodeEditor'
import { ConfettiCannon } from '../components/ui/ConfettiCannon'
import { ProblemStatement } from '../components/ui/ProblemStatement'
import { Loader } from '../components/ui/Loader'
import { Reveal } from '../components/ui/Reveal'
import { StatusPill } from '../components/ui/StatusPill'
import { problemApi, submissionApi } from '../lib/api'
import { loadPracticeFilter } from '../lib/practiceFilter'
import { useAsync } from '../hooks/useAsync'
import { useLenisBox } from '../hooks/useLenisBox'
import { useStomp } from '../hooks/useStomp'
import { VERDICT_LABEL, verdictTone } from '../lib/verdict'
import { FILE_EXT } from '../lib/languages'
import type { SubmissionData, Verdict, Language } from '../types'


// Per-problem code + language cache (practice only) so progress isn't lost on reload/navigation.
const draftKey = (slug?: string) => `coduel:draft:${slug ?? ''}`
const langKey = (slug?: string) => `coduel:lang:${slug ?? ''}`

export function Solve() {
  const { slug } = useParams()
  const { data: problem, error } = useAsync(() => problemApi.getBySlug(slug!), [slug])
  // Ordered slugs for the filter the user last browsed with — to offer the next problem in that set.
  // Fetched once; recomputing `nextSlug` as the slug changes is enough as they walk the list.
  const { data: filterSlugs } = useAsync(() => problemApi.slugs(loadPracticeFilter()), [])
  const slugIndex = filterSlugs && slug ? filterSlugs.indexOf(slug) : -1
  const nextSlug =
    slugIndex >= 0 && filterSlugs && slugIndex < filterSlugs.length - 1
      ? filterSlugs[slugIndex + 1]
      : null

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState<Language>('PYTHON')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [submitInfo, setSubmitInfo] = useState<{ passed: number | null; total: number | null }>({
    passed: null,
    total: null,
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [subs, setSubs] = useState<SubmissionData[]>([])
  const [showCelebration, setShowCelebration] = useState(false)
  // The past submission currently shown read-only in the editor (null = the live editable buffer).
  const [selectedSub, setSelectedSub] = useState<SubmissionData | null>(null)

  // Momentum smooth-scroll for the problem panel, matching the rest of the site (re-measures per problem).
  const problemScrollRef = useRef<HTMLDivElement>(null)
  useLenisBox(problemScrollRef, [problem?.slug])

  const filename = `${slug ?? 'solution'}.${FILE_EXT[language]}`

  // Submissions arrive bundled with the problem (GET /problem/{slug}) — no extra round-trip on load.
  useEffect(() => {
    setSubs(problem?.submissions ?? [])
  }, [problem])

  // Fresh slate when navigating between problems (so nothing stale flashes before the reload).
  useEffect(() => {
    setSelectedSub(null)
    setVerdict(null)
    setSubmitInfo({ passed: null, total: null })
    setSubmitError(null)
    setShowCelebration(false)
    // Restore any cached code + language for this problem (so progress survives reload/navigation).
    setCode(slug ? localStorage.getItem(draftKey(slug)) ?? '' : '')
    const savedLang = slug ? localStorage.getItem(langKey(slug)) : null
    setLanguage(savedLang === 'CPP' || savedLang === 'PYTHON' ? savedLang : 'PYTHON')
  }, [slug])

  // Solo submissions are judged async and the result is pushed to /user/queue/submission-result on
  // the shared socket (no polling). We match it to the submission we're waiting on by id.
  const { subscribe } = useStomp()
  const pendingSubmissionId = useRef<number | null>(null)
  const submitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyResult = useCallback((s: SubmissionData) => {
    setVerdict(s.verdict)
    setSubmitInfo({ passed: s.passedTests, total: s.totalTests })
    if (s.verdict === 'ACCEPTED') setShowCelebration(true)
    setSubs((prev) => [s, ...prev.filter((x) => x.submissionId !== s.submissionId)])
  }, [])

  useEffect(() => {
    const unsub = subscribe('/user/queue/submission-result', (body) => {
      try {
        const s = JSON.parse(body) as SubmissionData
        if (s.submissionId === pendingSubmissionId.current) {
          pendingSubmissionId.current = null
          if (submitTimeout.current) clearTimeout(submitTimeout.current)
          applyResult(s)
        }
      } catch {
        // ignore malformed frames
      }
    })
    return () => {
      unsub()
      if (submitTimeout.current) clearTimeout(submitTimeout.current)
    }
  }, [subscribe, applyResult])

  const latestSub = subs[0] ?? null
  // Permanent solved state: any accepted attempt counts, even if a later submission was wrong.
  const solved = subs.some((s) => s.verdict === 'ACCEPTED')
  const ready = !!problem

  // Cache the code + language per problem (practice only).
  const handleCodeChange = (c: string) => {
    setCode(c)
    if (slug) localStorage.setItem(draftKey(slug), c)
  }
  const handleLanguageChange = (l: Language) => {
    setLanguage(l)
    if (slug) localStorage.setItem(langKey(slug), l)
  }

  async function handleSubmit() {
    if (!problem) return
    setSubmitError(null)
    setVerdict('PENDING')
    setSubmitInfo({ passed: null, total: null })
    try {
      const created = await submissionApi.create({
        problemId: problem.id,
        language,
        sourceCode: code,
      })
      pendingSubmissionId.current = created.submissionId
      if (submitTimeout.current) clearTimeout(submitTimeout.current)
      // Fallback: if the push never lands (e.g. dead-lettered before the INTERNAL_ERROR push), fetch
      // once past the consumer retry window rather than hanging on "judging…".
      submitTimeout.current = setTimeout(() => {
        if (pendingSubmissionId.current === created.submissionId) {
          pendingSubmissionId.current = null
          void submissionApi
            .get(created.submissionId)
            .then(applyResult)
            .catch(() =>
              setSubmitError('This is taking longer than usual — refresh to see the result.'),
            )
        }
      }, 35_000)
    } catch (e) {
      setVerdict(null)
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    }
  }

  const submitView = submitError ? (
    <div className="text-accent">error: {submitError}</div>
  ) : (
    <>
      {(!verdict || verdict === 'PENDING') && <div className="text-ink-soft">Processing…</div>}
      {verdict && (
        <div>
          verdict: <span className={verdictTone(verdict)}>{VERDICT_LABEL[verdict]}</span>
        </div>
      )}
      {submitInfo.total != null && (
        <div className="text-ink-soft">
          tests:{' '}
          <span className={submitInfo.passed === submitInfo.total ? 'text-accent-2' : 'text-accent'}>
            {submitInfo.passed}/{submitInfo.total} passed
          </span>
        </div>
      )}
    </>
  )

  return (
    <div className="flex min-h-full flex-col gap-4 lg:h-full">
      {error && (
        <div className="rounded-[14px] border border-line bg-paper-2 p-[22px] font-mono text-sm text-accent">
          Couldn't load problem: {error}
        </div>
      )}

      {!ready && !error && (
        <div className="grid min-h-0 flex-1 place-items-center">
          <Loader label="Loading problem" />
        </div>
      )}

      {showCelebration && <ConfettiCannon />}

      {ready && problem && (
        <Reveal key={slug} className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
            <div className="font-mono text-[12px] text-ink-soft">
              <span className="text-accent-2">coduel</span>:
              <span className="text-accent">~/practice/{slug ?? 'two-sum'}</span> $
            </div>
            <h1 className="mt-1.5 font-display text-[22px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[26px] lg:text-[30px] lg:leading-none">
              {problem.title}
            </h1>
            {solved ? (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-2/40 bg-accent-2/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-2">
                  ✓ Solved
                </span>
              </div>
            ) : latestSub ? (
              <div className="mt-2">
                <StatusPill verdict={latestSub.verdict} />
              </div>
            ) : null}

            {/* rating + tags for this problem */}
            {(problem.rating != null || (problem.tags && problem.tags.length > 0)) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {problem.rating != null && (
                  <span className="rounded-md border border-gold/40 px-2 py-0.5 font-mono text-[11px] text-gold">
                    rating {problem.rating}
                  </span>
                )}
                {problem.tags?.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-black/[0.05] px-2 py-0.5 font-mono text-[11px] text-ink-soft dark:bg-white/[0.06]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            </div>

            {/* jump to the next problem in the filter the user browsed with (practice only) */}
            {nextSlug && (
              <Link
                to={`/practice/${nextSlug}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-paper-2 px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-ink-soft transition hover:border-ink-soft/50 hover:text-ink"
              >
                Next problem →
              </Link>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:grid-rows-none">
            {/* left — problem + past submissions (test cases live in the editor console) */}
            <div ref={problemScrollRef} className="min-h-0 overflow-y-auto pr-1">
              <div className="flex flex-col gap-4">
                <Collapsible title="Problem" defaultOpen>
                  <ProblemStatement text={problem.statement} />
                </Collapsible>

                {subs.length > 0 && (
                  <div className="rounded-[14px] border border-line bg-paper-2 p-3">
                    <div className="mb-2 px-1">
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                        Submissions · {subs.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {subs.map((s) => (
                        <SubmissionRow
                          key={s.submissionId}
                          s={s}
                          active={selectedSub?.submissionId === s.submissionId}
                          onClick={() => setSelectedSub(s)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* right — shared editor + console */}
            <CodeEditor
              language={language}
              onLanguageChange={handleLanguageChange}
              code={code}
              onCodeChange={handleCodeChange}
              samples={problem.testCases}
              viewingSubmission={selectedSub}
              onCloseSubmission={() => setSelectedSub(null)}
              filename={filename}
              onSubmit={handleSubmit}
              submitView={submitView}
              className="min-h-[480px] lg:min-h-0"
            />
          </div>
        </Reveal>
      )}
    </div>
  )
}

function SubmissionRow({
  s,
  active,
  onClick,
}: {
  s: SubmissionData
  active: boolean
  onClick: () => void
}) {
  const tone = verdictTone(s.verdict)
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left font-mono text-[12px] transition ${
        active
          ? 'border-accent/50 bg-accent/[0.07]'
          : 'border-transparent hover:border-line hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${tone}`} />
        <span className={`truncate ${tone}`}>{VERDICT_LABEL[s.verdict]}</span>
        {s.matchId != null && (
          <span className="inline-flex shrink-0 items-center justify-center rounded border border-line px-1.5 pb-px pt-[3px] font-mono text-[9px] uppercase leading-none tracking-wide text-ink-soft">
            duel
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-ink-soft">
        {s.passedTests != null && s.totalTests != null && (
          <span>
            {s.passedTests}/{s.totalTests}
          </span>
        )}
        {s.createdAtMs != null && <span>{relTime(s.createdAtMs)}</span>}
      </span>
    </button>
  )
}

function relTime(ms: number) {
  const m = Math.floor((Date.now() - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
