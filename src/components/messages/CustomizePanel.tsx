import { useRef, type ReactNode } from 'react'
import type {
  BackgroundPreset,
  BubbleStyle,
  ConversationSettingData,
  MessageDensity,
  MessageFont,
  MessageTextSize,
  ThemeMode,
} from '../../types'
import { useLenisBox } from '../../hooks/useLenisBox'
import {
  ACCENT_SWATCHES,
  QUICK_REACTIONS,
  backgroundArtStyle,
  bubbleClass,
  messageBubblePadding,
  messageFontFamily,
  messageTextSizePx,
  threadThemeStyle,
} from './conversationTheme'

interface Props {
  open: boolean
  settings: ConversationSettingData
  peerName: string
  onChange: (partial: Partial<ConversationSettingData>) => void
  onClose: () => void
}

const BACKGROUNDS: { value: BackgroundPreset; label: string }[] = [
  { value: 'PARCHMENT', label: 'Parchment' },
  { value: 'SUNSET', label: 'Sunset' },
  { value: 'BLUEPRINT', label: 'Blueprint' },
  { value: 'FOREST', label: 'Forest' },
  { value: 'ESPRESSO', label: 'Espresso' },
  { value: 'AURORA', label: 'Aurora' },
  { value: 'OCEAN', label: 'Ocean' },
  { value: 'ROSE', label: 'Rose' },
  { value: 'MIDNIGHT', label: 'Midnight' },
]

// One-tap full looks — each applies a coordinated theme + accent + background in a single change. The
// `swatch` is just the tile preview; the rest is what gets written to the settings.
const PRESETS: {
  label: string
  swatch: string
  apply: Partial<ConversationSettingData>
}[] = [
  {
    label: 'Coduel',
    swatch: 'linear-gradient(135deg, #f4efe6, #ede6d8)',
    apply: { themeMode: 'INHERIT', accentHex: null, backgroundPreset: 'PARCHMENT' },
  },
  {
    label: 'Midnight',
    swatch: 'linear-gradient(135deg, #1b1830, #2a2350)',
    apply: { themeMode: 'DARK', accentHex: '#6366f1', backgroundPreset: 'MIDNIGHT' },
  },
  {
    label: 'Sunset',
    swatch: 'linear-gradient(135deg, #c2410c, #b8893b)',
    apply: { themeMode: 'INHERIT', accentHex: '#c2410c', backgroundPreset: 'SUNSET' },
  },
  {
    label: 'Forest',
    swatch: 'linear-gradient(135deg, #2e6b4f, #4d7c0f)',
    apply: { themeMode: 'INHERIT', accentHex: '#2e6b4f', backgroundPreset: 'FOREST' },
  },
  {
    label: 'Ocean',
    swatch: 'linear-gradient(135deg, #0369a1, #38bdf8)',
    apply: { themeMode: 'INHERIT', accentHex: '#0369a1', backgroundPreset: 'OCEAN' },
  },
  {
    label: 'Rose',
    swatch: 'linear-gradient(135deg, #c2557a, #fbbf24)',
    apply: { themeMode: 'INHERIT', accentHex: '#c2557a', backgroundPreset: 'ROSE' },
  },
  {
    label: 'Aurora',
    swatch: 'linear-gradient(135deg, #14b8a6, #8b5cf6)',
    apply: { themeMode: 'DARK', accentHex: '#14b8a6', backgroundPreset: 'AURORA' },
  },
  {
    label: 'Mono',
    swatch: 'linear-gradient(135deg, #2a2722, #1b1813)',
    apply: { themeMode: 'INHERIT', accentHex: '#1b1813', backgroundPreset: 'ESPRESSO', bubbleStyle: 'MINIMAL' },
  },
]

const TEXT_SIZES: { value: MessageTextSize; label: string }[] = [
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
]

const DENSITIES: { value: MessageDensity; label: string }[] = [
  { value: 'COZY', label: 'Cozy' },
  { value: 'COMPACT', label: 'Compact' },
]

// Disappearing-message windows. Persisted now; enforcement (the sweep) lands in a later slice.
const TTL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Off' },
  { value: 86_400, label: '1 day' },
  { value: 604_800, label: '1 week' },
]

