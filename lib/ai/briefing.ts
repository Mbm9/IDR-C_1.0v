/**
 * Daily briefing content: deterministic generation, storage format and
 * per-locale rendering.
 *
 * Storage (briefings.highlights jsonb) — one array holding both the visible
 * highlight chips and the narrative parts, so no schema change is needed:
 *   { type: 'negative'|'positive'|'action', text, key?, params?, i18n? }
 *   { type: 'narrative', part: 'headline'|'insight'|'priority', text, key?, params?, i18n?,
 *     generatedBy?, model?, lang? }
 *
 * `text` is always the English rendering (backward compatible with older rows
 * and webhook consumers). Deterministic entries carry a message `key` +
 * `params` (rendered from messages/<locale>.json at read time); AI entries
 * carry the model's text plus optional `i18n` translations. Older rows have
 * neither and are shown with their stored text.
 */
import { createTranslator } from 'next-intl'
import en from '@/messages/en.json'
import ar from '@/messages/ar.json'

export type BriefingLocale = 'en' | 'ar'
export const BRIEFING_LOCALES: BriefingLocale[] = ['en', 'ar']

const MESSAGES: Record<BriefingLocale, Record<string, unknown>> = { en, ar }

export type BriefingParams = Record<string, string | number>

export interface BriefingText {
  text: string
  key?: string
  params?: BriefingParams
  i18n?: Partial<Record<BriefingLocale, string>>
}

export interface BriefingContent {
  headline: BriefingText
  needsAttention: BriefingText[]
  positives: BriefingText[]
  insight: BriefingText
  suggestedPriority: BriefingText
  generatedBy: 'ai' | 'deterministic'
  model?: string
  /** Language of the free text (AI output); deterministic content is keyed. */
  lang: BriefingLocale
}

export type NarrativePart = 'headline' | 'insight' | 'priority'

export interface StoredHighlight extends BriefingText {
  type: 'negative' | 'positive' | 'action' | 'narrative'
  part?: NarrativePart
  generatedBy?: 'ai' | 'deterministic'
  model?: string
  lang?: BriefingLocale
}

export interface BriefingMetrics {
  totalIdentities: number
  openViolations: number
  tierViolations: number
  avgRiskScore: number
}

export function normalizeLocale(value: string | null | undefined): BriefingLocale {
  return value === 'ar' ? 'ar' : 'en'
}

// ── Rendering ──

