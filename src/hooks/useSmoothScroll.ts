import { useEffect } from 'react'
import Lenis from 'lenis'

// Eased momentum scrolling for the document (mouse wheel + trackpad). Native wheel scroll is
// discrete/"snappy"; Lenis lerps the scroll position for a smooth feel.
//
// Nested scroll areas (Monaco, the editor console, the duel/solve side panels) MUST opt out via
// `data-lenis-prevent`, otherwise Lenis swallows their wheel events and they become unscrollable.
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return // respect users who asked for less motion — leave native scrolling alone
    }

    const lenis = new Lenis({
      // lerp (frame-based) feels more responsive than a long duration — smooth but it keeps up
      // with the wheel instead of lagging behind.
      lerp: 0.14,
      wheelMultiplier: 1.1,
      smoothWheel: true,
    })

    let frame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [])
}
