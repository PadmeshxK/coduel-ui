import { useEffect, useRef, useState, type ReactNode } from 'react'

interface PopoverProps {
  label: string
  /** Number of active selections — shown as a badge and highlights the trigger. */
  count?: number
  align?: 'left' | 'right'
  width?: string
  children: ReactNode
}

/** A compact dropdown trigger + panel (click-outside to close, scale/fade toggle). Used for filter
 *  menus that need to scale to many options without cluttering the toolbar. */
export function Popover({ label, count = 0, align = 'left', width = 'w-72', children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const active = count > 0 || open

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
          active
            ? 'border-accent/50 bg-accent/[0.06] text-ink'
            : 'border-line text-ink-soft hover:border-ink-soft/50 hover:text-ink'
        }`}
      >
        {label}
        {count > 0 && (
          <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white">
            {count}
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 10 10" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className={`reflective absolute z-40 mt-2 ${align === 'right' ? 'right-0' : 'left-0'} ${width} origin-top overflow-hidden rounded-xl border border-line bg-paper-2 shadow-[0_18px_44px_-20px_rgba(27,24,19,0.55)] transition duration-150 ${
          open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
