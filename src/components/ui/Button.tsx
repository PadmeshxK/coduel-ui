import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary:
    'border border-accent bg-accent text-white shadow-[0_12px_26px_-12px_rgba(158,59,42,0.6)] hover:brightness-110',
  secondary: 'border border-line bg-black/5 hover:-translate-y-px dark:bg-white/5',
  ghost: 'text-ink-soft hover:text-ink',
}

const sizes: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-[13px]',
  md: 'px-5 py-3 text-[14.5px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}
