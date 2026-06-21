import type { ReactNode } from 'react'

export type ModeTone = 'accent' | 'gold' | 'accent-2' | 'neutral'

// Static class strings per tone (so Tailwind's compiler keeps them) — the colored icon tile + dot
// give each mode its own identity while staying inside the editorial palette.
const TONES: Record<ModeTone, { tile: string; dot: string }> = {
  accent: { tile: 'bg-accent/10 text-accent', dot: 'bg-accent' },
  gold: { tile: 'bg-gold/10 text-gold', dot: 'bg-gold' },
  'accent-2': { tile: 'bg-accent-2/10 text-accent-2', dot: 'bg-accent-2' },
  neutral: { tile: 'bg-ink/[0.06] text-ink-soft', dot: 'bg-ink-soft' },
}

interface ModeCardProps {
  label: string
  title: string
  blurb: string
  tone: ModeTone
  icon: ReactNode
  /** Featured modes (the duels) get more presence — larger tile, title and padding. */
  featured?: boolean
  /** The mode's interaction (button, friend picker…) — rendered in the footer slot. */
  children: ReactNode
}

/**
 * One Play-mode panel: a reflective card with a tone-tinted icon, a mono label, a display title, a
 * blurb, and a footer that holds the mode's own interaction. Presentational only — the registry in
 * Lobby supplies the content and the action component, so adding a mode never touches this file.
 */
export function ModeCard({ label, title, blurb, tone, icon, featured = false, children }: ModeCardProps) {
  const t = TONES[tone]
  return (
    <div
      className={`reflective flex flex-col rounded-[14px] border border-line bg-paper-2 shadow-[0_18px_40px_-24px_rgba(27,24,19,0.25)] transition-transform duration-300 hover:-translate-y-0.5 ${
        featured ? 'p-6 sm:p-7' : 'p-[22px]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid shrink-0 place-items-center rounded-xl ${t.tile} ${
            featured ? 'h-12 w-12' : 'h-10 w-10'
          }`}
        >
          {icon}
        </span>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
          <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
          {label}
        </span>
      </div>

      <p
        className={`mt-4 font-display font-bold tracking-[-0.01em] ${
          featured ? 'text-[24px]' : 'text-[20px]'
        }`}
      >
        {title}
      </p>
      <p className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-ink-soft">{blurb}</p>

      <div className="mt-5">{children}</div>
    </div>
  )
}
