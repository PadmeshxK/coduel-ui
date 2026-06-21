import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Loader } from '../ui/Loader'
import { matchmakingApi } from '../../lib/api'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Ranked-duel action: join the matchmaking queue and poll until an opponent is paired, then enter
 * the arena. The same button toggles to "Cancel search" while waiting; leaving mid-search drops us
 * out of the queue so we never become a ghost.
 */
export function RankedDuelMode() {
  const navigate = useNavigate()
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
        if (active.current) navigate(`/match/${res.matchId}`)
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

  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-3">
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
  )
}
