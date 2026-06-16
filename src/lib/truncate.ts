// Cap program output so a runaway loop (e.g. `while True: print(1)`) can't flood the DOM and
// freeze the UI. We compare full output for pass/fail, but only ever store/render a clamped copy.
const MAX_OUTPUT_CHARS = 5000

export function clampOutput(s: string | null | undefined): string {
  if (!s) return ''
  if (s.length <= MAX_OUTPUT_CHARS) return s
  return `${s.slice(0, MAX_OUTPUT_CHARS)}\n… truncated (${s.length.toLocaleString()} chars total)`
}
