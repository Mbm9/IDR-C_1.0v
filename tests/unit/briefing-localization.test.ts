import { describe, it, expect } from 'vitest'
import en from '@/messages/en.json'
import ar from '@/messages/ar.json'
import {
  buildDeterministicBriefing,
  fromAIBriefing,
  localizeBriefing,
  renderBriefingKey,
  toEnglishNarrative,
  toStoredHighlights,
  visibleHighlights,
  normalizeLocale,
  type StoredHighlight,
} from '@/lib/ai/briefing'

const ARABIC = /[؀-ۿ]/
// Arabic plural forms may render digits as Arabic-Indic numerals depending on ICU data.
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))

const metrics = { totalIdentities: 200, openViolations: 12, tierViolations: 4, avgRiskScore: 41 }

function row(highlights: StoredHighlight[] | unknown, narrative: string | null = null) {
  return { id: 'b1', orgId: 'o1', generatedAt: new Date().toISOString(), narrative, highlights }
}

describe('briefing localization', () => {
  it('every briefing.auto key exists in both EN and AR messages', () => {
    const enKeys = Object.keys((en as any).briefing.auto).sort()
    const arKeys = Object.keys((ar as any).briefing.auto).sort()
    expect(enKeys.length).toBeGreaterThan(0)
    expect(arKeys).toEqual(enKeys)
  })

  it('renders a stored key + params highlight in English and Arabic', () => {
    const stored: StoredHighlight[] = [
      { type: 'negative', key: 'briefing.auto.newOpenViolations', params: { count: 5 }, text: '5 new open violations' },
    ]

    const enOut = localizeBriefing(row(stored), 'en')
    expect(enOut.highlights).toEqual([{ type: 'negative', text: '5 new open violations' }])
    expect(enOut.language).toBe('en')

    const arOut = localizeBriefing(row(stored), 'ar')
    expect(arOut.highlights).toHaveLength(1)
    expect(arOut.highlights[0].type).toBe('negative')
    expect(arOut.highlights[0].text).toMatch(ARABIC)
    expect(digits(arOut.highlights[0].text)).toContain('5')
    expect(arOut.highlights[0].text).not.toContain('violations')
    expect(arOut.language).toBe('ar')
  })

  it('uses ICU plurals (singular in EN, dual in AR)', () => {
    expect(renderBriefingKey('en', 'briefing.auto.newOpenViolations', { count: 1 })).toBe('1 new open violation')
    expect(renderBriefingKey('ar', 'briefing.auto.newOpenViolations', { count: 2 })).toBe('مخالفتان مفتوحتان جديدتان')
  })

  it('deterministic briefing is keyed and the stored narrative stays English', () => {
    const delta = { totalIdentities: 0, openViolations: 3, tierViolations: 0, avgRiskScore: -5 }
    const content = buildDeterministicBriefing(metrics, delta)
    expect(content.generatedBy).toBe('deterministic')
    expect(content.headline.key).toBe('briefing.auto.headlineNewViolations')
    expect(content.headline.text).toBe('3 new open violations detected overnight')

    const narrative = toEnglishNarrative(content)
    expect(narrative.split('\n')[0]).toBe('3 new open violations detected overnight')
    expect(narrative).toContain('Current posture: 200 identities, 12 open violations, avg risk 41.')
    expect(narrative).toContain('Priority: Address the 3 new open violations')

    const stored = toStoredHighlights(content)
    // Visible chips (what webhooks and old readers get) exclude narrative parts.
    expect(visibleHighlights(stored)).toEqual([
      { type: 'negative', text: '3 new open violations' },
      { type: 'positive', text: 'Average risk score improved by 5' },
      { type: 'action', text: 'Address the 3 new open violations' },
    ])

    const arOut = localizeBriefing(row(stored, narrative), 'ar')
    expect(arOut.generatedBy).toBe('deterministic')
    expect(arOut.model).toBeNull()
    expect(arOut.highlights.map((h) => h.type)).toEqual(['negative', 'positive', 'action'])
    expect(arOut.highlights.every((h) => ARABIC.test(h.text))).toBe(true)
    const lines = arOut.narrative!.split('\n')
    expect(lines[0]).toMatch(ARABIC)
    expect(lines[0]).not.toMatch(/overnight/)
    expect(lines[4].startsWith('الأولوية:')).toBe(true)

    const enOut = localizeBriefing(row(stored, narrative), 'en')
    expect(enOut.narrative).toBe(narrative)
  })

  it('stable posture produces the default keyed items', () => {
    const zero = { totalIdentities: 0, openViolations: 0, tierViolations: 0, avgRiskScore: 0 }
    const content = buildDeterministicBriefing(metrics, zero)
    expect(content.headline.key).toBe('briefing.auto.headlineStable')
    expect(content.needsAttention.map((i) => i.key)).toEqual(['briefing.auto.noUrgentItems'])
    expect(content.positives.map((i) => i.key)).toEqual(['briefing.auto.postureMaintained'])
    expect(content.suggestedPriority.key).toBe('briefing.auto.priorityDefault')
  })

  it('AI briefing uses the stored Arabic translation and is labelled as AI output', () => {
    const content = fromAIBriefing(
      { headline: 'Risk is up', needsAttention: ['Fix svc-backup'], positives: [], insight: 'Trend rising', suggestedPriority: 'Rotate keys' },
      'qwen2.5:7b',
      { headline: 'المخاطر مرتفعة', needsAttention: ['إصلاح svc-backup'], positives: [], insight: 'اتجاه تصاعدي', suggestedPriority: 'تدوير المفاتيح' },
    )
    const stored = toStoredHighlights(content)
    const arOut = localizeBriefing(row(stored, toEnglishNarrative(content)), 'ar')
    expect(arOut.generatedBy).toBe('ai')
    expect(arOut.model).toBe('qwen2.5:7b')
    expect(arOut.language).toBe('ar')
    expect(arOut.narrative!.split('\n')[0]).toBe('المخاطر مرتفعة')
    expect(arOut.highlights).toEqual([
      { type: 'negative', text: 'إصلاح svc-backup' },
      { type: 'action', text: 'تدوير المفاتيح' },
    ])
  })

  it('AI briefing without a translation reports its language as English', () => {
    const content = fromAIBriefing({ headline: 'Risk is up', needsAttention: ['Fix it'] }, 'm')
    const arOut = localizeBriefing(row(toStoredHighlights(content)), 'ar')
    expect(arOut.narrative!.split('\n')[0]).toBe('Risk is up')
    expect(arOut.language).toBe('en')
  })

  it('legacy rows (text only) fall back to the stored text', () => {
    const legacy = row([{ type: 'positive', text: 'Maintaining current security posture' }], 'Old headline\n\nOld insight')
    const out = localizeBriefing(legacy, 'ar')
    expect(out.narrative).toBe('Old headline\n\nOld insight')
    expect(out.highlights).toEqual([{ type: 'positive', text: 'Maintaining current security posture' }])
    expect(out.generatedBy).toBeNull()
    expect(out.language).toBe('en')

    expect(localizeBriefing(row(null, null), 'ar').highlights).toEqual([])
  })

  it('normalizes the locale cookie value', () => {
    expect(normalizeLocale('ar')).toBe('ar')
    expect(normalizeLocale('fr')).toBe('en')
    expect(normalizeLocale(undefined)).toBe('en')
  })
})
