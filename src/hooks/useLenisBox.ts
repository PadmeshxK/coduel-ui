import { useEffect, type RefObject } from 'react'
import Lenis from 'lenis'

/**
 * Momentum smooth-scroll for a nested scroll container — the same eased feel as the document
 * (see useSmoothScroll), for panels that live inside a `data-lenis-prevent` region (the duel/solve
 * fill layout) and would otherwise fall back to snappy native scrolling.
 *
 * Pass a ref to the `overflow-y-auto` wrapper; its single child is treated as the scroll content,
 * so structure the markup as `<div ref><div>…content…</div></div>`. Re-runs when `deps` change
 * (e.g. the problem swaps) so Lenis re-measures.
 */
export function useLenisBox(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const wrapper = ref.current
    const content = wrapper?.firstElementChild as HTMLElement | null
    if (!wrapper || !content) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.14,
      wheelMultiplier: 1.1,
      smoothWheel: true,
      // This panel sits inside the page's `data-lenis-prevent` region (so the document Lenis leaves
      // it alone) — but that same attribute would make THIS instance ignore the wheel too. Override
      // prevent so the container owns its own wheel and actually scrolls smoothly.
      prevent: () => false,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
