import { useEffect, useState } from 'react'
import { problemApi } from '../../lib/api'
import type { ProblemData } from '../../types'

/*
  A tiny slug → problem cache shared by everything that renders a shared problem (the in-chat duel
  card, the composer's share picker). A given problem resolves once and every card that references it
  reuses the result — no per-card refetch, no loading flash when the same problem appears twice.
*/
const cache = new Map<string, ProblemData>()
const inflight = new Map<string, Promise<ProblemData>>()

// Prime the cache from a list we already have (e.g. the composer's problem picker) so cards built
// from those problems render instantly, with no round-trip.
export function seedProblems(problems: ProblemData[]) {
  for (const p of problems) cache.set(p.slug, p)
}

// Resolve a problem by slug: returns the cached value immediately if present, else loads it once.
// `missing` flips true if the problem is gone (deleted) so the card can show a graceful fallback.
export function useProblem(slug: string | null) {
  const [problem, setProblem] = useState<ProblemData | null>(() => (slug ? cache.get(slug) ?? null : null))
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!slug) {
      setProblem(null)
      setMissing(false)
      return
    }
    const hit = cache.get(slug)
    if (hit) {
      setProblem(hit)
      setMissing(false)
      return
    }
    let live = true
    setProblem(null)
    setMissing(false)
    const req =
      inflight.get(slug) ??
      problemApi.getBySlug(slug).then((p) => {
        cache.set(slug, p)
        inflight.delete(slug)
        return p
      })
    inflight.set(slug, req)
    req
      .then((p) => live && setProblem(p))
      .catch(() => {
        inflight.delete(slug)
        if (live) setMissing(true)
      })
    return () => {
      live = false
    }
  }, [slug])

  return { problem, missing }
}
