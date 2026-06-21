import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Reveal } from '../components/ui/Reveal'
import { ModeCard, type ModeTone } from '../components/play/ModeCard'
import { RankedDuelMode } from '../components/play/RankedDuelMode'
import { ChallengeMode } from '../components/play/ChallengeMode'
import { SwordsIcon, TerminalIcon, UsersIcon, ZapIcon } from '../components/play/icons'
import { roomApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

interface PlayMode {
  id: string
  label: string
  title: string
  blurb: string
  tone: ModeTone
  icon: ReactNode
  // The mode's interaction, rendered in the card footer. Self-contained (owns its own hooks/state).
  Action: ComponentType
  // Featured modes (the duels) lead the page; the rest sit under "More ways to play".
  featured: boolean
}

// ── The mode registry ──────────────────────────────────────────────────────────────────────────
// Single source of truth for what you can play. Add an entry (+ its Action component) and it slots
// into the grid automatically — the layout below never hardcodes a specific mode.
const PLAY_MODES: PlayMode[] = [
  {
    id: 'ranked',
    label: 'Ranked Duel',
    title: 'Find a match',
    blurb: "There's always someone up for a fight. Get matched and settle it live.",
    tone: 'accent',
    icon: <ZapIcon />,
    Action: RankedDuelMode,
    featured: true,
  },
  {
    id: 'challenge',
    label: 'Challenge',
    title: 'Duel a friend',
    blurb: "Think you're faster? Call out a friend and find out for sure.",
    tone: 'gold',
    icon: <SwordsIcon />,
    Action: ChallengeMode,
    featured: true,
  },
  {
    id: 'practice',
    label: 'Practice',
    title: 'Solo mode',
    blurb: 'Just you and the problems — no clock, no pressure. Get sharper.',
    tone: 'accent-2',
    icon: <TerminalIcon />,
    Action: PracticeMode,
    featured: false,
  },
  {
    id: 'room',
    label: 'Private Room',
    title: 'Play with friends',
    blurb: 'Round up your crew and see who cracks it first.',
    tone: 'neutral',
    icon: <UsersIcon />,
    Action: PrivateRoomMode,
    featured: false,
  },
]

// ── Simple actions (the richer ones live in their own files) ─────────────────────────────────────
function PracticeMode() {
  const navigate = useNavigate()
  return (
    <Button variant="secondary" onClick={() => navigate('/practice')}>
      Browse problems
    </Button>
  )
}

function PrivateRoomMode() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  async function createRoom() {
    setCreating(true)
    try {
      const room = await roomApi.create()
      navigate(`/room/${room.roomId}`)
    } catch {
      setCreating(false)
    }
  }
  return (
    <Button variant="secondary" disabled={creating} onClick={createRoom}>
      {creating ? 'Creating…' : 'Create a room'}
    </Button>
  )
}

export function Lobby() {
  const { user } = useAuth()
  const firstName = (user?.displayName ?? user?.email ?? 'there').split(' ')[0]
  const featured = PLAY_MODES.filter((m) => m.featured)
  const more = PLAY_MODES.filter((m) => !m.featured)

  return (
    <>
      <div className="mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">
          ● Welcome back, {firstName}
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[56px] lg:leading-none">
          Ready to play?
        </h1>
        <p className="mt-4 max-w-xl text-base text-ink-soft sm:text-lg">
          Pick a mode and jump in.
        </p>
      </div>

      {/* featured — the two ways to duel */}
      <Reveal className="mt-10 grid grid-cols-1 items-stretch gap-[22px] md:grid-cols-2">
        {featured.map((m) => (
          <ModeCard key={m.id} label={m.label} title={m.title} blurb={m.blurb} tone={m.tone} icon={m.icon} featured>
            <m.Action />
          </ModeCard>
        ))}
      </Reveal>

      {/* divider into the lighter modes */}
      <div className="mb-5 mt-12 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
          More ways to play
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2">
        {more.map((m) => (
          <ModeCard key={m.id} label={m.label} title={m.title} blurb={m.blurb} tone={m.tone} icon={m.icon}>
            <m.Action />
          </ModeCard>
        ))}
      </div>
    </>
  )
}
