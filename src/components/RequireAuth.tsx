import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Loader } from './ui/Loader'

/**
 * Auth gate. `allowUnnamed` exempts the setup route itself; every other protected page redirects a
 * signed-in user who hasn't chosen a unique display name to /setup first.
 */
export function RequireAuth({
  children,
  allowUnnamed = false,
}: {
  children: ReactNode
  allowUnnamed?: boolean
}) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader label="Loading" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // New / unnamed account → must pick a display name before using the app.
  if (!user.displayNameSet && !allowUnnamed) return <Navigate to="/setup" replace />

  return <>{children}</>
}
