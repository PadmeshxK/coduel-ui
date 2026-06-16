import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`reflective rounded-[14px] border border-line bg-paper-2 p-[22px] shadow-[0_18px_40px_-24px_rgba(27,24,19,0.25)] ${className}`}
    >
      {children}
    </div>
  )
}
