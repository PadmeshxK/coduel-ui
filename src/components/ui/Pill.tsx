import type { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  className?: string
}

export function Pill({ children, className = '' }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line px-[11px] py-[5px] font-mono text-[11px] text-ink-soft ${className}`}
    >
      {children}
    </span>
  )
}
