import { useState } from 'react'
import type { PinnedMessageData } from '../../types'

/**
 * The shared pin bar at the top of a thread. Shows the latest pin inline; if there are more, a count +
 * chevron expands the rest (grid-rows collapse, in/out). Tap a pin to jump to it; × unpins.
 */
export function PinnedBar({
  pins,
  me,
  peerName,
  onJump,
  onUnpin,
}: {
  pins: PinnedMessageData[]
  me: number | null
  peerName: string
  onJump: (messageId: number) => void
  onUnpin: (messageId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const latest = pins[0]
  if (!latest) return null
  const rest = pins.slice(1)
  const who = (senderId: number) => (senderId === me ? 'You' : peerName)

  return (
    <div className="border-b border-line bg-paper-2/95 backdrop-blur-sm">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
          <PinIcon />
        </span>
        <button onClick={() => onJump(latest.messageId)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent">Pinned</span>
            {pins.length > 1 && (
              <span className="grid h-[15px] min-w-[15px] place-items-center rounded-full bg-accent/12 px-1 font-mono text-[9px] font-semibold leading-none text-accent">
                {pins.length}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink">
            <PinnedLabel pin={latest} />
          </div>
        </button>
        {rest.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Hide pinned' : 'Show all pinned'}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-ink"
          >
            <Chevron open={open} />
          </button>
        )}
        <button
          onClick={() => onUnpin(latest.messageId)}
          aria-label="Unpin"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      {/* the rest — clean list rows under a hairline divider; only mounted when there ARE more pins */}
      {rest.length > 0 && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-fluid ${
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="mx-4 h-px bg-line/70" />
            <div className="px-2.5 py-1.5">
              {rest.map((p) => (
                <div
                  key={p.messageId}
                  className="group/pin flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-paper"
                >
                  <span className="shrink-0 text-ink-soft/55">
                    <PinIcon />
                  </span>
                  <button onClick={() => onJump(p.messageId)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5 text-[12.5px] text-ink">
                      <PinnedLabel pin={p} />
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-soft">{who(p.senderId)}</div>
                  </button>
                  <button
                    onClick={() => onUnpin(p.messageId)}
                    aria-label="Unpin"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft opacity-0 transition hover:bg-paper-2 hover:text-ink group-hover/pin:opacity-100"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 10.8V4h6v6.8l2 3.2H7l2-3.2Z" />
    </svg>
  )
}

// A pin's content line: an icon + label for image/code pins, or just the text for a normal message.
function PinnedLabel({ pin }: { pin: PinnedMessageData }) {
  if (pin.kind === 'IMAGE') {
    return (
      <>
        <span className="shrink-0 text-accent">
          <PhotoIcon />
        </span>
        <span className="truncate">{pin.preview || 'Photo'}</span>
      </>
    )
  }
  if (pin.kind === 'CODE') {
    return (
      <>
        <span className="shrink-0 text-accent">
          <CodeMiniIcon />
        </span>
        <span className="truncate font-mono text-[11.5px]">Code snippet</span>
      </>
    )
  }
  if (pin.kind === 'PROBLEM_SHARE') {
    return (
      <>
        <span className="shrink-0 text-accent">
          <SwordsMiniIcon />
        </span>
        <span className="truncate">Duel challenge</span>
      </>
    )
  }
  if (pin.kind === 'VOICE') {
    return (
      <>
        <span className="shrink-0 text-accent">
          <MicMiniIcon />
        </span>
        <span className="truncate">Voice message</span>
      </>
    )
  }
  return <span className="truncate">{pin.preview}</span>
}

function PhotoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function CodeMiniIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function SwordsMiniIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" y1="14" x2="9" y2="18" />
      <line x1="7" y1="17" x2="4" y2="20" />
    </svg>
  )
}

function MicMiniIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
