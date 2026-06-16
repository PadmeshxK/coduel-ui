import { Outlet, useLocation } from 'react-router-dom'
import { AppShell } from './AppShell'
import { Reveal } from '../ui/Reveal'

/** Standard scrolling layout (Lobby, Practice, …). Header is rendered once and persists.
 *  Every page inherits one entrance animation here (re-keyed per route) — no per-page code. */
export function DefaultLayout() {
  const { pathname } = useLocation()
  return (
    <AppShell>
      <Reveal key={pathname}>
        <Outlet />
      </Reveal>
    </AppShell>
  )
}

/** Full-viewport, no-scroll layout for IDE-like pages (Solve, Duel). */
export function FillLayout() {
  return (
    <AppShell fill>
      <Outlet />
    </AppShell>
  )
}
