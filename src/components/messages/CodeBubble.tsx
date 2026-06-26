import { useState, type CSSProperties } from 'react'
import { highlightCode } from './codeHighlight'
import type { ExecutionData } from '../../types'

// Two warm palettes mirroring the Solve-page Monaco themes (coduel / coduel-light) so a snippet reads
// identically to the editor. Exposed as CSS vars so the markup stays one tree and hovers still work.
const DARK = {
  card: '#191410', border: '#2a2219', header: '#221a13', input: '#1c1610', out: '#14100b',
  lang: '#cba15c', copy: '#a2937c', copyHover: '#f1e9db', text: '#f1e9db', placeholder: '#6b6052',
  muted: '#a2937c', stdout: '#74b394', err: '#cb5b45', run: '#cb5b45',
}
const LIGHT = {
  card: '#f4efe6', border: '#ddd2bd', header: '#ece3d2', input: '#ece3d2', out: '#ece3d2',
  lang: '#a9762a', copy: '#6b6354', copyHover: '#2b2119', text: '#2b2119', placeholder: '#a99d86',
  muted: '#9a8f78', stdout: '#2e6b4f', err: '#9e3b2a', run: '#9e3b2a',
}

/**
 * A code-snippet message — a warm card that follows the thread theme (dark espresso in dark threads,
 * parchment-light in light ones), with a language tag, copy, per-language syntax highlighting, and —
 * for runnable languages — an optional stdin field plus a Run button that executes it in the sandbox
 * and shows stdout inline. The output panel can be dismissed once read.
 */
export function CodeBubble({
  code,
  language,
  dark = true,
  runnable,
  running,
  output,
  onRun,
  onClearOutput,
}: {
  code: string
  language: string | null
  dark?: boolean
  runnable?: boolean
  running?: boolean
  output?: ExecutionData | null
  onRun?: (stdin: string) => void
  onClearOutput?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showStdin, setShowStdin] = useState(false)
  const [stdin, setStdin] = useState('')

  const p = dark ? DARK : LIGHT
  const vars = {
    '--c-card': p.card,
    '--c-border': p.border,
    '--c-header': p.header,
    '--c-input': p.input,
    '--c-out': p.out,
    '--c-lang': p.lang,
    '--c-copy': p.copy,
    '--c-copy-h': p.copyHover,
    '--c-text': p.text,
    '--c-ph': p.placeholder,
    '--c-muted': p.muted,
    '--c-stdout': p.stdout,
    '--c-err': p.err,
    '--c-run': p.run,
  } as CSSProperties

  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <div
      style={vars}
      className="w-[min(440px,72vw)] overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-card)] shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--c-border)] bg-[var(--c-header)] px-3 py-2">
        <span className="font-mono text-[11px] text-[var(--c-lang)]">{language || 'code'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--c-copy)] transition hover:text-[var(--c-copy-h)]"
          >
            {copied ? 'copied' : 'copy'}
          </button>
          {runnable && (
            <>
              <span className="h-3.5 w-px bg-[var(--c-border)]" />
              <button
                onClick={() => setShowStdin((s) => !s)}
                title="Add input"
                aria-label="Toggle input"
                aria-pressed={showStdin}
                className={`grid h-6 w-6 place-items-center rounded-md transition active:scale-90 ${
                  showStdin
                    ? 'bg-[color-mix(in_srgb,var(--c-lang)_16%,transparent)] text-[var(--c-lang)]'
                    : 'text-[var(--c-copy)] hover:bg-[color-mix(in_srgb,var(--c-text)_8%,transparent)] hover:text-[var(--c-copy-h)]'
                }`}
              >
                <StdinIcon />
              </button>
              <button
                onClick={() => onRun?.(stdin)}
                disabled={running}
                title={running ? 'Running…' : 'Run code'}
                aria-label={running ? 'Running' : 'Run code'}
                className="grid h-6 w-6 place-items-center rounded-md text-[var(--c-run)] transition hover:bg-[color-mix(in_srgb,var(--c-run)_15%,transparent)] active:scale-90 disabled:cursor-default disabled:text-[var(--c-muted)] disabled:hover:bg-transparent"
              >
                {running ? <SpinnerDot /> : <PlayIcon />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* stdin — eases open/closed; fed to the program when you Run (for code that reads input) */}
      {runnable && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-fluid ${
            showStdin ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-b border-[var(--c-border)] bg-[var(--c-input)]">
              <div className="px-3.5 pt-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--c-muted)]">
                Input
              </div>
              <textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                rows={2}
                spellCheck={false}
                data-lenis-prevent
                placeholder="Type input for the program…"
                className="block max-h-[120px] w-full resize-none overflow-y-auto bg-transparent px-3.5 pb-2.5 pt-1 font-mono text-[12px] leading-relaxed text-[var(--c-text)] outline-none placeholder:text-[var(--c-ph)]"
              />
            </div>
          </div>
        </div>
      )}

      <pre className={`${dark ? 'coduel-code' : 'coduel-code-light'} no-scrollbar overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--c-text)]`}>
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }} />
      </pre>

      {(running || output) && (
        <div className="relative border-t border-[var(--c-border)] bg-[var(--c-out)] py-2 pl-3.5 pr-9 font-mono text-[11.5px] leading-relaxed">
          {!running && output && onClearOutput && (
            <button
              onClick={onClearOutput}
              title="Clear output"
              aria-label="Clear output"
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-[var(--c-muted)] transition hover:bg-[color-mix(in_srgb,var(--c-text)_8%,transparent)] hover:text-[var(--c-copy-h)]"
            >
              <CloseIcon />
            </button>
          )}
          {running ? (
            <span className="text-[var(--c-copy)]">running in sandbox…</span>
          ) : output ? (
            <>
              {output.compilerLogs ? (
                <pre className="no-scrollbar overflow-x-auto whitespace-pre-wrap text-[var(--c-err)]">{output.compilerLogs}</pre>
              ) : output.stderr ? (
                <pre className="no-scrollbar overflow-x-auto whitespace-pre-wrap text-[var(--c-err)]">{output.stderr}</pre>
              ) : (
                <pre className="no-scrollbar overflow-x-auto whitespace-pre-wrap text-[var(--c-stdout)]">
                  {output.stdout?.trimEnd() || '(no output)'}
                </pre>
              )}
              <div className="mt-1 text-[10px] text-[var(--c-muted)]">output · {output.durationMs}ms</div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  )
}

// Terminal prompt — toggles the input field.
function StdinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 8 8 12 4 16" />
      <line x1="12" y1="16" x2="18" y2="16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function SpinnerDot() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.2-8.5" />
    </svg>
  )
}
