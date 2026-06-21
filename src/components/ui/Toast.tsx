import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const ANIM_MS = 260
const ENTER: Keyframe[] = [
  { opacity: 0, transform: 'translateX(24px) scale(0.96)' },
  { opacity: 1, transform: 'translateX(0) scale(1)' },
]
const EXIT: Keyframe[] = [
  { opacity: 1, transform: 'translateX(0) scale(1)' },
  { opacity: 0, transform: 'translateX(24px) scale(0.96)' },
]

interface ToastProps {
  children: ReactNode
  // Called once the exit animation has finished — the parent removes the toast here.
  onClose: () => void
  // Auto-dismiss after this many ms (null = stays until something calls close()).
  duration?: number | null
  // Freeze the auto-dismiss timer (and the fuse) while hovered.
  pauseOnHover?: boolean
  // Show the depleting "fuse" bar tied to `duration`.
  fuse?: boolean
  // Receives the imperative close() (plays the exit, then onClose) so content/buttons can dismiss.
  closeRef?: MutableRefObject<() => void>
  className?: string
}

/**
 * Shared bottom-right toast shell. Owns the enter/exit slide animation, the optional auto-dismiss
 * timer (pausable on hover) and the fuse bar — every toast type (room invite, friend request, "now
 * friends" confirmation) just supplies its content so they all move identically.
 */
export function Toast({
  children,
  onClose,
  duration = null,
  pauseOnHover = false,
  fuse = false,
  closeRef,
  className = '',
}: ToastProps) {
  const ref = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remainingRef = useRef(duration ?? 0)
  const startRef = useRef(0)
  const [paused, setPaused] = useState(false)

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    const el = ref.current
    if (!el) {
      onClose()
      return
    }
    const anim = el.animate(EXIT, { duration: ANIM_MS, easing: EASE, fill: 'forwards' })
    anim.onfinish = onClose
  }
  // Keep the exposed close() fresh for parents that drive dismissal (e.g. after an accept).
  if (closeRef) closeRef.current = close

  // Enter on mount; arm the auto-dismiss timer once.
  useEffect(() => {
    ref.current?.animate(ENTER, { duration: ANIM_MS, easing: EASE })
    if (duration != null) {
      startRef.current = Date.now()
      remainingRef.current = duration
      timerRef.current = setTimeout(close, duration)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pause() {
    if (!pauseOnHover || duration == null || closingRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    remainingRef.current -= Date.now() - startRef.current // bank elapsed time
    setPaused(true)
  }
  function resume() {
    if (!pauseOnHover || duration == null || closingRef.current) return
    startRef.current = Date.now()
    timerRef.current = setTimeout(close, remainingRef.current)
    setPaused(false)
  }

  return (
    <div
      ref={ref}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`reflective relative w-[320px] overflow-hidden rounded-2xl border border-line bg-paper-2 p-4 shadow-[0_20px_50px_-20px_rgba(27,24,19,0.6)] ${className}`}
    >
      {children}
      {fuse && duration != null && (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gradient-to-r from-accent to-gold"
          style={{
            animation: `invite-countdown ${duration}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      )}
    </div>
  )
}