function hasMessage(locale: BriefingLocale, key: string): boolean {
  let node: unknown = MESSAGES[locale]
  for (const segment of key.split('.')) {
    if (!node || typeof node !== 'object' || !(segment in (node as Record<string, unknown>))) return false
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string'
}

const translators = new Map<BriefingLocale, (key: string, params?: BriefingParams) => string>()

function translator(locale: BriefingLocale) {
  let t = translators.get(locale)
  if (!t) {
    const base = createTranslator({
      locale,
      messages: MESSAGES[locale] as any,
      onError: () => {},
    }) as unknown as (key: string, params?: BriefingParams) => string
    t = base
    translators.set(locale, t)
  }
  return t
}

/** Render one message key in a locale; null when the key is unknown there. */
export function renderBriefingKey(locale: BriefingLocale, key: string, params?: BriefingParams): string | null {
  if (!hasMessage(locale, key)) return null
  try {
    return translator(locale)(key, params)
  } catch {
    return null
  }
}

/** Text for a stored item in a locale: key → translation → stored text. */
export function renderBriefingText(item: BriefingText, locale: BriefingLocale): string {
  if (item.key) {
    const rendered = renderBriefingKey(locale, item.key, item.params)
    if (rendered !== null) return rendered
  }
  const translated = item.i18n?.[locale]
  if (translated) return translated
  return item.text
}

function keyed(key: string, params?: BriefingParams): BriefingText {
  return { key, ...(params ? { params } : {}), text: renderBriefingKey('en', key, params) ?? key }
}

// ── Deterministic generation ──

/** Maps an attention item key to the matching "today's priority" key. */
const PRIORITY_FOR: Record<string, string> = {
  'briefing.auto.newOpenViolations': 'briefing.auto.priorityNewOpenViolations',
  'briefing.auto.newTierViolations': 'briefing.auto.priorityNewTierViolations',
  'briefing.auto.riskIncreased': 'briefing.auto.priorityRiskIncreased',
}

export function buildDeterministicBriefing(metrics: BriefingMetrics, delta: BriefingMetrics): BriefingContent {
  const headline = delta.openViolations > 0
    ? keyed('briefing.auto.headlineNewViolations', { count: delta.openViolations })
    : keyed('briefing.auto.headlineStable')

  const needsAttention: BriefingText[] = []
  const positives: BriefingText[] = []

  if (delta.openViolations > 0) needsAttention.push(keyed('briefing.auto.newOpenViolations', { count: delta.openViolations }))
  if (delta.tierViolations > 0) needsAttention.push(keyed('briefing.auto.newTierViolations', { count: delta.tierViolations }))
  if (delta.avgRiskScore > 2) needsAttention.push(keyed('briefing.auto.riskIncreased', { delta: delta.avgRiskScore }))

  if (delta.openViolations < 0) positives.push(keyed('briefing.auto.violationsResolved', { count: Math.abs(delta.openViolations) }))
  if (delta.avgRiskScore < -2) positives.push(keyed('briefing.auto.riskImproved', { delta: Math.abs(delta.avgRiskScore) }))
  if (delta.tierViolations < 0) positives.push(keyed('briefing.auto.tierViolationsResolved', { count: Math.abs(delta.tierViolations) }))

  const urgent = needsAttention[0]
  if (!positives.length) positives.push(keyed('briefing.auto.postureMaintained'))
  if (!needsAttention.length) needsAttention.push(keyed('briefing.auto.noUrgentItems'))

  const suggestedPriority = urgent?.key && PRIORITY_FOR[urgent.key]
    ? keyed(PRIORITY_FOR[urgent.key], urgent.params)
    : keyed('briefing.auto.priorityDefault')

  return {
    headline,
    needsAttention,
    positives,
    insight: keyed('briefing.auto.insight', {
      identities: metrics.totalIdentities,
      violations: metrics.openViolations,
      risk: metrics.avgRiskScore,
    }),
    suggestedPriority,
    generatedBy: 'deterministic',
    lang: 'en',
  }
}

// ── AI output ──

export interface AIBriefingJSON {
  headline: string
  needsAttention?: string[]
  positives?: string[]
  insight?: string
  suggestedPriority?: string
}

export function parseAIBriefing(parsed: any): AIBriefingJSON | null {
  if (!parsed || typeof parsed !== 'object' || typeof parsed.headline !== 'string' || !parsed.headline.trim()) return null
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [])
  return {
    headline: parsed.headline,
    needsAttention: strings(parsed.needsAttention),
    positives: strings(parsed.positives),
    insight: typeof parsed.insight === 'string' ? parsed.insight : '',
    suggestedPriority: typeof parsed.suggestedPriority === 'string' ? parsed.suggestedPriority : '',
  }
}

/**
 * Build content from the model's (English) JSON; `arabic` is an optional
 * translation of the same JSON, matched item by item.
 */
export function fromAIBriefing(data: AIBriefingJSON, model: string, arabic?: AIBriefingJSON | null): BriefingContent {
  const item = (text: string, arText?: string): BriefingText =>
    arText && arText.trim() ? { text, i18n: { ar: arText } } : { text }
  const list = (items: string[] = [], arItems: string[] = []) =>
    items.map((t, i) => item(t, arabic ? arItems[i] : undefined))

  return {
    headline: item(data.headline, arabic?.headline),
    needsAttention: list(data.needsAttention, arabic?.needsAttention),
    positives: list(data.positives, arabic?.positives),
    insight: item(data.insight ?? '', arabic?.insight),
    suggestedPriority: item(data.suggestedPriority ?? '', arabic?.suggestedPriority),
    generatedBy: 'ai',
    model,
    lang: 'en',
  }
}

