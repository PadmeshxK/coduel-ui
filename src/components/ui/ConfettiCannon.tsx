import { useEffect, useRef } from 'react'

type Shape = 'strip' | 'dot'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  rot: number; rotV: number
  color: string
  w: number; h: number
  shape: Shape
  alpha: number
}

/**
 * Elegant top-rain confetti: particles start just above the viewport and drift
 * down slowly — awards-ceremony style, not birthday-party cannon. Respects
 * prefers-reduced-motion (returns null and never mounts the canvas).
 */
export function ConfettiCannon() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Read actual CSS vars so it respects dark mode at the moment of firing.
    const cs = getComputedStyle(document.documentElement)
    const gold = cs.getPropertyValue('--color-gold').trim() || '#b8893b'
    const teal = cs.getPropertyValue('--color-accent-2').trim() || '#2e6b4f'
    // Gold-weighted: two-thirds gold so it reads as "victory" at a glance.
    const palette = [gold, gold, teal, '#f0e9d8', gold, teal]

    const make = (): Particle => {
      const isStrip = Math.random() > 0.3
      return {
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 1.4 + Math.random() * 2.2,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.04,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 0.55 + Math.random() * 0.25, // 0.55–0.80 — never screaming at you
        w: isStrip ? 2 : 3.5,
        h: isStrip ? 14 : 3.5,
        shape: isStrip ? 'strip' : 'dot',
      }
    }

    const particles: Particle[] = Array.from({ length: 70 }, make)
    let raf: number, frame = 0

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++
      for (const p of particles) {
        // Gentle sinusoidal sway mimics natural air turbulence.
        p.x += p.vx + Math.sin(frame * 0.018 + p.y * 0.01) * 0.4
        p.y += p.vy
        p.rot += p.rotV
        if (frame > 90) p.alpha = Math.max(0, p.alpha - 0.009)

        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.shape === 'strip') {
          const r = p.w / 2
          ctx.beginPath()
          // roundRect is available in all modern browsers; fall back to rect.
          if (ctx.roundRect) ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, r)
          else ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h)
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.w, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      if (frame < 210) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50" />
}
