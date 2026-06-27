import { useEffect, useMemo, useRef, useState } from 'react'

const BAR_COUNT = 75

// Deterministic "waveform" bar heights from a seed — stable per clip, organic-looking, zero decode cost
// (real per-message peak extraction would mean fetching+decoding every audio on load). 0.28–1.0 tall.
function waveformBars(seed: number): number[] {
  let s = (seed || 1) >>> 0
  const out: number[] = []
  for (let i = 0; i < BAR_COUNT; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    out.push(0.28 + (s / 0xffffffff) * 0.72)
  }
  return out
}

function fmtClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * A voice-note player — play/pause + a seeded waveform whose bars fill with progress (click to seek) +
 * a running clock. `onAccent` themes it for the sender's accent bubble (white) vs an incoming bubble.
 * Reused by the message bubble and the composer's record-preview so they look identical.
 */
export function VoicePlayer({
  src,
  durationMs,
  seed,
  onAccent = false,
}: {
  src: string
  durationMs?: number | null
  seed: number
  onAccent?: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  // Resolved element duration once metadata loads — held in state so the waveform/clock/seek work
  // before the first play (a render-time read of audioRef never updates). webm-from-MediaRecorder
  // reports Infinity until seeked, so we fall back to the known durationMs prop until a finite value lands.
  const [elDur, setElDur] = useState<number | null>(null)
  const heights = useMemo(() => waveformBars(seed), [seed])

  const total = elDur && elDur > 0 ? elDur : (durationMs ?? 0) / 1000
  const progress = total > 0 ? Math.min(1, cur / total) : 0

  const onDuration = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const d = e.currentTarget.duration
    if (isFinite(d) && d > 0) setElDur(d)
  }

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  // Seek to the x-position within the waveform (used for both a tap and a drag/scrub).
  const seekToClientX = (clientX: number, rect: DOMRect) => {
    const el = audioRef.current
    if (!el || total <= 0) return
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    el.currentTime = frac * total
    setCur(frac * total)
  }

  // Pointer drag scrubbing: seek on press, follow the finger/mouse while held, release on up. Listeners
  // live on window (so the drag tracks even past the bar) and their handles are kept in a ref so an
  // unmount mid-scrub can tear them down (see the cleanup effect below) — otherwise they'd leak.
  const dragRef = useRef<{ move: (ev: PointerEvent) => void; up: (ev: PointerEvent) => void } | null>(null)
  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    seekToClientX(e.clientX, rect)
    const move = (ev: PointerEvent) => seekToClientX(ev.clientX, rect)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      dragRef.current = null
    }
    dragRef.current = { move, up }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Tear down an in-progress scrub if the bubble unmounts mid-drag.
  useEffect(() => () => dragRef.current?.up(new PointerEvent('pointerup')), [])

  const base = onAccent ? 'bg-white/35' : 'bg-ink-soft/30'
  const fill = onAccent ? 'bg-white' : 'bg-accent'
  const ctrl = onAccent
    ? 'bg-white/20 text-white hover:bg-white/30'
    : 'bg-accent text-white hover:brightness-110'
  const clock = onAccent ? 'text-white/80' : 'text-ink-soft'

  return (
    <div className="flex w-full min-w-0 items-center gap-2.5">
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-90 ${ctrl}`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div
        onPointerDown={onBarPointerDown}
        className="flex h-7 min-w-0 flex-1 cursor-pointer touch-none items-center gap-px"
      >
        {heights.map((h, i) => (
          <span
            key={i}
            style={{ height: `${Math.round(h * 100)}%` }}
            className={`min-w-0 flex-1 rounded-full transition-colors ${
              i / BAR_COUNT <= progress ? fill : base
            }`}
          />
        ))}
      </div>
      <span className={`shrink-0 font-mono text-[10.5px] tabular-nums ${clock}`}>
        {fmtClock(playing || cur > 0 ? cur : total)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onDuration}
        onDurationChange={onDuration}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false)
          setCur(0)
        }}
      />
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  )
}
