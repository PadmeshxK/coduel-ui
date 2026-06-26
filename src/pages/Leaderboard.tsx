import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Reveal } from '../components/ui/Reveal'
import { Loader } from '../components/ui/Loader'
import { leaderboardApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import type { LeaderboardData, PageData } from '../types'

const PAGE_SIZE = 20

function record(row: LeaderboardData) {
  const games = row.wins + row.losses
  const rate = games === 0 ? 0 : Math.round((row.wins / games) * 100)
  return { games, rate }
}

// editorial column grid, shared by the rubric strip and every row
const GRID =
  'grid grid-cols-[2.75rem_auto_1fr_auto] items-center gap-x-4 sm:grid-cols-[2.75rem_auto_1fr_8.5rem_5.5rem]'

export function Leaderboard() {
  const { user } = useAuth()

  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<PageData<LeaderboardData> | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LeaderboardData[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const searching = query.trim().length > 0

  // Paginated rankings — only while not searching.
  useEffect(() => {
    if (searching) return
    let active = true
    setLoading(true)
    leaderboardApi
      .getPage(page, PAGE_SIZE)
      .then((data) => active && (setPageData(data), setError(null)))
      .catch((e) => active && setError(e?.message ?? 'Failed to load'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [page, searching])

  // Name-prefix search — debounced, hits the backend only when the box is non-empty.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    let active = true
    setLoading(true)
    const t = setTimeout(() => {
      leaderboardApi
        .search(q)
        .then((data) => active && (setResults(data), setError(null)))
        .catch((e) => active && setError(e?.message ?? 'Search failed'))
        .finally(() => active && setLoading(false))
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query])

  const rows = searching ? results ?? [] : pageData?.content ?? []
  const totalPages = pageData?.totalPages ?? 0

  return (
    <>
      <div className="mb-8 mt-10 [@media(max-height:780px)]:mb-2 [@media(max-height:780px)]:mt-6">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent [@media(max-height:780px)]:hidden">
          Leaderboard
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none [@media(max-height:780px)]:!text-[24px] [@media(max-height:780px)]:!leading-tight">
          The standings
        </h1>
        <p className="mt-4 text-ink-soft [@media(max-height:780px)]:hidden">
          Ranked by duels won
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-soft">
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players by name…"
          className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-4 font-mono text-[13px] outline-none transition focus:border-accent"
        />
      </div>

      {error && (
        <Card>
          <p className="font-mono text-sm text-accent">Couldn't load leaderboard: {error}</p>
        </Card>
      )}

      {!error && loading && rows.length === 0 && (
        <Card className="grid place-items-center py-16">
          <Loader label="Loading players" />
        </Card>
      )}

      {!error && !loading && rows.length === 0 && (
        <Card>
          <p className="text-ink-soft">
            {searching
              ? `No players match "${query.trim()}".`
              : 'No ranked players yet — go win a duel.'}
          </p>
        </Card>
      )}

      {!error && rows.length > 0 && (
        <Reveal key={searching ? 'search' : `page-${page}`}>
        <Card className="!p-0 overflow-hidden">
          {/* rubric — newspaper column heads, not a generic table */}
          <div
            className={`${GRID} border-b border-line px-[22px] py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft`}
          >
            <span>{searching ? '' : 'Rank'}</span>
            <span className="col-span-2">Player</span>
            <span className="hidden text-right sm:block">Win rate</span>
            <span className="text-right">W · L</span>
          </div>

          {rows.map((row, i) => {
            const rank = searching ? null : page * PAGE_SIZE + i + 1
            const top = rank !== null && rank <= 3
            const { games, rate } = record(row)
            const isMe = user?.id === row.userId
            return (
              <div
                key={row.userId}
                className={`${GRID} border-t border-line px-[22px] py-4 transition ${
                  isMe ? 'border-l-2 border-l-accent bg-accent/[0.05]' : ''
                } ${rank === 1 ? 'bg-gold/[0.06]' : ''}`}
              >
                {/* oversized editorial numeral; gold for the podium */}
                <span
                  className={`font-display font-extrabold tabular-nums leading-none ${
                    top ? 'text-gold' : 'text-ink-soft'
                  } ${rank === 1 ? 'text-[28px]' : 'text-[19px]'}`}
                >
                  {rank !== null ? String(rank).padStart(2, '0') : '·'}
                </span>

                <Avatar
                  initial={row.displayName.charAt(0).toUpperCase()}
                  src={row.avatarUrl}
                  size={rank === 1 ? 44 : 36}
                />

                <span className="min-w-0">
                  <span
                    className={`block truncate text-[16px] font-semibold ${isMe ? 'text-accent' : ''}`}
                  >
                    {row.displayName}
                    {isMe && <span className="ml-2 font-mono text-[11px] text-ink-soft">you</span>}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft sm:hidden">
                    {games} game{games === 1 ? '' : 's'} · {rate}%
                  </span>
                </span>

                {/* slim win-rate meter — the editorial data flourish */}
                <span className="hidden items-center gap-2.5 sm:flex">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-accent-2"
                      style={{ width: `${rate}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-ink-soft tabular-nums">
                    {rate}%
                  </span>
                </span>

                <span className="text-right font-mono text-sm tabular-nums">
                  <span className="text-accent-2">{row.wins}</span>
                  <span className="text-ink-soft">·</span>
                  <span className="text-accent">{row.losses}</span>
                </span>
              </div>
            )
          })}
        </Card>
        </Reveal>
      )}

      {/* Pagination — hidden during search */}
      {!searching && !error && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Prev
          </Button>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            Page {page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </>
  )
}
