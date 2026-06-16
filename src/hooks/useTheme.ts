import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'coduel-theme'

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => unknown
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let animating = false

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const apply = () => {
      root.dataset.theme = next
      setTheme(next)
    }

    const doc = document as ViewTransitionDoc

    // Primary: a spatial left→right wipe. View Transitions snapshots the OLD theme and reveals the
    // NEW over it (clip-path animated in index.css), so mid-sweep the left is new, the right is old.
    // flushSync makes the DOM theme flip happen inside the transition callback.
    if (!reduce && typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => flushSync(apply))
      return
    }

    // Fallback (no View Transitions / reduced motion): eased colour crossfade, no spatial wipe.
    if (reduce || animating) {
      apply()
      return
    }
    animating = true
    root.classList.add('theme-anim')
    apply()
    window.setTimeout(() => {
      root.classList.remove('theme-anim')
      animating = false
    }, 650)
  }

  return { theme, toggle }
}
