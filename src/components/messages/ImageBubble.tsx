import { useState } from 'react'

/** An image message — a rounded thumbnail (click to open the lightbox) with an optional caption.
 *  Fades in once decoded (over a soft placeholder) instead of painting top-to-bottom as it streams. */
export function ImageBubble({
  src,
  caption,
  onOpen,
}: {
  src: string
  caption?: string | null
  mine?: boolean
  onOpen: () => void
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper-2 shadow-sm">
      <button onClick={onOpen} className="relative block w-full" aria-label="Open image">
        {/* placeholder while the image decodes — a quiet shimmer so there's no blank/jumpy paint */}
        {!loaded && (
          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-black/[0.06] to-black/[0.02] dark:from-white/[0.08] dark:to-white/[0.03]" />
        )}
        <img
          src={src}
          alt={caption || 'image'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`max-h-[300px] w-auto max-w-[min(340px,72vw)] object-cover transition-opacity duration-500 ease-fluid hover:opacity-95 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </button>
      {caption && <div className="px-3 py-1.5 text-[13px] text-ink">{caption}</div>}
    </div>
  )
}
