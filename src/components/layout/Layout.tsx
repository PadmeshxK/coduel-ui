import { Outlet, useLocation } from 'react-router-dom'
import { AppShell } from './AppShell'
import { Reveal } from '../ui/Reveal'

/** Standard scrolling layout (Lobby, Practice, …). Header is rendered once and persists.
 *  Every page inherits one entrance animation here, re-keyed per top-level SECTION (not the full
 *  path) — so navigating within a section (e.g. switching DM threads at /messages/:id) updates in
 *  place instead of remounting the page and refetching its data. */
export function DefaultLayout() {
  const { pathname } = useLocation()
  const section = pathname.split('/')[1] || 'home'
  return (
    <AppShell>
      <Reveal key={section}>
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
