import type { Verdict } from '../types'

export const VERDICT_LABEL: Record<Verdict, string> = {
  PENDING: 'judging…',
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong Answer',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
  RUNTIME_ERROR: 'Runtime Error',
  COMPILE_ERROR: 'Compile Error',
  INTERNAL_ERROR: 'Judging Error',
}

// Theme-token tones for light-surface UI (scoreboard, feed).
export const verdictTone = (v: Verdict | null) =>
  v === 'ACCEPTED'
    ? 'text-accent-2'
    : v === 'PENDING' || v == null
      ? 'text-ink-soft'
      : 'text-accent'
