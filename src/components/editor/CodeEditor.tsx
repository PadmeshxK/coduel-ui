import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import Editor, { useMonaco, type BeforeMount, type OnMount } from '@monaco-editor/react'
import { EditorPanel } from '../ui/EditorPanel'
import { LanguageSelect } from '../ui/LanguageSelect'
import { executionApi } from '../../lib/api'
import { useStomp } from '../../hooks/useStomp'
import { MONACO_LANGUAGE } from '../../lib/languages'
import { clampOutput } from '../../lib/truncate'
import { VERDICT_LABEL } from '../../lib/verdict'
import { registerCompletions } from '../../lib/monacoCompletions'
import type { ExecutionData, Language, SubmissionData, TestCaseData } from '../../types'

const MOD =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'

const defineTheme: BeforeMount = (monaco) => {
  // Dark — warm espresso surface, brand syntax tones (oxblood keywords, green strings, gold numbers).
  monaco.editor.defineTheme('coduel', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: 'a2937c', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cb5b45' },
      { token: 'operator', foreground: 'cb5b45' },
      { token: 'string', foreground: '74b394' },
      { token: 'number', foreground: 'cba15c' },
      { token: 'constant', foreground: 'cba15c' },
      { token: 'type', foreground: 'd9a866' },
      { token: 'type.identifier', foreground: 'd9a866' },
      { token: 'delimiter', foreground: 'a2937c' },
    ],
    colors: {
      'editor.background': '#191410',
      'editor.foreground': '#f1e9db',
      'editorLineNumber.foreground': '#5c5142',
      'editorLineNumber.activeForeground': '#a2937c',
      'editorCursor.foreground': '#cb5b45',
      'editor.selectionBackground': '#3a3025',
      'editor.lineHighlightBackground': '#221a13',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#2a2219',
      'editorIndentGuide.activeBackground': '#3a3025',
      'editorWhitespace.foreground': '#2a2219',
      'editorGutter.background': '#191410',
    },
  })
  // Light — cream paper, the same brand tones tuned for contrast on a warm background.
  monaco.editor.defineTheme('coduel-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '9a8f78', fontStyle: 'italic' },
      { token: 'keyword', foreground: '9e3b2a' },
      { token: 'operator', foreground: '9e3b2a' },
      { token: 'string', foreground: '2e6b4f' },
      { token: 'number', foreground: 'a9762a' },
      { token: 'constant', foreground: 'a9762a' },
      { token: 'type', foreground: '8a5a14' },
      { token: 'type.identifier', foreground: '8a5a14' },
      { token: 'delimiter', foreground: '6b6354' },
    ],
    colors: {
      'editor.background': '#f4efe6',
      'editor.foreground': '#2b2119',
      'editorLineNumber.foreground': '#b7ab95',
      'editorLineNumber.activeForeground': '#6b6354',
      'editorCursor.foreground': '#9e3b2a',
      'editor.selectionBackground': '#e4d8c1',
      'editor.lineHighlightBackground': '#ece3d2',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#e2d8c4',
      'editorIndentGuide.activeBackground': '#cfc3aa',
      'editorWhitespace.foreground': '#ddd3bf',
      'editorGutter.background': '#f4efe6',
    },
  })
}

// The site theme lives on <html data-theme>; useTheme keeps per-call state, so observe the DOM to
// react to toggles fired anywhere. Maps the site theme to the matching Monaco theme name.
function useMonacoTheme(): string {
  const read = () =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? 'coduel'
      : 'coduel-light'
  const [name, setName] = useState(read)
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setName(read()))
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return name
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
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  tabCompletion: 'on' as const,
  acceptSuggestionOnEnter: 'smart' as const,
  renderWhitespace: 'selection' as const,
  cursorBlinking: 'smooth' as const,
  smoothScrolling: true,
  roundedSelection: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
}

interface CodeEditorProps {
  language: Language
  onLanguageChange: (l: Language) => void
  code: string
  onCodeChange: (c: string) => void
  /** Read-only sample cases from the problem. */
  samples: TestCaseData[]
  /** Practice only: when set, the editor shows this past submission read-only, with the action
   *  toolbar hidden and the console retracted. Null/undefined = the live editable buffer. */
  viewingSubmission?: SubmissionData | null
  /** Called by the header "Back to editor" button while viewing a submission. */
  onCloseSubmission?: () => void
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
const MAX_CUSTOM_CASES = 5

type Tab = 'output' | 'tests'
type LastAction = 'run' | 'submit' | null

export function CodeEditor({
  language,
  onLanguageChange,
  code,
  onCodeChange,
  samples,
  viewingSubmission,
  onCloseSubmission,
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
  const [runResult, setRunResult] = useState<ExecutionData | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [customCases, setCustomCases] = useState<
    { id: number; input: string; expected: string }[]
  >([])
  const nextCaseId = useRef(1)

  // Async runs: we POST the run, get a runId, then wait for its result on the shared socket.
  const { subscribe } = useStomp()
  const pendingRunId = useRef<string | null>(null)
  const runTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = subscribe('/user/queue/run-result', (body) => {
      try {
        const data = JSON.parse(body) as ExecutionData
        // Only the run we're currently waiting on (a stale result from a prior run is ignored).
        if (data.runId && data.runId === pendingRunId.current) {
          pendingRunId.current = null
          if (runTimeout.current) clearTimeout(runTimeout.current)
          setRunResult(data)
          setBusy(null)
        }
      } catch {
        // ignore malformed frames
      }
    })
    return () => {
      unsub()
      if (runTimeout.current) clearTimeout(runTimeout.current)
    }
  }, [subscribe])

