import type { ReactionData } from '../../types'

// Group a message's reactions by emoji → who reacted, so a DM shows e.g. "🔥 2" (max 2 here).
function groupByEmoji(reactions: ReactionData[]): { emoji: string; userIds: number[] }[] {
  const map = new Map<string, number[]>()
  for (const r of reactions) {
    const list = map.get(r.emoji) ?? []
    list.push(r.userId)
    map.set(r.emoji, list)
  }
  return [...map.entries()].map(([emoji, userIds]) => ({ emoji, userIds }))
}

/** The reaction chips under a bubble. Tapping a chip I'm part of clears my reaction (toggle). */
export function ReactionChips({
  reactions,
  me,
  align,
  onToggle,
}: {
  reactions: ReactionData[]
  me: number | null
  align: 'start' | 'end'
  onToggle: (emoji: string) => void
}) {
  if (reactions.length === 0) return null
  const groups = groupByEmoji(reactions)
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${align === 'end' ? 'justify-end pr-1' : 'justify-start pl-9'}`}>
      {groups.map(({ emoji, userIds }) => {
        const mine = me != null && userIds.includes(me)
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 leading-none transition ${
              mine
                ? 'border-accent bg-accent/15 text-ink'
                : 'border-line bg-paper-2 text-ink-soft hover:border-ink-soft/40'
            }`}
          >
            <span className="text-[13px] leading-none">{emoji}</span>
            {userIds.length > 1 && <span className="font-mono text-[10px] leading-none">{userIds.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The hover bar: a few one-tap reactions + a "more" button. One click reacts instantly (the obvious
 * cue), so there's no hidden double-tap and nothing selects the message text.
 */
export function QuickReactionBar({
  emojis,
  onReact,
  onMore,
}: {
  emojis: string[]
  onReact: (emoji: string) => void
  onMore: () => void
}) {
  return (
    <div
      data-reaction-ui
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-paper p-1 shadow-[0_12px_26px_-14px_rgba(27,24,19,0.55)]"
    >
      {emojis.map((e) => (
        <button
          key={e}
          onClick={() => onReact(e)}
          className="grid h-7 w-7 place-items-center rounded-full text-[16px] leading-none transition hover:scale-125 hover:bg-paper-2"
        >
          {e}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-line" />
      <button
        onClick={onMore}
        aria-label="More reactions"
        className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-paper-2 hover:text-ink"
      >
        <MoreIcon />
      </button>
    </div>
  )
}

/** The full emoji palette (opened from the bar's "more"). Exact grid → no trailing whitespace. */
export function ReactionPicker({
  emojis,
  onPick,
}: {
  emojis: string[]
  onPick: (emoji: string) => void
}) {
  return (
    <div className="grid w-max grid-cols-[repeat(8,2rem)] gap-1 rounded-2xl border border-line bg-paper p-2 shadow-[0_18px_36px_-16px_rgba(27,24,19,0.6)]">
      {emojis.map((e) => (
        <button
          key={e}
          onClick={() => onPick(e)}
          className="grid h-8 w-8 place-items-center rounded-full text-[17px] leading-none transition hover:scale-110 hover:bg-paper-2"
        >
          {e}
        </button>
      ))}
    </div>
  )
}

function MoreIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}
