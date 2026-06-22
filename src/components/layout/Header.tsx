import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../ui/Logo'
import { Avatar } from '../ui/Avatar'
import { ThemeToggle } from '../ui/ThemeToggle'
import { NotificationBell } from '../ui/NotificationBell'
import { useAuth } from '../../hooks/useAuth'
import { authApi } from '../../lib/api'

const NAV = [
  { label: 'Home', to: '/' },
  { label: 'Practice', to: '/practice' },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Friends', to: '/friend' },
  { label: 'Messages', to: '/messages' },
]

export function Header() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const displayName = user?.displayName ?? user?.email ?? null

  // Click-toggle account menu (not hover) + the mobile nav drawer (collapsed hamburger on narrow screens).
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close either popover on an outside click (the drawer counts the hamburger + the panel as "inside").
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false)
      const inDrawer =
        hamburgerRef.current?.contains(t) || drawerRef.current?.contains(t)
      if (!inDrawer) setNavOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Navigating always closes both (covers tapping a nav link in the drawer).
  useEffect(() => {
    setNavOpen(false)
    setMenuOpen(false)
  }, [pathname])

  async function handleLogout() {
    try {
      await authApi.logout()
    } catch {
      // ignore — clear client state regardless
    }
    await refresh()
    navigate('/login')
  }

  return (
    <header className="reflective sticky top-4 z-30 rounded-2xl border border-line bg-paper/70 px-3 py-2.5 shadow-[0_16px_40px_-28px_rgba(27,24,19,0.5)] backdrop-blur-xl sm:px-5 sm:py-3">
      {/* 3-column grid: logo | nav | controls. Equal 1fr side columns keep the centre column (nav)
          dead-centre of the container, and — unlike absolute centering — the sides can't overlap it
          as more links are added. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Link to="/" className="justify-self-start transition hover:opacity-80">
          <Logo className="text-[22px] sm:text-[25px]" />
        </Link>

        <nav className="hidden items-center justify-center gap-7 whitespace-nowrap text-sm md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group relative py-1 transition ${isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'}`
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-[2px] w-full origin-left rounded-full bg-accent transition-transform duration-300 ${
                      isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-1.5 sm:gap-3">
          {displayName && <NotificationBell />}
          <ThemeToggle />
          {displayName ? (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => {
                  setMenuOpen((o) => !o)
                  setNavOpen(false)
                }}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={`flex items-center gap-2.5 rounded-full border py-1 pl-1 pr-1 transition active:scale-[0.97] lg:pl-3.5 ${
                  menuOpen
                    ? 'border-line bg-paper-2'
                    : 'border-transparent hover:border-line hover:bg-paper-2'
                }`}
              >
                <span className="hidden whitespace-nowrap font-mono text-[13px] text-ink-soft lg:inline">
                  {displayName}
                </span>
                <Avatar initial={displayName.charAt(0).toUpperCase()} src={user?.avatarUrl} />
              </button>

              {/* Click menu, always mounted + scale/fade toggled so it eases open AND closed. */}
              <div
                className={`reflective absolute right-0 top-full z-40 mt-2 w-[220px] origin-top-right overflow-hidden rounded-xl border border-line bg-paper-2 shadow-[0_18px_40px_-20px_rgba(27,24,19,0.55)] transition duration-150 ${
                  menuOpen ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'
                }`}
              >
                {/* identity header — only when the navbar has dropped the name (below lg); on lg+ the
                    name already sits next to the avatar, so showing it again here is redundant. */}
                <div className="flex items-center gap-2.5 border-b border-line px-3 py-3 lg:hidden">
                  <Avatar initial={displayName.charAt(0).toUpperCase()} src={user?.avatarUrl} size={34} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-ink">{displayName}</div>
                    {user?.email && user.email !== displayName && (
                      <div className="truncate font-mono text-[11px] text-ink-soft">{user.email}</div>
                    )}
                  </div>
                </div>

                <div className="p-1">
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/[0.05]"
                  >
                    Edit profile
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      void handleLogout()
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-accent transition hover:bg-accent/10"
                  >
                    Log out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link
              to="/login"
              className="font-mono text-[13px] text-ink-soft transition hover:text-ink"
            >
              Sign in
            </Link>
          )}

          {/* hamburger — nav links collapse here below md */}
          <div ref={hamburgerRef} className="md:hidden">
            <button
              onClick={() => {
                setNavOpen((o) => !o)
                setMenuOpen(false)
              }}
              aria-label="Menu"
              aria-expanded={navOpen}
              className={`grid h-9 w-9 place-items-center rounded-full border transition active:scale-90 ${
                navOpen
                  ? 'border-line bg-paper-2 text-ink'
                  : 'border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink'
              }`}
            >
              <MenuIcon open={navOpen} />
            </button>
          </div>
        </div>
      </div>

      {/* mobile nav drawer — height reveals via the grid 0fr→1fr trick (smooth open AND close);
          each link then slides in from the left, staggered. */}
      <div
        ref={drawerRef}
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-fluid md:hidden ${
          navOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <nav className="flex min-h-0 flex-col gap-1 overflow-hidden">
          <div className="mt-2.5 border-t border-line pt-2.5" />
          {NAV.map((item, i) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setNavOpen(false)}
              style={{ transitionDelay: navOpen ? `${80 + i * 45}ms` : '0ms' }}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2.5 text-[15px] transition-all duration-300 ease-fluid ${
                  navOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
                } ${
                  isActive
                    ? 'bg-black/[0.04] font-semibold text-ink dark:bg-white/[0.05]'
                    : 'text-ink-soft hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

// Two bars that cross into an X when open — minimal, matches the editorial line language.
function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-[14px] w-[18px]">
      <span
        className={`absolute left-0 block h-[2px] w-full rounded-full bg-current transition-all duration-200 ${
          open ? 'top-[6px] rotate-45' : 'top-0'
        }`}
      />
      <span
        className={`absolute left-0 block h-[2px] w-full rounded-full bg-current transition-all duration-200 ${
          open ? 'top-[6px] -rotate-45' : 'top-[12px]'
        }`}
      />
    </span>
  )
}