  const addCase = () =>
    setCustomCases((c) =>
      c.length >= MAX_CUSTOM_CASES ? c : [...c, { id: nextCaseId.current++, input: '', expected: '' }],
    )
  const removeCase = (id: number) => setCustomCases((c) => c.filter((x) => x.id !== id))
  const updateCase = (id: number, field: 'input' | 'expected', value: string) =>
    setCustomCases((c) => c.map((x) => (x.id === id ? { ...x, [field]: value } : x)))

  // Viewing a past submission retracts the console (remembering its prior open state) and restores
  // it on return — the height transition animates both smoothly.
  const consoleBeforeView = useRef<boolean | null>(null)
  useEffect(() => {
    if (viewingSubmission) {
      if (consoleBeforeView.current === null) consoleBeforeView.current = open
      setOpen(false)
    } else if (consoleBeforeView.current !== null) {
      setOpen(consoleBeforeView.current)
      consoleBeforeView.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingSubmission])

  // Monaco follows the site theme (light/dark) at runtime + gets per-language autocomplete.
  const monaco = useMonaco()
  const editorTheme = useMonacoTheme()
  useEffect(() => {
    if (monaco) registerCompletions(monaco)
  }, [monaco])
  useEffect(() => {
    monaco?.editor.setTheme(editorTheme)
  }, [monaco, editorTheme])

  const canAct = !disabled && busy === null && code.trim() !== ''
  const totalCases = samples.length + customCases.length

  async function handleRun() {
    setBusy('run')
    setLastAction('run')
    setRunError(null)
    setRunResult(null)
    setTab('output')
    setOpen(true)
    try {
      const testCases = [
        ...samples.map((c) => ({ input: c.input, expectedOutput: c.expectedOutput })),
        ...customCases.map((c) => ({ input: c.input, expectedOutput: c.expected })),
      ]
      // Nothing to run against → a single empty-stdin run so the user still sees output.
      if (testCases.length === 0) testCases.push({ input: '', expectedOutput: '' })

      // Async: queue the run, then wait for the result on /user/queue/run-result (handled above).
      // busy stays 'run' until the result arrives — the console shows the running state meanwhile.
      const { runId } = await executionApi.execute({ language, code, testCases })
      pendingRunId.current = runId
      if (runTimeout.current) clearTimeout(runTimeout.current)
      // Safety net so the console never hangs if the result never comes back.
      runTimeout.current = setTimeout(() => {
        if (pendingRunId.current === runId) {
          pendingRunId.current = null
          setRunError('Run timed out — please try again.')
          setBusy(null)
        }
      }, 20_000)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Run failed')
      setBusy(null)
    }
  }

  async function handleSubmit() {
    setBusy('submit')
    setLastAction('submit')
    setRunError(null)
    setRunResult(null)
    setTab('output')
    setOpen(true)
    try {
      await onSubmit()
    } finally {
      setBusy(null)
    }
  }

  async function copyCode(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — ignore */
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

  const viewing = viewingSubmission ?? null

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <EditorPanel
        fill
        className="min-h-0 flex-1"
        toolbar={
          viewing ? (
            <div key="sub-toolbar" className="flex items-center gap-2.5">
              <span className="hidden font-mono text-[11px] text-ink-soft sm:inline">
                read-only · #{viewing.submissionId} ·{' '}
                <span className="lowercase">{viewing.language}</span>
              </span>
              <ChromeButton onClick={() => copyCode(viewing.sourceCode)} title="Copy code to clipboard">
                {copied ? 'Copied ✓' : 'Copy'}
              </ChromeButton>
              <ChromeButton primary onClick={() => onCloseSubmission?.()} title="Back to the editor">
                ← Back to editor
              </ChromeButton>
            </div>
          ) : (
            <div key="edit-toolbar" className="flex items-center justify-end gap-2">
              <ChromeButton onClick={() => setOpen((o) => !o)} title="Toggle console">
                {'>_ Console'}
              </ChromeButton>
              <LanguageSelect value={language} onChange={onLanguageChange} disabled={disabled} />
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
          )
        }
      >
        {viewing ? (
          <Editor
            key={`sub-${viewing.submissionId}`}
            height="100%"
            language={MONACO_LANGUAGE[viewing.language]}
            theme={editorTheme}
            beforeMount={defineTheme}
            value={viewing.sourceCode}
            options={{ ...EDITOR_OPTIONS, readOnly: true }}
          />
        ) : (
          <Editor
            height="100%"
            language={MONACO_LANGUAGE[language]}
            theme={editorTheme}
            beforeMount={defineTheme}
            onMount={handleMount}
            value={code}
            onChange={(v) => onCodeChange(v ?? '')}
            options={{ ...EDITOR_OPTIONS, readOnly: disabled }}
          />
        )}
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
                : 'h-[3px] w-12 bg-black/15 group-hover:w-16 group-hover:bg-accent/70 dark:bg-white/15'
            }`}
          />
        </div>

        <div
          style={{ height: consoleHeight }}
          className="reflective flex flex-col overflow-hidden rounded-[14px] border border-line bg-paper-2"
        >
            <div className="flex items-center gap-1 border-b border-line bg-black/[0.03] px-3 py-1.5 dark:bg-white/[0.03]">
              <ConsoleTab active={tab === 'output'} onClick={() => setTab('output')}>
                Output
              </ConsoleTab>
              <ConsoleTab active={tab === 'tests'} onClick={() => setTab('tests')}>
                Tests · {totalCases}
              </ConsoleTab>
              {busy && (
                <span className="ml-2 flex items-center gap-1.5 font-mono text-[11px] text-gold">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
                  {busy === 'run' ? 'running' : 'processing'}
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Close console"
                className="ml-auto rounded px-2 py-0.5 font-mono text-sm text-ink-soft transition hover:text-ink"
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
                <div className="font-mono text-[12.5px] leading-[1.7] text-ink-soft">
                  <OutputPanel
                    busy={busy}
                    disabled={disabled}
                    disabledHint={disabledHint}
                    lastAction={lastAction}
                    runResult={runResult}
                    runError={runError}
                    submitView={submitView}
                    filename={filename}
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
        active
          ? 'bg-black/[0.06] text-ink dark:bg-white/[0.08]'
          : 'text-ink-soft hover:text-ink'
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
          ? 'border border-transparent bg-accent text-white hover:brightness-110'
          : 'border border-line bg-black/[0.04] text-ink hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.12]'
      }`}
    >
      {children}
      {hint && (
        <span className="ml-1.5 hidden rounded bg-black/10 px-1.5 py-0.5 text-[10px] opacity-70 lg:inline dark:bg-black/25">
          {hint}
        </span>
      )}
    </button>
  )
}

