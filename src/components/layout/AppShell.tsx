import type { ReactNode } from 'react'
import { Header } from './Header'

// Single source of truth for horizontal page sizing — same max width + padding everywhere.
const SHELL = 'mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-7'

interface AppShellProps {
  children: ReactNode
  /** Fill the viewport height (no page scroll) — for IDE-like pages (Solve, Duel). */
  fill?: boolean
}

export function AppShell({ children, fill = false }: AppShellProps) {
  if (fill) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <div className={`${SHELL} pt-6`}>
          <Header />
        </div>
        {/* lock to viewport on desktop; let the IDE pages scroll on small screens.
            data-lenis-prevent: keep smooth-scroll OFF here so Monaco / the console / the side
            panels scroll natively (Lenis would otherwise swallow their wheel events). */}
        <main data-lenis-prevent className={`${SHELL} min-h-0 flex-1 overflow-y-auto py-5 lg:overflow-hidden`}>
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className={`${SHELL} pb-16 pt-6`}>
      <Header />
      {children}
    </div>
  )
}
