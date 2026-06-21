interface PagerProps {
  page: number // 0-based
  totalPages: number
  onChange: (page: number) => void
}

// Windowed page tokens (1-based for display): always show first + last, a window around the current
// page, and ellipses for the gaps. Small catalogs (≤7 pages) just list every page.
function windowPages(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const c = current + 1
  const out: (number | 'gap')[] = [1]
  if (c > 4) out.push('gap')
  for (let i = Math.max(2, c - 1); i <= Math.min(total - 1, c + 1); i++) out.push(i)
  if (c < total - 3) out.push('gap')
  out.push(total)
  return out
}

/** Minimal, editorial page controls — custom chevrons + numbered pages, accent-filled current page. */
export function Pager({ page, totalPages, onChange }: PagerProps) {
  if (totalPages <= 1) return null

  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      <Arrow dir="prev" disabled={page === 0} onClick={() => onChange(page - 1)} />

      {windowPages(page, totalPages).map((t, i) =>
        t === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 font-mono text-[12px] text-ink-soft">
            ·· ·
          </span>
        ) : (
          <button
            key={t}
            onClick={() => onChange(t - 1)}
            aria-current={t - 1 === page ? 'page' : undefined}
            className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 font-mono text-[12px] transition ${
              t - 1 === page
                ? 'border-accent bg-accent text-white'
                : 'border-line text-ink-soft hover:border-ink-soft/50 hover:text-ink'
            }`}
          >
            {t}
          </button>
        ),
      )}

      <Arrow dir="next" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)} />
    </div>
  )
}

function Arrow({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous page' : 'Next page'}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:border-ink-soft/50 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={dir === 'prev' ? 'rotate-180' : ''}
        aria-hidden
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
