export function Logo({
  className = 'text-[25px]',
  caret = true,
}: {
  className?: string
  caret?: boolean
}) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.03em] ${className}`}>
      co<span className="text-accent">duel</span>
      {caret && <span className="logo-caret" aria-hidden="true" />}
    </span>
  )
}
