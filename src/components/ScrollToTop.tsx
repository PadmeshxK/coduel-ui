import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

// React Router keeps the previous scroll offset across navigations, so a short page
// can land clamped to the bottom (looks like a "snap"). Reset to top on every route
// change, before paint, so each page starts cleanly at the top.
export function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])
  return null
}
