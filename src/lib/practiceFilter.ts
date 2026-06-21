import type { ProblemSort, ProblemStatusFilter } from '../types'

// The Practice page's filter state, persisted so it survives a refresh and is shared with the Solve
// page (which uses it to offer "next problem" within the same filter). Page number is intentionally
// not persisted — browsing always starts from page 1.
export interface PracticeFilter {
  q: string
  sort: ProblemSort
  status: ProblemStatusFilter
  ratings: number[]
  tags: string[]
}

const KEY = 'coduel:practice-filter'

export const DEFAULT_PRACTICE_FILTER: PracticeFilter = {
  q: '',
  sort: 'rating-asc',
  status: 'ALL',
  ratings: [],
  tags: [],
}

export function loadPracticeFilter(): PracticeFilter {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_PRACTICE_FILTER, ...JSON.parse(raw) } : DEFAULT_PRACTICE_FILTER
  } catch {
    return DEFAULT_PRACTICE_FILTER
  }
}

export function savePracticeFilter(filter: PracticeFilter): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(filter))
  } catch {
    // storage unavailable / quota — non-fatal, filters just won't persist
  }
}