// ── Storage ──

export function toStoredHighlights(content: BriefingContent): StoredHighlight[] {
  const out: StoredHighlight[] = []
  for (const item of content.needsAttention) out.push({ type: 'negative', ...item })
  for (const item of content.positives) out.push({ type: 'positive', ...item })
  if (content.suggestedPriority.text) out.push({ type: 'action', ...content.suggestedPriority })

  out.push({
    type: 'narrative',
    part: 'headline',
    ...content.headline,
    generatedBy: content.generatedBy,
    ...(content.model ? { model: content.model } : {}),
    lang: content.lang,
  })
  out.push({ type: 'narrative', part: 'insight', ...content.insight })
  out.push({ type: 'narrative', part: 'priority', ...content.suggestedPriority })
  return out
}

function composeNarrative(headline: string, insight: string, priority: string, locale: BriefingLocale): string {
  const label = renderBriefingKey(locale, 'briefing.auto.priorityLabel', { text: priority }) ?? `Priority: ${priority}`
  return [headline, '', insight, '', label].join('\n')
}

/** English narrative stored in briefings.narrative (same layout as before). */
export function toEnglishNarrative(content: BriefingContent): string {
  return composeNarrative(
    renderBriefingText(content.headline, 'en'),
    renderBriefingText(content.insight, 'en'),
    renderBriefingText(content.suggestedPriority, 'en'),
    'en',
  )
}

/** Visible highlight chips (narrative parts removed), English text. */
export function visibleHighlights(stored: StoredHighlight[]): Array<{ type: string; text: string }> {
  return stored.filter((h) => h.type !== 'narrative').map((h) => ({ type: h.type, text: h.text }))
}

// ── Read-side localization ──

export interface BriefingRowLike {
  narrative: string | null
  highlights: unknown
  [key: string]: unknown
}

export interface LocalizedBriefingFields {
  narrative: string | null
  highlights: Array<{ type: string; text: string }>
  generatedBy: 'ai' | 'deterministic' | null
  model: string | null
  /** Locale the text was rendered for. */
  locale: BriefingLocale
  /** Language the returned text is actually in (differs from locale when no translation exists). */
  language: BriefingLocale
}

function isStoredHighlight(v: unknown): v is StoredHighlight {
  return !!v && typeof v === 'object' && typeof (v as StoredHighlight).type === 'string'
}

export function localizeBriefing<T extends BriefingRowLike>(row: T, locale: BriefingLocale): T & LocalizedBriefingFields {
  const stored = (Array.isArray(row.highlights) ? row.highlights : []).filter(isStoredHighlight)
  const visible = stored.filter((h) => h.type !== 'narrative')
  const parts = new Map<NarrativePart, StoredHighlight>()
  for (const h of stored) if (h.type === 'narrative' && h.part) parts.set(h.part, h)

  let language: BriefingLocale = locale
  const render = (item: StoredHighlight): string => {
    const localized =
      (item.key && renderBriefingKey(locale, item.key, item.params) !== null) || !!item.i18n?.[locale] || locale === 'en'
    if (!localized) language = 'en'
    return renderBriefingText(item, locale)
  }

  const highlights = visible.map((h) => ({ type: h.type, text: render(h) }))

  let narrative = row.narrative
  const headline = parts.get('headline')
  if (headline) {
    const insight = parts.get('insight')
    const priority = parts.get('priority')
    narrative = composeNarrative(
      render(headline),
      insight ? render(insight) : '',
      priority ? render(priority) : '',
      locale,
    )
  } else if (locale !== 'en' && row.narrative) {
    // Legacy row (before keyed storage): the stored narrative is English text.
    language = 'en'
  }

  const generatedBy = headline?.generatedBy
    ?? (stored.some((h) => h.key) ? 'deterministic' : null)

  return {
    ...row,
    narrative,
    highlights,
    generatedBy,
    model: headline?.model ?? null,
    locale,
    language,
  }
}
