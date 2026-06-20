import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/ui/Logo'
import { Button } from '../components/ui/Button'

interface ErrorPageProps {
  code?: string
  title?: string
  message?: string
  /** Override the default "back to home" action label/target. */
  actionLabel?: string
  onAction?: () => void
}

// Common, themed error screen. Defaults to a 404; pass props to reuse for other errors
// (e.g. <ErrorPage code="500" title="Something went wrong" />).
export function ErrorPage({
  code = '404',
  title = 'Page not found',
  message = "The page you're looking for doesn't exist or may have moved.",
  actionLabel = 'Back to home',
  onAction,
}: ErrorPageProps) {
  const navigate = useNavigate()
  return (
    <div className="animate-reveal flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo className="mb-8 text-[26px]" />

      <div className="font-display text-[84px] font-extrabold leading-[0.92] tracking-[-0.04em] text-accent sm:text-[120px]">
        {code}
      </div>
      <h1 className="mt-3 font-display text-[26px] font-bold tracking-[-0.02em] sm:text-[32px]">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-ink-soft">{message}</p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onAction ?? (() => navigate('/'))}>{actionLabel}</Button>
        <button
          onClick={() => navigate(-1)}
          className="rounded-xl border border-line px-5 py-3 font-mono text-sm text-ink-soft transition hover:border-ink-soft/60 hover:text-ink"
        >
          Go back
        </button>
      </div>
    </div>
  )
}
