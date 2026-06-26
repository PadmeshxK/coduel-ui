import { problemStatus, STATUS_META } from '../../lib/verdict'
import type { Verdict } from '../../types'

/** Sleek themed pill marking a problem's latest status — solved / attempted / failed. */
export function StatusPill({ verdict, className = '' }: { verdict: Verdict; className?: string }) {
  const { label, tone } = STATUS_META[problemStatus(verdict)]
  return (
    <span
      className={`inline-flex items-center rounded-full border border-line bg-paper-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tone} ${className}`}
    >
      {/* -mr compensates the trailing letter-spacing so the label sits centered in the pill */}
      <span className="-mr-[0.14em]">{label}</span>
    </span>
  )
}