/* ---------- tests tab (themed cases editor) ---------- */

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
                    ? 'border-gold/60 bg-gold/[0.12] text-gold'
                    : 'border-line bg-black/[0.06] text-ink dark:bg-white/[0.1]'
                  : 'border-line text-ink-soft hover:text-ink'
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
                  className="text-ink-soft transition hover:text-accent"
                >
                  ✕
                </span>
              )}
            </button>
          )
        })}
        {customCases.length < MAX_CUSTOM_CASES && (
          <button
            onClick={() => {
              addCase()
              setSel(items.length) // newly appended custom case
            }}
            className="shrink-0 rounded-lg border border-dashed border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft transition hover:border-gold hover:text-gold"
          >
            + Case
          </button>
        )}
      </div>

      {/* roomy side-by-side inspector for the selected case */}
      {active ? (
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-3">
          <Field label={active.kind === 'custom' ? 'Input · stdin' : 'Input'}>
            {active.kind === 'custom' ? (
              <div className="relative h-full">
                <CopyButton text={active.input} />
                <textarea
                  value={active.input}
                  onChange={(e) => updateCase(active.id, 'input', e.target.value)}
                  placeholder="stdin…"
                  className="h-full w-full resize-none rounded-lg border border-line bg-black/[0.02] p-3 font-mono text-[12.5px] text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-gold dark:bg-white/[0.03]"
                />
              </div>
            ) : (
              <CaseText value={active.input} />
            )}
          </Field>
          <Field label={active.kind === 'custom' ? 'Expected · optional' : 'Expected output'}>
            {active.kind === 'custom' ? (
              <div className="relative h-full">
                <CopyButton text={active.expected} />
                <textarea
                  value={active.expected}
                  onChange={(e) => updateCase(active.id, 'expected', e.target.value)}
                  placeholder="expected output…"
                  className="h-full w-full resize-none rounded-lg border border-line bg-black/[0.02] p-3 font-mono text-[12.5px] text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-gold dark:bg-white/[0.03]"
                />
              </div>
            ) : (
              <CaseText value={active.expected} />
            )}
          </Field>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center justify-center font-mono text-[12px] text-ink-soft">
          No test cases — add one to run against your own input.
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </div>
      <div className="min-h-[88px] flex-1">{children}</div>
    </div>
  )
}

