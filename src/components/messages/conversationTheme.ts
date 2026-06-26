import type { CSSProperties } from 'react'
import type { BubbleStyle, ConversationSettingData, MessageDensity, MessageFont, MessageTextSize } from '../../types'

// Per-thread theme tokens, mirroring coduel-ui/src/index.css. Applied as inline CSS variables on the
// thread wrapper so ONE conversation can be light or dark independently of the site-wide toggle — the
// site defines dark tokens on :root[data-theme="dark"] (root only), so a nested override needs the
// explicit values. Any accentHex layers on top of the chosen mode.
const LIGHT_TOKENS: Record<string, string> = {
  '--color-paper': '#f4efe6',
  '--color-paper-2': '#ede6d8',
  '--color-ink': '#1b1813',
  '--color-ink-soft': '#6b6354',
  '--color-line': '#d8cfbe',
  '--color-accent': '#9e3b2a',
  '--color-accent-2': '#2e6b4f',
  '--color-gold': '#b8893b',
}
const DARK_TOKENS: Record<string, string> = {
  '--color-paper': '#191410',
  '--color-paper-2': '#221a13',
  '--color-ink': '#f1e9db',
  '--color-ink-soft': '#a2937c',
  '--color-line': '#3a3025',
  '--color-accent': '#cb5b45',
  '--color-accent-2': '#74b394',
  '--color-gold': '#cba15c',
}

// The curated accent palette offered in the customize panel (null = "use the theme accent").
export const ACCENT_SWATCHES: string[] = [
  '#9e3b2a', '#c2410c', '#b8893b', '#a16207', '#4d7c0f', '#2e6b4f', '#0f766e', '#1b9aaa',
  '#0369a1', '#3a5a9e', '#4f46e5', '#7a4fa0', '#a21caf', '#c2557a', '#be123c', '#1b1813',
]

// Curated for the coding-duel vibe (not the stock 👍❤️😂 set): fire, got-cooked, GOAT, mind-blown,
// respect, big-brain, duel, lock-in. The compact set offered as the double-tap quick-reaction.
export const QUICK_REACTIONS: string[] = ['🔥', '💀', '🐐', '🤯', '🫡', '🧠', '⚔️', '😤']

// The fuller palette shown in a message's reaction picker.
export const REACTION_OPTIONS: string[] = [
  '🔥', '💀', '🐐', '🤯', '🫡', '🧠', '⚔️', '😤',
  '💯', '👀', '🤝', '🙏', '🥶', '⚡', '🤓', '🎯',
]

/** Inline CSS-var style for the thread subtree: per-DM theme mode + accent override. */
export function threadThemeStyle(s: ConversationSettingData | null): CSSProperties {
  if (!s) return {}
  const vars: Record<string, string> = {}
  if (s.themeMode === 'LIGHT') Object.assign(vars, LIGHT_TOKENS)
  else if (s.themeMode === 'DARK') Object.assign(vars, DARK_TOKENS)
  if (s.accentHex) vars['--color-accent'] = s.accentHex
  return vars as CSSProperties
}

