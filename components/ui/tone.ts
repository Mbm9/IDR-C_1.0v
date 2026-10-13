// Accessible text colours for the semantic tokens.
//
// The raw tokens (--color-critical, --color-high, …) are tuned for fills and
// strokes; as small text on white or on their tinted backgrounds several of them
// fall below WCAG AA (e.g. --color-medium on --color-medium-bg is 2.8:1). These
// classes derive a darker shade in light mode and a lighter one in dark mode from
// the same tokens, which keeps every pairing at 4.5:1 or better.
//
// Tailwind only generates classes it can see as whole strings, so each entry is
// spelled out in full.

export type Tone = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'nhi' | 'neutral'

export const TONE_TEXT: Record<Tone, string> = {
  critical: 'text-[color-mix(in_srgb,var(--color-critical)_75%,black)] [.dark_&]:text-[color-mix(in_srgb,var(--color-critical)_70%,white)]',
  high: 'text-[color-mix(in_srgb,var(--color-high)_75%,black)] [.dark_&]:text-[color-mix(in_srgb,var(--color-high)_70%,white)]',
  medium: 'text-[color-mix(in_srgb,var(--color-medium)_75%,black)] [.dark_&]:text-[color-mix(in_srgb,var(--color-medium)_70%,white)]',
  low: 'text-[color-mix(in_srgb,var(--color-low)_75%,black)] [.dark_&]:text-[color-mix(in_srgb,var(--color-low)_70%,white)]',
  info: 'text-[color-mix(in_srgb,var(--color-info)_75%,black)] [.dark_&]:text-[color-mix(in_srgb,var(--color-info)_70%,white)]',
  nhi: 'text-[color-mix(in_srgb,var(--color-nhi)_75%,black)] [.dark_&]:text-[color-mix(in_srgb,var(--color-nhi)_70%,white)]',
  neutral: 'text-[var(--text-secondary)]',
}

const TONE_BG: Record<Tone, string> = {
  critical: 'bg-[var(--color-critical-bg)]',
  high: 'bg-[var(--color-high-bg)]',
  medium: 'bg-[var(--color-medium-bg)]',
  low: 'bg-[var(--color-low-bg)]',
  info: 'bg-[var(--color-info-bg)]',
  nhi: 'bg-[color-mix(in_srgb,var(--color-nhi)_10%,var(--bg-primary))]',
  neutral: 'bg-[var(--bg-tertiary)]',
}

/** Tinted pill/badge: tone text on the tone's background. */
export function toneBadge(tone: Tone): string {
  return `${TONE_TEXT[tone]} ${TONE_BG[tone]}`
}

export function severityTone(severity: string | null | undefined): Tone {
  switch (severity) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'medium': return 'medium'
    case 'low': return 'low'
    default: return 'neutral'
  }
}

export function riskTone(score: number | null | undefined): Tone {
  if (score == null) return 'neutral'
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

export function tierTone(tier: string | null | undefined): Tone {
  switch (tier) {
    case 'tier_0': return 'critical'
    case 'tier_1': return 'high'
    case 'tier_2': return 'info'
    default: return 'neutral'
  }
}

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'open':
    case 'disabled':
      return 'critical'
    case 'active':
      return 'low'
    case 'acknowledged':
    case 'investigating':
    case 'dormant':
      return 'medium'
    case 'remediated':
    case 'resolved':
    case 'investigated':
    case 'certified':
      return 'low'
    case 'excepted':
    case 'contained':
    case 'confirmed':
      return 'info'
    case 'orphaned':
      return 'nhi'
    case 'suspended':
    case 'pending':
      return 'high'
    default:
      return 'neutral'
  }
}
