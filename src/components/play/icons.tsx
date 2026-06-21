// Stroke-SVG glyphs for the Play modes — line language matches the rest of the editorial UI (no
// emoji). Each takes a size so the same icon works in a mode tile (22) and a friend chip (14).
interface IconProps {
  size?: number
  className?: string
}

const stroke = (size: number) =>
  ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  })

// Ranked duel — a lightning bolt (instant, energetic pairing).
export function ZapIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...stroke(size)} className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

// Challenge a friend — crossed swords (a head-to-head duel).
export function SwordsIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...stroke(size)} className={className}>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" y1="14" x2="9" y2="18" />
      <line x1="7" y1="17" x2="4" y2="20" />
      <line x1="3" y1="19" x2="5" y2="21" />
    </svg>
  )
}

// Practice — a terminal prompt (solo, at your own pace).
export function TerminalIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...stroke(size)} className={className}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

// "Go" affordance on the challenge chips — nudges right on hover.
export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...stroke(size)} className={className}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

// "Find a friend" — a magnifier (jump to the Friends page to duel anyone).
export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...stroke(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
    </svg>
  )
}

// Private room — a group of players.
export function UsersIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...stroke(size)} className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
