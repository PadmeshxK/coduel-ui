import { useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/** Runs `fn` on mount (and when `deps` change), tracking loading/data/error. Read-only fetches. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true
    setState({ data: null, loading: true, error: null })
    fn()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch(
        (e: unknown) =>
          active &&
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Request failed',
          }),
      )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
