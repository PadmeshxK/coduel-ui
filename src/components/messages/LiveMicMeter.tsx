import { useEffect, useRef, useState, type RefObject } from 'react'

const BARS = 75

/**
 * A live scrolling level meter driven by the real mic input (the recorder's AnalyserNode) — so while
 * recording you can SEE your voice register in real time and know the mic works. Each frame samples the
 * current loudness and pushes it on the right, scrolling older samples left.
 */
export function LiveMicMeter({ analyserRef }: { analyserRef: RefObject<AnalyserNode | null> }) {
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0.06))
  const frameRef = useRef(0)

  useEffect(() => {
    const data = new Uint8Array(1024)
    let raf = 0
    const tick = () => {
      const a = analyserRef.current
      if (a) {
        const n = Math.min(data.length, a.frequencyBinCount)
        a.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < n; i++) sum += data[i]
        const level = Math.min(1, sum / n / 140) // average bin → 0..1, scaled for a lively response
        // ~30fps DOM updates (skip every other frame) — plenty smooth, lighter on React.
        if ((frameRef.current = (frameRef.current + 1) % 2) === 0) {
          setLevels((prev) => [...prev.slice(1), Math.max(0.06, level)])
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [analyserRef])

  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-px">
      {levels.map((l, i) => (
        <span
          key={i}
          style={{ height: `${Math.round(l * 100)}%` }}
          className="min-w-0 flex-1 rounded-full bg-accent/80"
        />
      ))}
    </div>
  )
}
