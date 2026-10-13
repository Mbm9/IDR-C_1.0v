import { describe, it, expect } from 'vitest'
import { ISSUE_CATALOG, getIssueDef, GENERIC_ISSUE_TEXT } from '@/lib/issues/catalog'
import { ISSUE_CATALOG_AR, GENERIC_ISSUE_TEXT_AR, IMPACT_LABELS } from '@/lib/issues/catalog.ar'
import {
  localizeIssue, getLocalizedIssueDef, getIssueOverlay, impactLabel,
  issueLocaleFromRequest, normalizeIssueLocale,
} from '@/lib/issues/localize'

const ARABIC = /[؀-ۿ]/
const entries = Object.entries(ISSUE_CATALOG)

describe('issue catalog Arabic overlay', () => {
  it('has an overlay for every catalog entry and nothing extra', () => {
    expect(Object.keys(ISSUE_CATALOG_AR).sort()).toEqual(Object.keys(ISSUE_CATALOG).sort())
  })

  it.each(entries)('%s: Arabic text in every field, same number of steps', (type, def) => {
    const ar = ISSUE_CATALOG_AR[type]
    expect(ar).toBeDefined()
    expect(ar.mitigation.steps).toHaveLength(def.mitigation.steps.length)
    for (const text of [ar.name, ar.description, ar.mitigation.summary, ...ar.mitigation.steps]) {
      expect(text.trim().length).toBeGreaterThan(0)
      expect(text).toMatch(ARABIC)
    }
  })

  it('keeps the ESC prefix and FSID-relevant identifiers in Arabic names', () => {
    for (const type of ['esc1', 'esc2', 'esc3', 'esc4', 'esc6', 'esc8']) {
      expect(ISSUE_CATALOG_AR[type].name.startsWith(type.toUpperCase())).toBe(true)
    }
    expect(ISSUE_CATALOG_AR.kerberoastable.name).toContain('Kerberoasting')
  })

  it('keeps commands embedded in steps intact', () => {
    expect(ISSUE_CATALOG_AR.esc6.mitigation.steps[0]).toContain('certutil -setreg policy\\EditFlags -EDITF_ATTRIBUTESUBJECTALTNAME2')
  })

  it('has Arabic labels for every impact category', () => {
    for (const key of Object.keys(IMPACT_LABELS.en)) expect(IMPACT_LABELS.ar[key]).toMatch(ARABIC)
    expect(GENERIC_ISSUE_TEXT_AR.description).toMatch(ARABIC)
    expect(GENERIC_ISSUE_TEXT_AR.summary).toMatch(ARABIC)
  })
})

describe('localizeIssue', () => {
  it('returns the original object for English', () => {
    for (const [, def] of entries) expect(localizeIssue(def, 'en')).toBe(def)
    expect(getLocalizedIssueDef('kerberoastable', 'en')).toBe(ISSUE_CATALOG.kerberoastable)
  })

  it('overlays Arabic text and keeps every non-text field', () => {
    for (const [type, def] of entries) {
      const ar = localizeIssue(def, 'ar')
      const overlay = ISSUE_CATALOG_AR[type]
      expect(ar.name).toBe(overlay.name)
      expect(ar.description).toBe(overlay.description)
      expect(ar.mitigation.summary).toBe(overlay.mitigation.summary)
      expect(ar.mitigation.steps).toEqual(overlay.mitigation.steps)
      expect(ar.mitigation.script).toBe(def.mitigation.script)
      for (const k of ['fsid', 'category', 'severity', 'impact', 'mitre', 'certainty', 'privilege', 'ease', 'exposurePoints'] as const) {
        expect(ar[k]).toEqual(def[k])
      }
    }
  })

  it('does not mutate the English catalog', () => {
    const before = JSON.stringify(ISSUE_CATALOG)
    for (const [, def] of entries) localizeIssue(def, 'ar')
    expect(JSON.stringify(ISSUE_CATALOG)).toBe(before)
    expect(ISSUE_CATALOG.kerberoastable.name).toBe('Kerberoastable Accounts')
  })

  it('falls back to English per field and per step', () => {
    const def = ISSUE_CATALOG.kerberoastable
    const out = localizeIssue(def, 'ar', { name: 'اسم', mitigation: { summary: '', steps: ['خطوة أولى'] } })
    expect(out.name).toBe('اسم')
    expect(out.description).toBe(def.description)
    expect(out.mitigation.summary).toBe(def.mitigation.summary)
    expect(out.mitigation.steps[0]).toBe('خطوة أولى')
    expect(out.mitigation.steps.slice(1)).toEqual(def.mitigation.steps.slice(1))
  })

  it('translates the generic placeholder text of uncatalogued types and keeps their name', () => {
    const en = getIssueDef('some_new_finding')
    expect(en.description).toBe(GENERIC_ISSUE_TEXT.description)
    const ar = getLocalizedIssueDef('some_new_finding', 'ar')
    expect(ar.name).toBe(en.name)
    expect(ar.description).toBe(GENERIC_ISSUE_TEXT_AR.description)
    expect(ar.mitigation.summary).toBe(GENERIC_ISSUE_TEXT_AR.summary)
    expect(ar.fsid).toBe(en.fsid)
  })

  it('finds overlays by type or FSID', () => {
    expect(getIssueOverlay('asrep_roastable', 'ar')).toBe(ISSUE_CATALOG_AR.asrep_roastable)
    expect(getIssueOverlay('FS-ASREP-ROASTABLE', 'ar')).toBe(ISSUE_CATALOG_AR.asrep_roastable)
    expect(getIssueOverlay('asrep_roastable', 'en')).toBeUndefined()
    expect(getIssueOverlay('unknown_type', 'ar')).toBeUndefined()
  })
})

describe('locale helpers', () => {
  it('normalizes locale values', () => {
    expect(normalizeIssueLocale('ar')).toBe('ar')
    expect(normalizeIssueLocale('en')).toBe('en')
    expect(normalizeIssueLocale('fr')).toBe('en')
    expect(normalizeIssueLocale(undefined)).toBe('en')
  })

  it('reads ?locale= before the locale cookie', () => {
    const req = (query: string | null, cookie?: string) => ({
      nextUrl: { searchParams: { get: (n: string) => (n === 'locale' ? query : null) } },
      cookies: { get: (n: string) => (n === 'locale' && cookie ? { value: cookie } : undefined) },
    })
    expect(issueLocaleFromRequest(req(null, 'ar'))).toBe('ar')
    expect(issueLocaleFromRequest(req('en', 'ar'))).toBe('en')
    expect(issueLocaleFromRequest(req('ar'))).toBe('ar')
    expect(issueLocaleFromRequest(req(null))).toBe('en')
  })

  it('labels impacts with English fallback', () => {
    expect(impactLabel('credential_theft', 'en')).toBe('Credential Theft')
    expect(impactLabel('credential_theft', 'ar')).toBe('سرقة بيانات الاعتماد')
    expect(impactLabel('custom_impact', 'ar')).toBe('custom_impact')
  })
})
