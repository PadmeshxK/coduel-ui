import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { config } from '../lib/config'

export function Login() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-7 pt-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="animate-reveal w-full max-w-md text-center">
          <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-accent">
            ● 1v1 coding duels
          </div>
          <h1 className="font-display text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em]">
            Experience live coding duels
          </h1>
          <p className="mt-4 text-ink-soft">
            Sign in to compete in real-time duels, or practice the problem set on your own.
          </p>

          <a
            href={config.googleLoginUrl}
            className="mt-8 inline-flex items-center justify-center gap-3 rounded-xl border border-line bg-paper-2 px-6 py-3.5 font-semibold shadow-[0_18px_40px_-24px_rgba(27,24,19,0.25)] transition hover:-translate-y-px"
          >
            <GoogleIcon />
            Continue with Google
          </a>

        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
