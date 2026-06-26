import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  // The glassy conic-gradient border glint. Off for filled panels (e.g. the chat) whose edge-to-edge
  // opaque header/footer bands sit over the ring and chop it to an uneven width near the top/bottom.
  reflective?: boolean
}

export function Card({ children, className = '', reflective = true }: CardProps) {
  return (
    <div
      className={`${reflective ? 'reflective ' : ''}rounded-[14px] border border-line bg-paper-2 p-[22px] shadow-[0_18px_40px_-24px_rgba(27,24,19,0.25)] ${className}`}
    >
      {children}
    </div>
  )
}
