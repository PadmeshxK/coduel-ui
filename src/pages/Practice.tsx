import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Reveal } from '../components/ui/Reveal'
import { Loader } from '../components/ui/Loader'
import { Pager } from '../components/ui/Pager'
import { Popover } from '../components/ui/Popover'
import { StatusPill } from '../components/ui/StatusPill'
import { problemApi } from '../lib/api'
import { loadPracticeFilter, savePracticeFilter } from '../lib/practiceFilter'
import { useAsync } from '../hooks/useAsync'
import { useLenisBox } from '../hooks/useLenisBox'
import type { FilterOptionsData, ProblemSort, ProblemStatusFilter } from '../types'

const SORTS: { value: ProblemSort; label: string }[] = [
  { value: 'rating-asc', label: 'Rating ↑' },
  { value: 'rating-desc', label: 'Rating ↓' },
]
const STATUSES: { value: ProblemStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNSOLVED', label: 'Unsolved' },
  { value: 'SOLVED', label: 'Solved' },
]

function ratingTone(rating: number): string {
  if (rating < 1200) return 'text-accent-2 border-accent-2/40'
  if (rating < 1800) return 'text-gold border-gold/40'
  return 'text-accent border-accent/40'
}

const PAGE_SIZES = [10, 25, 50, 100]

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

