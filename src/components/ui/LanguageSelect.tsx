import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '../../lib/languages'
import type { Language } from '../../types'

interface LanguageSelectProps {
  value: Language
  onChange: (lang: Language) => void
  disabled?: boolean
}

export function LanguageSelect({ value, onChange, disabled = false }: LanguageSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LANGUAGES.find((l) => l.value === value) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-2 rounded-md border border-line bg-black/[0.04] px-3 py-1.5 font-mono text-xs text-ink transition hover:border-ink-soft/50 hover:bg-black/[0.08] disabled:pointer-events-none disabled:opacity-40 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
      >
        <span className="h-2 w-2 rounded-full bg-gold" />
        {current.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2 3.5 L5 6.5 L8 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 min-w-[170px] overflow-hidden rounded-lg border border-line bg-paper-2 p-1 shadow-[0_20px_44px_-14px_rgba(0,0,0,0.4)]">
          {LANGUAGES.map((l) => {
            const active = l.value === value
            return (
              <button
                key={l.value}
                onClick={() => {
                  onChange(l.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-mono text-xs transition hover:bg-black/[0.05] dark:hover:bg-white/[0.07] ${
                  active ? 'text-ink' : 'text-ink-soft'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${active ? 'bg-gold' : 'border border-ink-soft/40'}`}
                />
                {l.label}
                {active && <span className="ml-auto text-accent-2">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
