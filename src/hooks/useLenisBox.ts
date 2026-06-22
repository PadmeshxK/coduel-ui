import { useEffect, type RefObject, type MutableRefObject } from 'react'
import Lenis from 'lenis'

/**
 * Momentum smooth-scroll for a nested scroll container — the same eased feel as the document
 * (see useSmoothScroll), for panels that live inside a `data-lenis-prevent` region (the duel/solve
 * fill layout) and would otherwise fall back to snappy native scrolling.
 *
 * Pass a ref to the `overflow-y-auto` wrapper; its single child is treated as the scroll content,
 * so structure the markup as `<div ref><div>…content…</div></div>`. Re-runs when `deps` change
 * (e.g. the problem swaps) so Lenis re-measures.
 *
 * Pass `instanceRef` to get a handle on the live Lenis instance (e.g. to `scrollTo` programmatically,
 * like a chat jumping to its latest message). It's null under reduced-motion / before mount.
 */
export function useLenisBox(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
  instanceRef?: MutableRefObject<Lenis | null>,
) {
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
    if (instanceRef) instanceRef.current = lenis

    let frame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      if (instanceRef) instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
