import { Link, NavLink, useNavigate } from 'react-router-dom'
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
]

export function Header() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const displayName = user?.displayName ?? user?.email ?? null

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
      {/* mobile: auto | 1fr | auto (nav scrolls in the middle); sm+: 1fr | auto | 1fr (centered nav) */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-0">
        <Link to="/" className="justify-self-start transition hover:opacity-80">
          <Logo className="text-[22px] sm:text-[25px]" />
        </Link>

        <nav className="flex min-w-0 items-center gap-4 justify-self-center overflow-x-auto whitespace-nowrap text-[13px] [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-7 sm:text-sm [&::-webkit-scrollbar]:hidden">
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

        <div className="flex items-center gap-2 justify-self-end sm:gap-3">
          {displayName && <NotificationBell />}
          <ThemeToggle />
          {displayName ? (
            <div className="group relative">
              <button className="flex items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-1 transition hover:border-line hover:bg-paper-2 group-hover:border-line group-hover:bg-paper-2 lg:pl-3.5">
                <span className="hidden whitespace-nowrap font-mono text-[13px] text-ink-soft lg:inline">
                  {displayName}
                </span>
                <Avatar initial={displayName.charAt(0).toUpperCase()} src={user?.avatarUrl} />
              </button>

              {/* hover menu — pt-2 bridges the gap so the cursor can reach it */}
              <div className="invisible absolute right-0 top-full z-40 pt-2 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100">
                <div className="reflective w-[190px] overflow-hidden rounded-xl border border-line bg-paper-2 p-1 shadow-[0_18px_40px_-20px_rgba(27,24,19,0.55)]">
                  <Link
                    to="/profile"
                    className="block rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/[0.05]"
                  >
                    Edit profile
                  </Link>
                  <button
                    onClick={handleLogout}
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
        </div>
      </div>
    </header>
  )
}
