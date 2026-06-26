import { SwordsIcon } from '../play/icons'
import { useProblem } from './problemCache'

// Rating → tone, mirroring the Practice list so a difficulty reads the same everywhere.
function ratingTone(rating: number): string {
  if (rating < 1200) return 'text-accent-2 border-accent-2/40'
  if (rating < 1800) return 'text-gold border-gold/40'
  return 'text-accent border-accent/40'
}

export type ShareState = 'idle' | 'pending' | 'declined'

/**
 * A shared problem rendered as a clean card in the thread — title, difficulty, tags — with "Challenge
 * to a duel" (fires a problem-specific challenge to the peer) and "Open" (jump to the solo solve page).
 * Either participant can act. Themed in paper/ink/accent tokens so it adapts to the per-DM theme.
 */
export function ProblemShareCard({
  slug,
  caption,
  peerName,
  state,
  onChallenge,
  onCancel,
  onOpen,
}: {
  slug: string
  caption?: string | null
  peerName: string
  state: ShareState
  onChallenge: () => void
  onCancel: () => void
  onOpen: () => void
}) {
  const { problem, missing } = useProblem(slug)
  const hasCaption = !!caption && caption.trim() !== ''

  return (
    <div className="w-[min(420px,74vw)] rounded-2xl border border-line bg-paper-2 p-4 shadow-[0_14px_30px_-20px_rgba(27,24,19,0.55)]">
      {missing ? (
        <div className="flex items-center gap-2 py-1 text-[13px] text-ink-soft">
          <SwordsIcon size={15} />
          This problem is no longer available.
        </div>
      ) : !problem ? (
        <div className="space-y-2.5">
          <div className="h-5 w-2/3 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.06]" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-display text-[18px] font-bold leading-snug tracking-[-0.015em] text-ink">
              {problem.title}
            </h4>
            {problem.rating != null && (
              <span
                className={`mt-1 shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10.5px] ${ratingTone(problem.rating)}`}
              >
                {problem.rating}
              </span>
            )}
          </div>
          {problem.tags && problem.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {problem.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-black/[0.05] px-2 py-0.5 font-mono text-[10px] text-ink-soft dark:bg-white/[0.06]"
                >
                  {t}
                </span>
              ))}
              {problem.tags.length > 3 && (
                <span className="font-mono text-[10px] text-ink-soft">+{problem.tags.length - 3}</span>
              )}
            </div>
          )}
        </>
      )}

      {hasCaption && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-snug text-ink-soft">{caption}</p>
      )}

      {state === 'declined' && (
        <p className="mt-3 font-mono text-[10.5px] text-accent">✗ {peerName} declined — challenge again?</p>
      )}

      <div className="mt-4">
        {state === 'pending' ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[12.5px] text-ink">
              <span className="loader-ring shrink-0" style={{ width: 14, height: 14 }} />
              <span className="truncate">Waiting for {peerName}…</span>
            </div>
            <button
              onClick={onCancel}
              className="shrink-0 rounded-xl px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onChallenge}
              disabled={missing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_22px_-12px_var(--color-accent)] transition hover:brightness-[1.08] active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
            >
              <SwordsIcon size={15} />
              {state === 'declined' ? 'Challenge again' : 'Challenge to a duel'}
            </button>
            <button
              onClick={onOpen}
              disabled={missing}
              className="shrink-0 rounded-xl border border-line bg-paper px-4 py-2.5 text-[13px] font-medium text-ink-soft transition hover:border-ink-soft/45 hover:text-ink disabled:opacity-50"
            >
              Open
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
