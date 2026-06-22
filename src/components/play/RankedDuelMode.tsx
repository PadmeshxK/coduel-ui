import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Loader } from '../ui/Loader'
import { matchmakingApi } from '../../lib/api'
import { useStomp } from '../../hooks/useStomp'
import { useNotifications } from '../../hooks/useNotifications'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Ranked-duel action: join the matchmaking queue and wait. When a pair is made the backend pushes
 * MATCHMAKING_FOUND to both players over the shared socket (handled in useNotifications), which
 * navigates us into the duel — no polling. We still navigate from the join response if WE were the
 * one who completed the pair, and re-check authoritatively on a WS reconnect in case a push was missed.
 * Leaving mid-search drops us out of the queue so we never become a ghost.
 */
export function RankedDuelMode() {
  const navigate = useNavigate()
  const { connected } = useStomp()
  const { matchmakingFound } = useNotifications()
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const searchingRef = useRef(false)
  searchingRef.current = searching
  const wasConnected = useRef(false)
  const enteringRef = useRef(false)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      // left mid-search -> drop out of the queue so we don't become a ghost
      if (searchingRef.current) void matchmakingApi.leave()
    }
  }, [])

  // Reconnected mid-search → a MATCHMAKING_FOUND push could have been missed (pub/sub has no replay),
  // so re-check authoritatively and enter if we were paired while away.
  useEffect(() => {
    if (connected && wasConnected.current && searchingRef.current) {
      void matchmakingApi
        .status()
        .then((res) => {
          if (res.status === 'MATCHED' && res.matchId) enterMatch(res.matchId)
        })
        .catch(() => {})
    }
    if (connected) wasConnected.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  // Paired — the MATCHMAKING_FOUND push (delivered to BOTH players) lands here. Show the beat + enter.
  useEffect(() => {
    if (matchmakingFound && searchingRef.current) enterMatch(matchmakingFound.matchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchmakingFound])

  function enterMatch(matchId: number) {
    if (!active.current || enteringRef.current) return
    enteringRef.current = true // run the beat + navigate exactly once, whichever trigger fires first
    // a deliberate "opponent found" cooldown so BOTH players see the confirmation before the jump
    setFound(true)
    void sleep(1000).then(() => {
      if (active.current) navigate(`/match/${matchId}`)
    })
  }

  async function findDuel() {
    setError(null)
    setSearching(true)
    searchingRef.current = true
    try {
      const res = await matchmakingApi.join()
      if (res.status === 'MATCHED' && res.matchId) {
        enterMatch(res.matchId)
      }
      // WAITING → stay searching; the MATCHMAKING_FOUND push navigates us in when someone pairs with us.
    } catch (e) {
      if (searchingRef.current) setError(e instanceof Error ? e.message : 'Matchmaking failed')
      searchingRef.current = false
      if (active.current) setSearching(false)
    }
  }

  async function cancelSearch() {
    // Stop searching immediately, then drop out of the queue.
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