export function Practice() {
  // Restore the last-used filters (persisted to localStorage so they survive a refresh).
  const [saved] = useState(loadPracticeFilter)
  const [query, setQuery] = useState(saved.q)
  const [debounced, setDebounced] = useState(saved.q.trim())
  const [sort, setSort] = useState<ProblemSort>(saved.sort)
  const [status, setStatus] = useState<ProblemStatusFilter>(saved.status)
  const [ratings, setRatings] = useState<number[]>(saved.ratings)
  const [tags, setTags] = useState<string[]>(saved.tags)
  const [tagSearch, setTagSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // Persist filters (not page) so they're restored on refresh and shared with the Solve page.
  useEffect(() => {
    savePracticeFilter({ q: query, sort, status, ratings, tags })
  }, [query, sort, status, ratings, tags])

  // Any filter/sort/page-size change snaps back to the first page.
  useEffect(() => {
    setPage(0)
  }, [debounced, sort, status, ratings.join(','), tags.join(','), pageSize])

  const { data: options } = useAsync<FilterOptionsData>(() => problemApi.filterOptions(), [])

  const { data, loading, error } = useAsync(
    () => problemApi.getPage({ page, size: pageSize, q: debounced, sort, status, ratings, tags }),
    [page, pageSize, debounced, sort, status, ratings.join(','), tags.join(',')],
  )
  const problems = data?.content ?? []
  const total = data?.totalElements ?? 0
  const totalPages = data?.totalPages ?? 0

  const filteredTags = useMemo(() => {
    const all = options?.tags ?? []
    const q = tagSearch.trim().toLowerCase()
    return q ? all.filter((t) => t.toLowerCase().includes(q)) : all
  }, [options, tagSearch])

  // Smooth-scroll the filter dropdown lists, and (via useLenisBox's prevent override + data-lenis-
  // prevent on the elements) stop their wheel from scrolling the page behind them.
  const ratingScrollRef = useRef<HTMLDivElement>(null)
  const tagScrollRef = useRef<HTMLDivElement>(null)
  useLenisBox(ratingScrollRef, [options?.ratings.length])
  useLenisBox(tagScrollRef, [options?.tags.length])

  const hasActive = ratings.length > 0 || tags.length > 0 || status !== 'ALL' || debounced !== ''

  function clearAll() {
    setQuery('')
    setStatus('ALL')
    setRatings([])
    setTags([])
    setTagSearch('')
  }

  return (
    <>
      <div className="mb-7 mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">● Practice</div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none">
          Problem set
        </h1>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-soft">{loading ? 'Loading…' : `${total} problem${total === 1 ? '' : 's'}`}</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Per page</span>
            <div className="flex h-[34px] items-center gap-1 rounded-xl border border-line bg-paper-2 p-1">
              {PAGE_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setPageSize(s)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition ${
                    pageSize === s
                      ? 'bg-paper text-ink shadow-[0_1px_4px_-1px_rgba(27,24,19,0.25)]'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-ink-soft">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search problems…"
            className="h-[38px] w-full rounded-xl border border-line bg-paper pl-9 pr-3 font-mono text-[12px] outline-none transition focus:border-accent"
          />
        </div>

        <Segmented options={STATUSES} value={status} onChange={setStatus} />

        {(options?.ratings.length ?? 0) > 0 && (
          <Popover label="Rating" count={ratings.length} width="w-[280px]">
            <div ref={ratingScrollRef} data-lenis-prevent className="max-h-64 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5 p-3">
                {options!.ratings.map((r) => (
                  <Chip key={r} active={ratings.includes(r)} onClick={() => setRatings((p) => toggle(p, r))}>
                    {r}
                  </Chip>
                ))}
              </div>
            </div>
            {ratings.length > 0 && <PanelClear onClick={() => setRatings([])} />}
          </Popover>
        )}

        {(options?.tags.length ?? 0) > 0 && (
          <Popover label="Tags" count={tags.length} align="right">
            <div className="border-b border-line p-2">
              <input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Filter tags…"
                className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[12px] outline-none transition focus:border-accent"
              />
            </div>
            <div ref={tagScrollRef} data-lenis-prevent className="max-h-56 overflow-y-auto">
              <div className="p-1.5">
              {filteredTags.length === 0 ? (
                <div className="px-2 py-4 text-center font-mono text-[11px] text-ink-soft">no matching tags</div>
              ) : (
                filteredTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTags((p) => toggle(p, t))}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-mono text-[12px] transition ${
                      tags.includes(t)
                        ? 'bg-accent/[0.08] text-ink'
                        : 'text-ink-soft hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="truncate">{t}</span>
                    {tags.includes(t) && <span className="text-accent-2">✓</span>}
                  </button>
                ))
              )}
              </div>
            </div>
            {tags.length > 0 && <PanelClear onClick={() => setTags([])} />}
          </Popover>
        )}

        <Segmented options={SORTS} value={sort} onChange={setSort} />
      </div>

      {/* ── active filter pills ── */}
      {(ratings.length > 0 || tags.length > 0 || status !== 'ALL') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {status !== 'ALL' && (
            <Pill onRemove={() => setStatus('ALL')}>{status === 'SOLVED' ? 'Solved' : 'Unsolved'}</Pill>
          )}
          {ratings.map((r) => (
            <Pill key={r} onRemove={() => setRatings((p) => toggle(p, r))}>
              {r}
            </Pill>
          ))}
          {tags.map((t) => (
            <Pill key={t} onRemove={() => setTags((p) => toggle(p, t))}>
              {t}
            </Pill>
          ))}
          <button
            onClick={clearAll}
            className="ml-1 font-mono text-[11px] uppercase tracking-[0.12em] text-accent transition hover:opacity-70"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="mt-6">
        {error && (
          <Card>
            <p className="font-mono text-sm text-accent">Couldn't load problems: {error}</p>
          </Card>
        )}

        {!error && loading && (
          <Card className="grid place-items-center py-16">
            <Loader label="Loading problems" />
          </Card>
        )}

        {!error && !loading && problems.length === 0 && (
          <Card>
            <p className="text-ink-soft">
              {hasActive ? 'No problems match these filters.' : 'No problems yet — seed some on the backend.'}
            </p>
          </Card>
        )}

        {!error && !loading && problems.length > 0 && (
          <>
          <Reveal key={`${debounced}:${sort}:${status}:${ratings.join(',')}:${tags.join(',')}:${page}`}>
            <Card className="!p-0">
              {problems.map((p, i) => (
                <Link
                  key={p.slug}
                  to={`/practice/${p.slug}`}
                  className={`group flex items-center gap-4 px-[22px] py-4 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.03] ${
                    i > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  {/* left: a clean check when solved, otherwise the index */}
                  {p.solved ? (
                    <span className="grid w-6 shrink-0 place-items-center text-accent-2" aria-label="Solved">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  ) : (
                    <span className="w-6 shrink-0 text-center font-mono text-[13px] text-ink-soft/70">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className={`truncate text-[16px] font-semibold transition-colors ${
                        p.solved ? 'text-ink-soft' : 'text-ink group-hover:text-accent'
                      }`}
                    >
                      {p.title}
                    </span>
                    {p.tags && p.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-ink-soft dark:bg-white/[0.06]">
                            {t}
                          </span>
                        ))}
                        {p.tags.length > 3 && <span className="font-mono text-[10px] text-ink-soft">+{p.tags.length - 3}</span>}
                      </div>
                    )}
                  </div>

                  {/* attempted-but-unsolved verdict, kept subtle */}
                  {!p.solved && p.status && <StatusPill verdict={p.status} />}

                  {p.rating != null && (
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] ${ratingTone(p.rating)}`}>
                      {p.rating}
                    </span>
                  )}

                  {/* chevron slides in on hover — replaces the old persistent "solve →" */}
                  <svg
                    className="shrink-0 -translate-x-1 text-ink-soft opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              ))}
            </Card>
          </Reveal>
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </>
  )
}

function Pill({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 py-1 pl-3 pr-1.5 font-mono text-[11px] text-ink">
      {children}
      <button
        onClick={onRemove}
        aria-label="Remove filter"
        className="grid h-4 w-4 place-items-center rounded-full text-ink-soft transition hover:bg-accent/15 hover:text-accent"
      >
        ✕
      </button>
    </span>
  )
}

function PanelClear({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full border-t border-line py-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft transition hover:text-accent"
    >
      Clear
    </button>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-line text-ink-soft hover:border-ink-soft/50 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex h-[38px] shrink-0 items-center gap-1 rounded-xl border border-line bg-paper-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
            value === o.value
              ? 'bg-paper text-ink shadow-[0_1px_4px_-1px_rgba(27,24,19,0.25)]'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
