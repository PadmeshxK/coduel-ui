import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { EditorPanel } from '../ui/EditorPanel'
import { LanguageSelect } from '../ui/LanguageSelect'
import { executionApi } from '../../lib/api'
import { MONACO_LANGUAGE } from '../../lib/languages'
import { clampOutput } from '../../lib/truncate'
import type { Language, TestCaseData } from '../../types'

const MOD =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'

const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('coduel', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#1a1510' },
  })
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: 'JetBrains Mono, monospace',
  fontLigatures: true,
  lineNumbersMinChars: 3,
  padding: { top: 16, bottom: 16 },
  scrollBeyondLastLine: false,
  tabSize: 4,
  insertSpaces: true,
  automaticLayout: true,
  renderWhitespace: 'selection' as const,
  cursorBlinking: 'smooth' as const,
  smoothScrolling: true,
  roundedSelection: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
}

export interface CaseResult {
  label: string
  expected: string
  output: string
  stderr: string
  exitCode: number
  durationMs: number
  passed: boolean | null
}

interface CodeEditorProps {
  language: Language
  onLanguageChange: (l: Language) => void
  code: string
  onCodeChange: (c: string) => void
  /** Read-only sample cases from the problem. */
  samples: TestCaseData[]
  filename: string
  /** Page-owned submit: network + result state. The editor only manages busy + which tab shows. */
  onSubmit: () => Promise<void>
  /** Terminal content rendered after a Submit (verdict block, judging message, …). */
  submitView?: ReactNode
  /** Gate Run + Submit (e.g. duel not ready / match over). */
  disabled?: boolean
  /** Hint shown in the console when actions are gated. */
  disabledHint?: string
  /** Initial console height; user can drag the divider to resize. */
  initialConsoleHeight?: number
  className?: string
}

const MIN_CONSOLE = 120
const MAX_CONSOLE = 640
const DIVIDER_H = 16 // h-4 grab strip

type Tab = 'output' | 'tests'
type LastAction = 'run' | 'submit' | null

