import type { ReactNode } from 'react'

// Single, reusable entrance animation (fade + slide on the site easing). Wrap anything that
// appears — page content, popovers, freshly-loaded lists — and it inherits the same smooth feel.
// Give it a changing `key` (e.g. route path, or loading→loaded) to replay the animation.
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`animate-reveal ${className}`}>{children}</div>
}
