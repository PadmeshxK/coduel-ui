import type { ReactNode } from 'react'

interface EditorPanelProps {
  /** Static language label shown when no custom toolbar is provided (e.g. read-only Duel view). */
  language?: string
  /** Optional control rendered at the right of the chrome bar (e.g. Solve's language <select>). */
  toolbar?: ReactNode
  /** Optional tab strip rendered left of the toolbar (e.g. Solve's "#submission" tabs). */
  tabs?: ReactNode
  /** The code area — Monaco, or a static block. */
  children: ReactNode
  /** Stretch to fill a flex parent's height and let the code area grow (Monaco height="100%"). */
  fill?: boolean
  className?: string
}

export function EditorPanel({
  language = 'Python 3.13',
  toolbar,
  tabs,
  children,
  fill = false,
  className = '',
}: EditorPanelProps) {
  return (
    <div
      className={`reflective overflow-hidden rounded-[14px] border border-line bg-paper-2 ${
        fill ? 'flex flex-col' : ''
      } ${className}`}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-black/[0.03] px-4 dark:bg-white/[0.04]">
        <span className="h-[11px] w-[11px] rounded-full bg-[#E5705B]" />
        <span className="h-[11px] w-[11px] rounded-full bg-[#E8C06A]" />
        <span className="h-[11px] w-[11px] rounded-full bg-[#8FBF87]" />
        {tabs && <div className="ml-3 min-w-0 overflow-x-auto">{tabs}</div>}
        <div className="ml-auto">
          {toolbar ?? (
            <span className="rounded-md border border-line px-2.5 py-1 font-mono text-xs text-ink-soft">
              {language} ▾
            </span>
          )}
        </div>
      </div>
      {fill ? <div className="min-h-0 flex-1">{children}</div> : children}
    </div>
  )
}
