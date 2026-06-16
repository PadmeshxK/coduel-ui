interface AvatarProps {
  initial: string
  /** Profile image URL (e.g. Google picture). Falls back to the initial when absent. */
  src?: string | null
  size?: number
  gradient?: string
  className?: string
}

// Theme-driven: derives from the accent token so it flips with light/dark.
const DEFAULT_GRADIENT =
  'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 72%, #f3e9d8), var(--color-accent))'

export function Avatar({
  initial,
  src,
  size = 30,
  gradient = DEFAULT_GRADIENT,
  className = '',
}: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={initial}
        // Google profile images can 403 without this referrer policy.
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, background: gradient, fontSize: size * 0.43 }}
      className={`grid place-items-center rounded-full font-semibold text-white ${className}`}
    >
      {initial}
    </div>
  )
}