export function CodeEditor({
  language,
  onLanguageChange,
  code,
  onCodeChange,
  samples,
  filename,
  onSubmit,
  submitView,
  disabled = false,
  disabledHint,
  initialConsoleHeight = 280,
  className = '',
}: CodeEditorProps) {
  const [busy, setBusy] = useState<null | 'run' | 'submit'>(null)
  // Console starts open on the Tests tab so it's obvious the problem has test cases.
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('tests')
  const [consoleHeight, setConsoleHeight] = useState(initialConsoleHeight)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  function onResizeDown(e: ReactPointerEvent) {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: consoleHeight }
    setDragging(true)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: ReactPointerEvent) {
    if (!dragRef.current) return
    const dy = e.clientY - dragRef.current.startY
    // drag up grows the console (and shrinks the editor)
    const next = dragRef.current.startH - dy
    setConsoleHeight(Math.min(MAX_CONSOLE, Math.max(MIN_CONSOLE, next)))
  }
  function onResizeUp(e: ReactPointerEvent) {
    dragRef.current = null
    setDragging(false)
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be released */
    }
  }
  const [lastAction, setLastAction] = useState<LastAction>(null)
  const [results, setResults] = useState<CaseResult[] | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [customCases, setCustomCases] = useState<
    { id: number; input: string; expected: string }[]
  >([])
  const nextCaseId = useRef(1)

  const addCase = () =>
    setCustomCases((c) => [...c, { id: nextCaseId.current++, input: '', expected: '' }])
  const removeCase = (id: number) => setCustomCases((c) => c.filter((x) => x.id !== id))
  const updateCase = (id: number, field: 'input' | 'expected', value: string) =>
    setCustomCases((c) => c.map((x) => (x.id === id ? { ...x, [field]: value } : x)))

  const canAct = !disabled && busy === null && code.trim() !== ''
  const totalCases = samples.length + customCases.length

  async function handleRun() {
    setBusy('run')
    setLastAction('run')
    setRunError(null)
    setResults(null)
    setTab('output')
    setOpen(true)
    try {
      const sampleRuns = samples.map((c, i) => ({
        input: c.input,
        expectedOutput: c.expectedOutput,
        label: `Sample ${i + 1}`,
      }))
      const customRuns = customCases.map((c, i) => ({
        input: c.input,
        expectedOutput: c.expected,
        label: `Custom ${i + 1}`,
      }))
      let toRun = [...sampleRuns, ...customRuns]
      if (toRun.length === 0) toRun = [{ input: '', expectedOutput: '', label: 'Run' }]

      const out = await Promise.all(
        toRun.map(async (tc): Promise<CaseResult> => {
          const r = await executionApi.execute({ language, code, stdin: tc.input })
          const hasExpected = tc.expectedOutput.trim() !== ''
          return {
            label: tc.label,
            expected: tc.expectedOutput,
            output: clampOutput(r.stdout),
            stderr: clampOutput(r.stderr),
            exitCode: r.exitCode,
            durationMs: r.durationMs,
            passed: hasExpected ? r.stdout.trim() === tc.expectedOutput.trim() : null,
          }
        }),
      )
      setResults(out)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleSubmit() {
    setBusy('submit')
    setLastAction('submit')
    setRunError(null)
    setResults(null)
    setTab('output')
    setOpen(true)
    try {
      await onSubmit()
    } finally {
      setBusy(null)
    }
  }

  // Keep editor shortcuts pointed at the latest guarded handlers.
  const runRef = useRef(() => {})
  const submitRef = useRef(() => {})
  runRef.current = () => canAct && void handleRun()
  submitRef.current = () => canAct && void handleSubmit()
  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current())
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => submitRef.current(),
    )
  }

  const passedCount = results?.filter((r) => r.passed === true).length ?? 0
  const judgeable = results?.filter((r) => r.passed !== null).length ?? 0
  const totalMs = results?.reduce((s, r) => s + r.durationMs, 0) ?? 0

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <EditorPanel
        fill
        className="min-h-0 flex-1"
        toolbar={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ChromeButton onClick={() => setOpen((o) => !o)} title="Toggle console">
              {'>_ Console'}
            </ChromeButton>
            <LanguageSelect value={language} onChange={onLanguageChange} />
            <ChromeButton
              onClick={handleRun}
              disabled={!canAct}
              title={`Run (${MOD}+↵)`}
              hint={`${MOD} ↵`}
            >
              {busy === 'run' ? 'Running…' : 'Run'}
            </ChromeButton>
            <ChromeButton
              primary
              onClick={handleSubmit}
              disabled={!canAct}
              title={`Submit (${MOD}+⇧+↵)`}
              hint={`${MOD} ⇧ ↵`}
            >
              {busy === 'submit' ? 'Submitting…' : 'Submit'}
            </ChromeButton>
          </div>
        }
      >
        <Editor
          height="100%"
          language={MONACO_LANGUAGE[language]}
          theme="coduel"
          beforeMount={defineTheme}
          onMount={handleMount}
          value={code}
          onChange={(v) => onCodeChange(v ?? '')}
          options={EDITOR_OPTIONS}
        />
      </EditorPanel>

      {/* console — animated open/close (height eases so the editor grows/shrinks smoothly) + drag-resize */}
      <div
        className="shrink-0 overflow-hidden"
        style={{
          height: open ? consoleHeight + DIVIDER_H : 0,
          opacity: open ? 1 : 0,
          transition: dragging
            ? 'none'
            : 'height 0.42s var(--ease-fluid), opacity 0.3s var(--ease-fluid)',
        }}
      >
        {/* draggable divider — grows + warms to the accent, eased for a professional feel */}
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          title="Drag to resize"
          className="group flex h-4 shrink-0 cursor-row-resize touch-none select-none items-center justify-center"
        >
          <span
            className={`rounded-full transition-all duration-200 ease-out ${
              dragging
                ? 'h-[3px] w-20 bg-accent'
                : 'h-[3px] w-12 bg-white/15 group-hover:w-16 group-hover:bg-accent/70'
            }`}
          />
        </div>

        <div
          style={{ height: consoleHeight }}
          className="reflective flex flex-col overflow-hidden rounded-[14px] border border-black/60 bg-[#120e09]"
        >
            <div className="flex items-center gap-1 border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
              <ConsoleTab active={tab === 'output'} onClick={() => setTab('output')}>
                Output
              </ConsoleTab>
              <ConsoleTab active={tab === 'tests'} onClick={() => setTab('tests')}>
                Tests · {totalCases}
              </ConsoleTab>
              {busy && (
                <span className="ml-2 flex items-center gap-1.5 font-mono text-[11px] text-[#caa15c]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#caa15c]" />
                  {busy === 'run' ? 'running' : 'judging'}
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Close console"
                className="ml-auto rounded px-2 py-0.5 font-mono text-sm text-[#8a7c66] transition hover:text-[#e7d9bd]"
              >
                ✕
              </button>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto p-4 ${dragging ? 'pointer-events-none select-none' : ''}`}
            >
              {tab === 'tests' ? (
                <TestsPanel
                  samples={samples}
                  customCases={customCases}
                  addCase={addCase}
                  removeCase={removeCase}
                  updateCase={updateCase}
                />
              ) : (
                <div className="font-mono text-[12.5px] leading-[1.7] text-[#d8cdb4]">
                  <OutputPanel
                    busy={busy}
                    disabled={disabled}
                    disabledHint={disabledHint}
                    lastAction={lastAction}
                    results={results}
                    runError={runError}
                    submitView={submitView}
                    filename={filename}
                    passedCount={passedCount}
                    judgeable={judgeable}
                    totalMs={totalMs}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}

/* ---------- console tabs + chrome button ---------- */

function ConsoleTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] transition ${
        active ? 'bg-white/[0.08] text-[#e7d9bd]' : 'text-[#8a7c66] hover:text-[#d8cdb4]'
      }`}
    >
      {children}
    </button>
  )
}

