import type { ThemeColors } from './types'

const CSS_MAP: Record<keyof ThemeColors, string> = {
  bg: '--bg',
  bgPanel: '--bg-panel',
  bgElevated: '--bg-elevated',
  bgHover: '--bg-hover',
  border: '--border',
  text: '--text',
  textMuted: '--text-muted',
  accent: '--accent',
  accentStrong: '--accent-strong',
  danger: '--danger',
  dangerStrong: '--danger-strong',
  live: '--live',
  ok: '--ok',
}

export function applyTheme(theme: ThemeColors): void {
  const root = document.documentElement
  for (const key of Object.keys(CSS_MAP) as (keyof ThemeColors)[]) {
    root.style.setProperty(CSS_MAP[key], theme[key])
  }
  // Keep body/html in sync for Electron chrome
  document.body.style.background = theme.bg
  document.body.style.color = theme.text
}
