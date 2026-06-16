import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '../../lib/languages'
import type { Language } from '../../types'

interface LanguageSelectProps {
  value: Language
  onChange: (lang: Language) => void
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
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
        className="flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.05] px-3 py-1.5 font-mono text-xs text-[#e7d9bd] transition hover:border-white/35 hover:bg-white/[0.1]"
      >
        <span className="h-2 w-2 rounded-full bg-[#E5944A]" />
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
        <div className="absolute right-0 z-20 mt-2 min-w-[170px] overflow-hidden rounded-lg border border-white/15 bg-[#241b13] p-1 shadow-[0_20px_44px_-14px_rgba(0,0,0,0.7)]">
          {LANGUAGES.map((l) => {
            const active = l.value === value
            return (
              <button
                key={l.value}
                onClick={() => {
                  onChange(l.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-mono text-xs transition hover:bg-white/[0.07] ${
                  active ? 'text-[#e7d9bd]' : 'text-[#a2937c]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? 'bg-[#E5944A]' : 'border border-white/25'
                  }`}
                />
                {l.label}
                {active && <span className="ml-auto text-[#74B394]">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
