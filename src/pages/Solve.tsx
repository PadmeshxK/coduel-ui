import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Collapsible } from '../components/ui/Collapsible'
import { CodeEditor } from '../components/editor/CodeEditor'
import { Loader } from '../components/ui/Loader'
import { problemApi, submissionApi } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { VERDICT_LABEL } from '../lib/verdict'
import type { Verdict, Language } from '../types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// dark-terminal tones (the console is always dark, independent of theme)
const termTone = (v: Verdict | null) =>
  v === 'ACCEPTED' ? 'text-[#7FB47A]' : v === 'PENDING' || v == null ? 'text-[#caa15c]' : 'text-[#cf6b54]'

export function Solve() {
  const { slug } = useParams()
  const { data: problem, loading, error } = useAsync(
    () => problemApi.getBySlug(slug!),
    [slug],
  )

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState<Language>('PYTHON')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [submitInfo, setSubmitInfo] = useState<{ passed: number | null; total: number | null }>({
    passed: null,
    total: null,
  })
  const [submitError, setSubmitError] = useState<string | null>(null)

  const filename = `${slug ?? 'solution'}.${language === 'PYTHON' ? 'py' : 'txt'}`

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
      let latest = created
      // Poll past the consumer retry window so a failed judge surfaces as INTERNAL_ERROR
      // (pushed once the message is dead-lettered) rather than hanging on "judging…".
      for (let i = 0; i < 30 && latest.verdict === 'PENDING'; i++) {
        await sleep(1000)
        latest = await submissionApi.get(created.submissionId)
      }
      setVerdict(latest.verdict)
      setSubmitInfo({ passed: latest.passedTests, total: latest.totalTests })
    } catch (e) {
      setVerdict(null)
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    }
  }

  const submitView = submitError ? (
    <div className="text-[#cf6b54]">error: {submitError}</div>
  ) : (
    <>
      <div className="text-[#8a7c66]">queued for async judging…</div>
      {verdict && (
        <div>
          verdict: <span className={termTone(verdict)}>{VERDICT_LABEL[verdict]}</span>
        </div>
      )}
      {submitInfo.total != null && (
        <div className="text-[#8a7c66]">
          tests:{' '}
          <span className={submitInfo.passed === submitInfo.total ? 'text-[#7FB47A]' : 'text-[#cf6b54]'}>
            {submitInfo.passed}/{submitInfo.total} passed
          </span>
        </div>
      )}
    </>
  )

  return (
    <div className="flex min-h-full flex-col gap-4 lg:h-full">
      <div>
        <div className="font-mono text-[12px] text-ink-soft">
          <span className="text-accent-2">coduel</span>:
          <span className="text-accent">~/practice/{slug ?? 'two-sum'}</span> $
        </div>
        <h1 className="mt-1.5 font-display text-[22px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[26px] lg:text-[30px] lg:leading-none">
          {loading ? 'Loading…' : (problem?.title ?? 'Not found')}
        </h1>
      </div>

      {error && (
        <div className="rounded-[14px] border border-line bg-paper-2 p-[22px] font-mono text-sm text-accent">
          Couldn't load problem: {error}
        </div>
      )}

      {loading && !problem && !error && (
        <div className="grid min-h-0 flex-1 place-items-center">
          <Loader label="Loading problem" />
        </div>
      )}

      {problem && (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:grid-rows-none">
          {/* left — problem (test cases now live in the editor console) */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <Collapsible title="Problem" defaultOpen>
              <p className="whitespace-pre-line font-display text-[18px] font-medium leading-[1.55]">
                {problem.statement}
              </p>
            </Collapsible>
          </div>

          {/* right — shared editor + console */}
          <CodeEditor
            language={language}
            onLanguageChange={setLanguage}
            code={code}
            onCodeChange={setCode}
            samples={problem.testCases}
            filename={filename}
            onSubmit={handleSubmit}
            submitView={submitView}
            className="min-h-[480px] lg:min-h-0"
          />
        </div>
      )}
    </div>
  )
}
