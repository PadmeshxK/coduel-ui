import { useEffect } from 'react'

/**
 * Tracks the pointer over any `.reflective` element and writes its local position to the
 * element's `--mx`/`--my` CSS vars, so the reflective border can brighten near the cursor
 * (see `.reflective::after` in index.css). One document-level listener covers every panel.
 */
export function useReflectiveGlow() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null
      const el = target?.closest?.('.reflective') as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
      el.style.setProperty('--my', `${e.clientY - rect.top}px`)
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [])
}