function CaseText({ value }: { value: string }) {
  return (
    <div className="relative h-full w-full">
      <CopyButton text={value} />
      <div className="h-full w-full overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-black/[0.02] p-3 font-mono text-[12.5px] text-ink-soft dark:bg-white/[0.03]">
        {value.trim() || <span className="text-ink-soft/60">(empty)</span>}
      </div>
    </div>
  )
}

// Small copy-to-clipboard icon pinned to the top-right of a test-case box. Hidden when there's
// nothing to copy; flips to a tick for a moment after copying.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text.trim()) return null
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-md border border-line bg-paper/85 text-ink-soft backdrop-blur transition hover:border-ink-soft/50 hover:text-ink"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-accent-2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  )
}

/* ---------- output tab ---------- */

function Prompt({ cmd }: { cmd: string }) {
  return (
    <div>
      <span className="text-accent-2">$</span> <span className="text-ink">{cmd}</span>
    </div>
  )
}

// A labelled output block that preserves newlines/whitespace (so multi-line stdout renders properly).
function OutBlock({
  label,
  children,
  tone,
}: {
  label: string
  children: string
  tone?: 'accent'
}) {
  const text = clampOutput(children).replace(/\s+$/, '')
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
        {label}
      </div>
      <pre
        className={`max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-black/[0.02] p-2.5 font-mono text-[12px] leading-[1.5] dark:bg-white/[0.03] ${
          tone === 'accent' ? 'text-accent' : 'text-ink'
        }`}
      >
        {text || '(empty)'}
      </pre>
    </div>
  )
}

function OutputPanel({
  busy,
  disabled,
  disabledHint,
  lastAction,
  runResult,
  runError,
  submitView,
  filename,
}: {
  busy: null | 'run' | 'submit'
  disabled: boolean
  disabledHint?: string
  lastAction: LastAction
  runResult: ExecutionData | null
  runError: string | null
  submitView?: ReactNode
  filename: string
}) {
  if (runError) {
    return (
      <>
        <Prompt cmd={`run ${filename}`} />
        <div className="text-accent">error: {runError}</div>
      </>
    )
  }

  if (lastAction === 'submit') {
    return (
      <>
        <Prompt cmd={`submit ${filename}`} />
        {submitView ?? <div className="text-ink-soft">submitted — see results.</div>}
      </>
    )
  }

  if (busy === 'run' && !runResult) {
    return (
      <>
        <Prompt cmd={`run ${filename} --tests`} />
        <div className="text-ink-soft">running…</div>
      </>
    )
  }

  if (runResult) {
    const accepted = runResult.verdict === 'ACCEPTED'
    const passed = runResult.passedTests ?? 0
    const showCompare = !accepted && runResult.verdict !== 'COMPILE_ERROR'
    return (
      <>
        {/* line 1 — verdict · passed/total · runtime */}
        <div className="mb-2">
          <span className={accepted ? 'text-accent-2' : 'text-accent'}>
            {VERDICT_LABEL[runResult.verdict]}
          </span>
          <span className="text-ink-soft">
            {'  '}
            {passed}/{runResult.totalTests} passed · {runResult.durationMs}ms
          </span>
        </div>

        {runResult.verdict === 'COMPILE_ERROR' && runResult.compilerLogs && (
          <OutBlock label="Compiler" tone="accent">{runResult.compilerLogs}</OutBlock>
        )}

        {/* failure — input on its own line, then expected vs got side by side */}
        {showCompare && (
          <div className="space-y-2">
            {runResult.failedInput != null && <OutBlock label="Input">{runResult.failedInput}</OutBlock>}
            <div className="grid grid-cols-2 gap-2">
              <OutBlock label="Expected">{runResult.expectedOutput ?? ''}</OutBlock>
              <OutBlock label="Got" tone="accent">{runResult.stdout ?? ''}</OutBlock>
            </div>
          </div>
        )}

        {accepted && (runResult.stdout ?? '').trim() && (
          <OutBlock label="Output">{runResult.stdout ?? ''}</OutBlock>
        )}

        {(runResult.stderr ?? '').trim() && (
          <div className="mt-2">
            <OutBlock label="stderr" tone="accent">{runResult.stderr ?? ''}</OutBlock>
          </div>
        )}
      </>
    )
  }

  if (disabled && disabledHint) {
    return <div className="text-ink-soft">{disabledHint}</div>
  }

  return <div className="text-ink-soft">Run to test, or Submit to check against all tests.</div>
}
