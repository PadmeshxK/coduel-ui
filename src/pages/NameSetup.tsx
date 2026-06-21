import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../hooks/useAuth'
import { profileApi, userApi } from '../lib/api'

const MAX_LEN = 50
type Status = 'idle' | 'checking' | 'available' | 'taken'

export function NameSetup() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0) // guards against out-of-order live-check responses

  // Live availability — debounced, case-sensitive (server-side). The latest response wins.
  useEffect(() => {
    const trimmed = name.trim()
    if (!trimmed) {
      setStatus('idle')
      return
    }
    const mine = ++seq.current
    setStatus('checking')
    const t = setTimeout(() => {
      userApi
        .checkDisplayName(trimmed)
        .then((available) => {
          if (mine === seq.current) setStatus(available ? 'available' : 'taken')
        })
        .catch(() => {
          if (mine === seq.current) setStatus('idle')
        })
    }, 350)
    return () => clearTimeout(t)
  }, [name])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // Already chosen a name — nothing to do here.
  if (user.displayNameSet) return <Navigate to="/" replace />

  const trimmed = name.trim()
  const canSubmit = status === 'available' && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await profileApi.update({ displayName: trimmed, avatarUrl: user?.avatarUrl ?? null })
      await refresh() // displayNameSet flips true; the home route opens up
      navigate('/', { replace: true })
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Could not save — try another name.')
      setStatus('taken')
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-7 pt-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="animate-reveal w-full max-w-md">
          <div className="mb-3 text-center font-mono text-xs uppercase tracking-[0.18em] text-accent">
            ● One last step
          </div>
          <h1 className="text-center font-display text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">
            Choose your display name
          </h1>

          <form onSubmit={handleSubmit} className="mt-8">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper-2 p-3">
              <Avatar
                initial={(trimmed || user.email).charAt(0).toUpperCase()}
                src={user.avatarUrl}
                size={44}
              />
              <input
                autoFocus
                value={name}
                maxLength={MAX_LEN}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
                className="min-w-0 flex-1 bg-transparent font-display text-[18px] font-semibold outline-none placeholder:text-ink-soft/60"
              />
              <StatusPip status={status} />
            </div>

            {/* live status line */}
            <div className="mt-2 min-h-[20px] px-1 font-mono text-[12px]">
              {status === 'checking' && <span className="text-ink-soft">checking availability…</span>}
              {status === 'available' && (
                <span className="text-accent-2">✓ “{trimmed}” is available</span>
              )}
              {status === 'taken' && (
                <span className="text-accent">✗ {error ?? `“${trimmed}” is already taken`}</span>
              )}
            </div>

            <Button type="submit" disabled={!canSubmit} className="mt-5 w-full">
              {submitting ? 'Saving…' : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

function StatusPip({ status }: { status: Status }) {
  if (status === 'checking') {
    return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink-soft" />
  }
  if (status === 'available') {
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-2/15 text-[13px] text-accent-2">
        ✓
      </span>
    )
  }
  if (status === 'taken') {
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[13px] text-accent">
        ✗
      </span>
    )
  }
  return null
}
