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
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo className="mb-6 text-[28px]" />
      <div className="font-display text-[72px] font-extrabold leading-none tracking-[-0.04em] text-accent sm:text-[96px]">
        {code}
      </div>
      <h1 className="mt-2 font-display text-[26px] font-bold tracking-[-0.02em] sm:text-[30px]">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-ink-soft">{message}</p>
      <Button className="mt-8" onClick={onAction ?? (() => navigate('/'))}>
        {actionLabel}
      </Button>
    </div>
  )
}
