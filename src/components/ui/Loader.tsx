interface LoaderProps {
  /** Mono caption under the ring. Pass null for just the ring. */
  label?: string | null
  size?: number
  /** Lay the ring + label out in a row (for inline use, e.g. next to a button). */
  inline?: boolean
  className?: string
}

// The one loader used across the site — a comet-tail ring (accent) + a mono label.
export function Loader({ label = 'Loading', size = 30, inline = false, className = '' }: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${inline ? 'flex-row gap-2.5' : 'flex-col gap-3'} ${className}`}
    >
      <span className="loader-ring shrink-0" style={{ width: size, height: size }} />
      {label && (
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</span>
      )}
    </div>
  )
}
