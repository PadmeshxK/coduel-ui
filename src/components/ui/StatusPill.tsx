import { problemStatus, STATUS_META } from '../../lib/verdict'
import type { Verdict } from '../../types'

/** Sleek themed pill marking a problem's latest status — solved / attempted / failed. */
export function StatusPill({ verdict, className = '' }: { verdict: Verdict; className?: string }) {
  const { label, tone } = STATUS_META[problemStatus(verdict)]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tone} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
