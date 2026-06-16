import { useState } from 'react'
import type { ReactNode } from 'react'

interface CollapsibleProps {
  title: string
  defaultOpen?: boolean
  /** Optional node shown on the right of the header (e.g. a count). */
  right?: ReactNode
  children: ReactNode
  className?: string
}

export function Collapsible({
  title,
  defaultOpen = true,
  right,
  children,
  className = '',
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={`reflective rounded-[14px] border border-line bg-paper-2 shadow-[0_18px_40px_-24px_rgba(27,24,19,0.25)] ${className}`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-[22px] py-4"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
          {title}
        </span>
        {right}
        <svg
          width="11"
          height="11"
          viewBox="0 0 10 10"
          className={`ml-auto text-ink-soft transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
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

      {/* grid-rows 1fr<->0fr animates height smoothly without measuring content */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-[22px] pb-[22px]">{children}</div>
        </div>
      </div>
    </div>
  )
}