function ChromeButton({
  onClick,
  disabled,
  primary,
  title,
  hint,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  title?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center rounded-md px-3 py-1.5 font-mono text-xs transition disabled:opacity-40 ${
        primary
          ? 'bg-accent text-white hover:brightness-110'
          : 'border border-white/15 bg-white/[0.06] text-[#e7d9bd] hover:bg-white/[0.12]'
      }`}
    >
      {children}
      {hint && (
        <span className="ml-1.5 hidden rounded bg-black/25 px-1.5 py-0.5 text-[10px] opacity-70 lg:inline">
          {hint}
        </span>
      )}
    </button>
  )
}

/* ---------- tests tab (dark-themed cases editor) ---------- */

function TestsPanel({
  samples,
  customCases,
  addCase,
  removeCase,
  updateCase,
}: {
  samples: TestCaseData[]
  customCases: { id: number; input: string; expected: string }[]
  addCase: () => void
  removeCase: (id: number) => void
  updateCase: (id: number, field: 'input' | 'expected', value: string) => void
}) {
  type Item =
    | { key: string; kind: 'sample'; label: string; input: string; expected: string }
    | { key: string; kind: 'custom'; id: number; label: string; input: string; expected: string }

  const items: Item[] = [
    ...samples.map((s, i) => ({
      key: `s${i}`,
      kind: 'sample' as const,
      label: `Sample ${i + 1}`,
      input: s.input,
      expected: s.expectedOutput,
    })),
    ...customCases.map((c, i) => ({
      key: `c${c.id}`,
      kind: 'custom' as const,
      id: c.id,
      label: `Custom ${i + 1}`,
      input: c.input,
      expected: c.expected,
    })),
  ]

  const [sel, setSel] = useState(0)
  const idx = items.length ? Math.min(sel, items.length - 1) : -1
  const active = idx >= 0 ? items[idx] : null

  return (
    <div className="flex h-full flex-col">
      {/* horizontal case selector — chips, not a vertical list */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {items.map((it, i) => {
          const on = i === idx
          const custom = it.kind === 'custom'
          return (
            <button
              key={it.key}
              onClick={() => setSel(i)}
              className={`group flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                on
                  ? custom
                    ? 'border-[#caa15c]/60 bg-[#caa15c]/[0.12] text-[#e8cf9e]'
                    : 'border-white/20 bg-white/[0.1] text-[#e7d9bd]'
                  : 'border-white/10 text-[#8a7c66] hover:text-[#d8cdb4]'
              }`}
            >
              {it.label}
              {custom && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeCase(it.id)
                    setSel((s) => Math.max(0, s - 1))
                  }}
                  className="text-[#8a7c66] transition hover:text-[#cf6b54]"
                >
                  ✕
                </span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => {
            addCase()
            setSel(items.length) // newly appended custom case
          }}
          className="shrink-0 rounded-lg border border-dashed border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#8a7c66] transition hover:border-[#caa15c] hover:text-[#caa15c]"
        >
          + Case
        </button>
      </div>

      {/* roomy side-by-side inspector for the selected case */}
      {active ? (
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-3">
          <Field label={active.kind === 'custom' ? 'Input · stdin' : 'Input'}>
            {active.kind === 'custom' ? (
              <textarea
                value={active.input}
                onChange={(e) => updateCase(active.id, 'input', e.target.value)}
                placeholder="stdin…"
                className="h-full w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-[12.5px] text-[#e7d9bd] outline-none transition placeholder:text-[#6b6354] focus:border-[#caa15c]"
              />
            ) : (
              <CaseText value={active.input} />
            )}
          </Field>
          <Field label={active.kind === 'custom' ? 'Expected · optional' : 'Expected output'}>
            {active.kind === 'custom' ? (
              <textarea
                value={active.expected}
                onChange={(e) => updateCase(active.id, 'expected', e.target.value)}
                placeholder="expected output…"
                className="h-full w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-[12.5px] text-[#e7d9bd] outline-none transition placeholder:text-[#6b6354] focus:border-[#caa15c]"
              />
            ) : (
              <CaseText value={active.expected} />
            )}
          </Field>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center justify-center font-mono text-[12px] text-[#8a7c66]">
          No test cases — add one to run against your own input.
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a7c66]">
        {label}
      </div>
      <div className="min-h-[88px] flex-1">{children}</div>
    </div>
  )
}

function CaseText({ value }: { value: string }) {
  return (
    <div className="h-full w-full overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-[12.5px] text-[#d8cdb4]">
      {value.trim() || <span className="text-[#6b6354]">(empty)</span>}
    </div>
  )
}

/* ---------- output tab ---------- */

function Prompt({ cmd }: { cmd: string }) {
  return (
    <div>
      <span className="text-[#7FB47A]">$</span> <span className="text-[#e7d9bd]">{cmd}</span>
    </div>
  )
}

function OutputPanel({
  busy,
  disabled,
  disabledHint,
  lastAction,
  results,
  runError,
  submitView,
  filename,
  passedCount,
  judgeable,
  totalMs,
}: {
  busy: null | 'run' | 'submit'
  disabled: boolean
  disabledHint?: string
  lastAction: LastAction
  results: CaseResult[] | null
  runError: string | null
  submitView?: ReactNode
  filename: string
  passedCount: number
  judgeable: number
  totalMs: number
}) {
  if (runError) {
    return (
      <>
        <Prompt cmd={`run ${filename}`} />
        <div className="text-[#cf6b54]">error: {runError}</div>
      </>
    )
  }

  if (lastAction === 'submit') {
    return (
      <>
        <Prompt cmd={`submit ${filename}`} />
        {submitView ?? <div className="text-[#8a7c66]">submitted — see results.</div>}
      </>
    )
  }

  if (busy === 'run' && !results) {
    return (
      <>
        <Prompt cmd={`run ${filename} --tests`} />
        <div className="text-[#8a7c66]">running…</div>
      </>
    )
  }

  if (results) {
    return (
      <>
        <Prompt cmd={`run ${filename} --tests`} />
        {results.map((r, i) => (
          <div key={i}>
            <span className="text-[#8a7c66]">{r.label}</span>
            {'  '}
            <span
              className={
                r.passed === false
                  ? 'text-[#cf6b54]'
                  : r.passed
                    ? 'text-[#7FB47A]'
                    : 'text-[#8a7c66]'
              }
            >
              {r.passed === false ? 'FAIL' : r.passed ? 'PASS' : 'done'}
            </span>
            {'  '}
            <span className="text-[#8a7c66]">{r.durationMs}ms</span>
            {r.passed === false && (
              <div className="pl-6 text-[#8a7c66]">
                <div>
                  expected&nbsp;&nbsp;
                  <span className="text-[#d8cdb4]">{r.expected.trim() || '(empty)'}</span>
                </div>
                <div>
                  got&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  <span className="text-[#d8cdb4]">{r.output.trim() || '(empty)'}</span>
                </div>
              </div>
            )}
            {r.stderr && (
              <div className="pl-6 text-[#cf6b54]">stderr&nbsp;&nbsp;&nbsp;&nbsp;{r.stderr.trim()}</div>
            )}
          </div>
        ))}
        {judgeable > 0 && (
          <div className="mt-2">
            <span className={passedCount === judgeable ? 'text-[#7FB47A]' : 'text-[#cf6b54]'}>
              {passedCount}/{judgeable} passed
            </span>
            <span className="text-[#8a7c66]"> · {totalMs}ms</span>
          </div>
        )}
      </>
    )
  }

  if (disabled && disabledHint) {
    return <div className="text-[#8a7c66]">{disabledHint}</div>
  }

  return <div className="text-[#8a7c66]">Run to test, or Submit to judge against all tests.</div>
}