export function CustomizePanel({ open, settings, peerName, onChange, onClose }: Props) {
  // Momentum scroll, like the rest of the app (the wrapper's single child is the scroll content).
  const scrollRef = useRef<HTMLDivElement>(null)
  useLenisBox(scrollRef, [])

  return (
    // Full-bleed cover over the thread; inherits the per-DM theme tokens so it matches the look it's
    // editing. Kept mounted so open/close eases. A pure cross-fade (no scale) — scaling a full-screen
    // opaque layer shrinks it inward as it fades and reveals the thread at the edges, which read as a
    // snappy "size decrease". Opacity-only dissolves the panel cleanly into the thread underneath.
    <div
      style={{ willChange: 'opacity' }}
      className={`absolute inset-0 z-30 flex flex-col bg-paper text-ink transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* header — soft shadow only (no hard rule / no backdrop-blur, which would square off the corners) */}
      <div className="relative z-10 flex shrink-0 items-center gap-3 bg-paper px-4 py-3.5 shadow-[0_12px_24px_-22px_rgba(27,24,19,0.6)]">
        <div className="min-w-0">
          <div className="truncate font-display text-[16px] font-bold leading-tight tracking-[-0.01em]">
            Customize chat
          </div>
          <div className="truncate text-[12px] text-ink-soft">your view of {peerName}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Back to conversation"
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full border border-transparent text-ink-soft transition hover:border-line hover:bg-paper-2 hover:text-ink"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* live preview — pinned; re-renders on every change so each tweak is visible immediately */}
      <div className="shrink-0 px-4 pb-4 pt-4">
        <Preview settings={settings} peerName={peerName} />
      </div>

      {/* grouped controls (own momentum scroll) */}
      <div ref={scrollRef} data-lenis-prevent className="no-scrollbar relative z-0 min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-8 px-5 pb-10 pt-1">
          <Group title="Presets">
            <div className="grid grid-cols-4 gap-2.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onChange(p.apply)}
                  className="group flex flex-col items-center gap-1.5"
                >
                  <span
                    className="h-12 w-full rounded-xl border border-line shadow-sm transition group-hover:border-ink-soft/50 group-hover:brightness-105"
                    style={{ background: p.swatch }}
                  />
                  <span className="text-[11px] text-ink-soft">{p.label}</span>
                </button>
              ))}
            </div>
          </Group>

          <Group title="Color">
            <Field label="Theme">
              <Seg<ThemeMode>
                value={settings.themeMode}
                onChange={(v) => onChange({ themeMode: v })}
                options={[
                  { value: 'INHERIT', label: 'Inherit' },
                  { value: 'LIGHT', label: 'Light' },
                  { value: 'DARK', label: 'Dark' },
                ]}
              />
            </Field>
            <Field label="Accent">
              <div className="flex flex-wrap gap-2.5">
                <Swatch
                  active={!settings.accentHex}
                  onClick={() => onChange({ accentHex: null })}
                  title="Theme default"
                  style={{
                    background:
                      'conic-gradient(from 210deg, var(--color-accent), var(--color-gold), var(--color-accent-2), var(--color-accent))',
                  }}
                />
                {ACCENT_SWATCHES.map((hex) => (
                  <Swatch
                    key={hex}
                    active={settings.accentHex === hex}
                    onClick={() => onChange({ accentHex: hex })}
                    title={hex}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </Field>
          </Group>

          <Group title="Background">
            <div className="grid grid-cols-3 gap-3">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.value}
                  onClick={() => onChange({ backgroundPreset: bg.value })}
                  className={`relative aspect-[3/2] overflow-hidden rounded-xl border-2 transition ${
                    settings.backgroundPreset === bg.value
                      ? 'border-accent'
                      : 'border-line hover:border-ink-soft/50'
                  }`}
                  style={backgroundArtStyle({ ...settings, backgroundPreset: bg.value, backgroundBlur: 0 })}
                >
                  <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-ink/80">
                    {bg.label}
                  </span>
                </button>
              ))}
            </div>
            <Field label="Dim">
              <Slider value={settings.backgroundDim} min={0} max={100} onChange={(v) => onChange({ backgroundDim: v })} />
            </Field>
            <Field label="Blur">
              <Slider value={settings.backgroundBlur} min={0} max={20} onChange={(v) => onChange({ backgroundBlur: v })} />
            </Field>
          </Group>

          <Group title="Messages">
            <Field label="Bubble style">
              <Seg<BubbleStyle>
                value={settings.bubbleStyle}
                onChange={(v) => onChange({ bubbleStyle: v })}
                options={[
                  { value: 'ROUNDED', label: 'Rounded' },
                  { value: 'PILL', label: 'Pill' },
                  { value: 'MINIMAL', label: 'Minimal' },
                ]}
              />
            </Field>
            <Field label="Font">
              <Seg<MessageFont>
                value={settings.messageFont}
                onChange={(v) => onChange({ messageFont: v })}
                options={[
                  { value: 'SANS', label: 'Sans' },
                  { value: 'SERIF', label: 'Serif' },
                  { value: 'MONO', label: 'Mono' },
                ]}
              />
            </Field>
            <Field label="Text size">
              <Seg<MessageTextSize>
                value={settings.messageTextSize}
                onChange={(v) => onChange({ messageTextSize: v })}
                options={TEXT_SIZES}
              />
            </Field>
            <Field label="Density">
              <Seg<MessageDensity>
                value={settings.messageDensity}
                onChange={(v) => onChange({ messageDensity: v })}
                options={DENSITIES}
              />
            </Field>
          </Group>

          <Group title="Personal">
            <Field label="Nickname" hint="only you see it">
              <input
                value={settings.nickname ?? ''}
                onChange={(e) => onChange({ nickname: e.target.value || null })}
                maxLength={40}
                placeholder={peerName}
                className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[14px] outline-none transition focus:border-accent"
              />
            </Field>
            <Field label="Quick reaction" hint="double-tap a message">
              <div className="flex flex-wrap gap-2">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onChange({ quickReactionEmoji: emoji })}
                    className={`grid h-11 w-11 place-items-center rounded-xl border text-[20px] transition ${
                      settings.quickReactionEmoji === emoji
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-paper/60 hover:border-ink-soft/40'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </Field>
          </Group>

          <Group title="Privacy & alerts">
            <div className="overflow-hidden rounded-xl border border-line">
              <Toggle
                label="Read receipts"
                hint="show “Seen” to each other"
                on={settings.readReceiptsEnabled}
                onToggle={() => onChange({ readReceiptsEnabled: !settings.readReceiptsEnabled })}
              />
              <Toggle
                label="Mute"
                hint="no toast or bell from them"
                on={settings.muted}
                onToggle={() => onChange({ muted: !settings.muted })}
                divider
              />
              <Toggle
                label="Archive"
                hint="hide from inbox · returns if they message"
                on={settings.archived}
                onToggle={() => onChange({ archived: !settings.archived })}
                divider
              />
            </div>
            <Field label="Disappearing messages">
              <Seg<number | null>
                value={settings.disappearingTtlSeconds}
                onChange={(v) => onChange({ disappearingTtlSeconds: v })}
                options={TTL_OPTIONS}
              />
            </Field>
          </Group>
        </div>
      </div>
    </div>
  )
}

// ── live preview ──
// A miniature thread rendered with the SAME helpers as the real one, so what you see is exactly what
// the conversation will look like.
function Preview({ settings, peerName }: { settings: ConversationSettingData; peerName: string }) {
  return (
    <div
      style={threadThemeStyle(settings)}
      className="relative h-[172px] overflow-hidden rounded-2xl border border-line shadow-[0_16px_34px_-22px_rgba(27,24,19,0.6)]"
    >
      <div
        className="pointer-events-none absolute inset-0 transition-[filter,background-color] duration-500 ease-fluid"
        style={backgroundArtStyle(settings)}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-paper transition-opacity duration-500 ease-fluid"
        style={{ opacity: settings.backgroundDim / 100 }}
      />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-line/40 bg-paper/45 px-3.5 py-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[12px] font-bold text-white">
            {(peerName || '?').charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-[13px] font-semibold text-ink">{peerName}</span>
          <span className="ml-auto text-[11px] text-accent-2">online</span>
        </div>
        <div
          className={`flex flex-1 flex-col justify-end px-3.5 pb-3.5 pt-2 ${settings.messageDensity === 'COMPACT' ? 'gap-1' : 'gap-2'}`}
          style={{
            fontFamily: messageFontFamily(settings.messageFont),
            fontSize: messageTextSizePx(settings.messageTextSize),
          }}
        >
          <div className="flex justify-start">
            <span className={`max-w-[80%] px-3.5 leading-snug ${messageBubblePadding(settings.messageDensity)} ${bubbleClass(settings.bubbleStyle, false, true)}`}>
              this is looking sharp
            </span>
          </div>
          <div className="flex justify-end">
            <span className={`max-w-[80%] px-3.5 leading-snug ${messageBubblePadding(settings.messageDensity)} ${bubbleClass(settings.bubbleStyle, true, true)}`}>
              made it ours
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── layout primitives ──
// Editorial section: a small-caps label paired with a hairline rule (the site's divider language),
// then the controls — no boxed card, which reads cleaner and less "dashboard".
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{title}</span>
        <span className="h-px flex-1 bg-line/70" />
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[12px] text-ink-soft">· {hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── controls ──
function Swatch({
  active,
  onClick,
  title,
  style,
}: {
  active: boolean
  onClick: () => void
  title: string
  style: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={style}
      className={`h-9 w-9 rounded-[11px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] transition ${
        active ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper-2' : 'hover:scale-105'
      }`}
    />
  )
}

function Seg<T extends string | number | null>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-line">
      {options.map((opt, i) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2.5 text-[13.5px] transition ${i > 0 ? 'border-l border-line' : ''} ${
            value === opt.value ? 'bg-accent font-medium text-white' : 'bg-paper text-ink-soft hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Slider({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-accent"
      />
      <span className="w-8 shrink-0 text-right font-mono text-[12px] text-ink-soft">{value}</span>
    </div>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function Toggle({
  label,
  hint,
  on,
  onToggle,
  divider,
}: {
  label: string
  hint: string
  on: boolean
  onToggle: () => void
  divider?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 bg-paper/40 px-4 py-3.5 text-left transition hover:bg-paper/70 ${
        divider ? 'border-t border-line' : ''
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[14px]">{label}</span>
        <span className="block text-[12px] text-ink-soft">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-accent-2' : 'bg-line'}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            on ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