// Only ever inject a same-origin-agnostic http(s) URL with no CSS-breaking characters — guards the
// url() against style injection even though there's no uploader yet.
function safeImageUrl(url: string | null): string | null {
  if (!url) return null
  return /^https?:\/\/[^"'()\s]+$/.test(url) ? url : null
}

/** The background "art" layer style for the thread (sits behind a dim overlay). */
export function backgroundArtStyle(s: ConversationSettingData | null): CSSProperties {
  const blur = s && s.backgroundBlur > 0 ? { filter: `blur(${s.backgroundBlur}px)`, transform: 'scale(1.08)' } : {}
  if (!s) return { backgroundColor: 'var(--color-paper)' }
  switch (s.backgroundPreset) {
    case 'SUNSET':
      return {
        ...blur,
        background:
          'radial-gradient(120% 90% at 10% -10%, color-mix(in srgb, var(--color-accent) 34%, transparent), transparent 55%),' +
          'radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-gold) 30%, transparent), transparent 52%),' +
          'var(--color-paper)',
      }
    case 'BLUEPRINT':
      return {
        ...blur,
        backgroundColor: 'var(--color-paper)',
        backgroundImage:
          'linear-gradient(color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px),' +
          'linear-gradient(90deg, color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }
    case 'FOREST':
      return {
        ...blur,
        background:
          'radial-gradient(120% 90% at 100% 110%, color-mix(in srgb, var(--color-accent-2) 32%, transparent), transparent 55%),' +
          'radial-gradient(110% 80% at 0% 0%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 50%),' +
          'var(--color-paper)',
      }
    case 'ESPRESSO':
      // Warm cozy wash kept on the paper base (not flat paper-2) so the paper-2 bubble still contrasts.
      return {
        ...blur,
        background:
          'radial-gradient(130% 110% at 50% -10%, color-mix(in srgb, var(--color-gold) 18%, transparent), transparent 60%),' +
          'radial-gradient(120% 95% at 50% 120%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 58%),' +
          'var(--color-paper)',
      }
    // Fixed-hue gradients (independent of the accent) so they read as distinct "moods".
    case 'AURORA':
      return {
        ...blur,
        background:
          'radial-gradient(120% 90% at 8% -10%, rgba(20,184,166,0.26), transparent 55%),' +
          'radial-gradient(120% 90% at 100% 5%, rgba(139,92,246,0.26), transparent 55%),' +
          'var(--color-paper)',
      }
    case 'OCEAN':
      return {
        ...blur,
        background:
          'radial-gradient(120% 95% at 0% 100%, rgba(14,116,144,0.30), transparent 55%),' +
          'radial-gradient(120% 85% at 100% 0%, rgba(56,189,248,0.22), transparent 52%),' +
          'var(--color-paper)',
      }
    case 'ROSE':
      return {
        ...blur,
        background:
          'radial-gradient(120% 90% at 10% -5%, rgba(244,114,182,0.28), transparent 55%),' +
          'radial-gradient(120% 90% at 100% 100%, rgba(251,191,36,0.20), transparent 55%),' +
          'var(--color-paper)',
      }
    case 'MIDNIGHT':
      return {
        ...blur,
        background:
          'radial-gradient(130% 100% at 50% -20%, rgba(99,102,241,0.26), transparent 60%),' +
          'radial-gradient(120% 90% at 100% 120%, rgba(20,184,166,0.14), transparent 55%),' +
          'var(--color-paper)',
      }
    case 'IMAGE': {
      const url = safeImageUrl(s.backgroundImageUrl)
      return url
        ? { ...blur, backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { ...blur, backgroundColor: 'var(--color-paper)' }
    }
    case 'PARCHMENT':
    default:
      return {
        ...blur,
        backgroundColor: 'var(--color-paper)',
        backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-ink) 8%, transparent) 1px, transparent 1px)',
        backgroundSize: '5px 5px',
      }
  }
}

/** Full bubble className — radius + fill + shadow per style. Every variant stays rounded (no sharp edges). */
export function bubbleClass(style: BubbleStyle, mine: boolean, endGroup: boolean): string {
  const radius =
    style === 'PILL'
      ? 'rounded-[22px]'
      : mine
        ? endGroup
          ? 'rounded-2xl rounded-br-md'
          : 'rounded-2xl'
        : endGroup
          ? 'rounded-2xl rounded-bl-md'
          : 'rounded-2xl'
  const shadow = style === 'MINIMAL' ? '' : 'shadow-sm'
  // Incoming bubbles are paper-2 (darker than every background's paper base, so they always contrast);
  // outgoing bubbles use the per-DM accent.
  const fill = mine
    ? 'bg-accent text-white'
    : style === 'MINIMAL'
      ? 'bg-paper-2/70 text-ink'
      : 'border border-line bg-paper-2 text-ink'
  // transition-colors so an accent / theme change in the customize panel eases in instead of snapping.
  return `${radius} ${shadow} ${fill} transition-colors duration-300`
}

/** Message typeface mapped to a font-family value (undefined = inherit the app's sans). */
export function messageFontFamily(font: MessageFont): string | undefined {
  if (font === 'SERIF') return 'Georgia, "Times New Roman", serif'
  if (font === 'MONO') return 'var(--font-mono)'
  return undefined
}

/** Message body font-size (px) for the chosen text size — MEDIUM matches the default bubble size. */
export function messageTextSizePx(size: MessageTextSize | undefined): number {
  if (size === 'SMALL') return 12.5
  if (size === 'LARGE') return 15.5
  return 13.5
}

/** Top-margin class for a message row, scaled by density (COMPACT tightens the gaps). */
export function messageRowGap(density: MessageDensity | undefined, startGroup: boolean): string {
  if (density === 'COMPACT') return startGroup ? 'mt-1.5' : 'mt-px'
  return startGroup ? 'mt-2.5' : 'mt-0.5'
}

/** Vertical padding class for a text bubble, scaled by density. */
export function messageBubblePadding(density: MessageDensity | undefined): string {
  return density === 'COMPACT' ? 'py-1.5' : 'py-2'
}
