import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SectionLabel } from '../components/ui/SectionLabel'
import { Loader } from '../components/ui/Loader'
import { matchmakingApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function Lobby() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const searchingRef = useRef(false)
  searchingRef.current = searching

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      // left mid-search -> drop out of the queue so we don't become a ghost
      if (searchingRef.current) void matchmakingApi.leave()
    }
  }, [])

  async function findDuel() {
    setError(null)
    setSearching(true)
    searchingRef.current = true
    try {
      let res = await matchmakingApi.join()
      // poll until an opponent is paired (or the user cancels)
      while (active.current && searchingRef.current && res.status === 'WAITING') {
        await sleep(2000)
        if (!active.current || !searchingRef.current) return
        res = await matchmakingApi.status()
      }
      // only enter the duel if we're still actively searching (not cancelled)
      if (active.current && searchingRef.current && res.status === 'MATCHED' && res.matchId) {
        // a brief "opponent found" beat so the handoff feels deliberate, not an instant jump
        setFound(true)
        await sleep(900)
        if (active.current) navigate(`/duel/${res.matchId}`)
      }
    } catch (e) {
      if (searchingRef.current) setError(e instanceof Error ? e.message : 'Matchmaking failed')
    } finally {
      if (active.current && !searchingRef.current) setFound(false)
      if (active.current) setSearching(false)
    }
  }

  async function cancelSearch() {
    // Stop the poll loop immediately, then drop out of the queue.
    searchingRef.current = false
    setSearching(false)
    setFound(false)
    try {
      await matchmakingApi.leave()
    } catch {
      // ignore — we've already left the searching state client-side
    }
  }

  const firstName = (user?.displayName ?? user?.email ?? 'there').split(' ')[0]

  return (
    <>
      <div className="mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">
          ● Welcome back, {firstName}
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[56px] lg:leading-none">
          Ready to duel?
        </h1>
        <p className="mt-4 max-w-xl text-base text-ink-soft sm:text-lg">
          Two coders, one problem, a live race — the first correct submission wins.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-[22px] md:grid-cols-[1.2fr_1fr]">
        <Card className="flex flex-col justify-between">
          <div>
            <SectionLabel>Ranked Duel</SectionLabel>
            <p className="mt-3.5 font-display text-[24px] font-bold">Find a match</p>
            <p className="mt-2 text-ink-soft">
              Hop in the queue — we'll pair you with an opponent who's ready to play.
            </p>
          </div>
          <div className="mt-6 flex min-h-[44px] flex-wrap items-center gap-3">
            {found ? (
              // opponent found — a calm confirmation beat before the duel opens
              <span className="animate-reveal flex items-center gap-3 font-mono text-sm">
                <span className="text-accent-2">✓ Opponent found</span>
                <Loader inline size={15} label="entering the arena" />
              </span>
            ) : (
              <>
                {/* same slot, toggled action — idle: find, searching: cancel */}
                <Button
                  onClick={searching ? cancelSearch : findDuel}
                  variant={searching ? 'secondary' : 'primary'}
                  className={searching ? '' : 'attract'}
                >
                  {searching ? 'Cancel search' : 'Find a duel'}
                </Button>
                {searching && (
                  <Loader inline size={16} label="finding an opponent" className="animate-reveal" />
                )}
                {error && <span className="font-mono text-xs text-accent">{error}</span>}
              </>
            )}
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <SectionLabel>Practice</SectionLabel>
            <p className="mt-3.5 font-display text-[24px] font-bold">Solo mode</p>
            <p className="mt-2 text-ink-soft">
              Work through the full problem set at your own pace. No timer.
            </p>
          </div>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate('/practice')}>
              Browse problems
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
