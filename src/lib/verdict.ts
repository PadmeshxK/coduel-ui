import type { Verdict } from '../types'

export const VERDICT_LABEL: Record<Verdict, string> = {
  PENDING: 'Processing…',
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong Answer',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
  RUNTIME_ERROR: 'Runtime Error',
  COMPILE_ERROR: 'Compile Error',
  INTERNAL_ERROR: 'System Error',
}

// Theme-token tones for light-surface UI (scoreboard, feed).
export const verdictTone = (v: Verdict | null) =>
  v === 'ACCEPTED'
    ? 'text-accent-2'
    : v === 'PENDING' || v == null
      ? 'text-ink-soft'
      : 'text-accent'

export type ProblemStatus = 'solved' | 'attempted' | 'failed'

/** Reduce a verdict to a problem's status. PENDING = still judging → counts as attempted. */
export function problemStatus(v: Verdict): ProblemStatus {
  if (v === 'ACCEPTED') return 'solved'
  if (v === 'PENDING') return 'attempted'
  return 'failed'
}

/** Label + theme-token tone per status (works on light + dark surfaces via the accent tokens). */
export const STATUS_META: Record<ProblemStatus, { label: string; tone: string }> = {
  solved: { label: 'Solved', tone: 'text-accent-2' },
  attempted: { label: 'Attempted', tone: 'text-ink-soft' },
  failed: { label: 'Failed', tone: 'text-accent' },
}
