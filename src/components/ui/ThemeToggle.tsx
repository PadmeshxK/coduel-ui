import { useTheme } from '../../hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft transition hover:text-ink"
    >
      {theme === 'light' ? '☾ Dark' : '☀ Light'}
    </button>
  )
}
