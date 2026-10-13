import { describe, it, expect } from 'vitest'
import { COMPLIANCE_FRAMEWORKS, NCA_ECC } from '@/lib/compliance/frameworks'
import { FRAMEWORKS_AR, CONTROLS_AR, CATEGORIES_AR, FEATURES_AR } from '@/lib/compliance/frameworks.ar'
import {
  localizeFramework, localizeControl, complianceLocaleFromRequest, normalizeComplianceLocale,
} from '@/lib/compliance/localize'

const ARABIC = /[؀-ۿ]/
const allControls = COMPLIANCE_FRAMEWORKS.flatMap((f) => f.controls)

describe('compliance frameworks Arabic overlay', () => {
  it('control ids are unique (overlay is keyed by id)', () => {
    const ids = allControls.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers every framework, control, category and feature — and nothing extra', () => {
    expect(Object.keys(FRAMEWORKS_AR).sort()).toEqual(COMPLIANCE_FRAMEWORKS.map((f) => f.key).sort())
    expect(Object.keys(CONTROLS_AR).sort()).toEqual(allControls.map((c) => c.id).sort())
    expect(Object.keys(CATEGORIES_AR).sort()).toEqual([...new Set(allControls.map((c) => c.category))].sort())
    expect(Object.keys(FEATURES_AR).sort()).toEqual([...new Set(allControls.flatMap((c) => c.coveredBy))].sort())
  })

  it('all overlay text is non-empty Arabic', () => {
    const texts = [
      ...Object.values(FRAMEWORKS_AR).flatMap((f) => [f.fullName, f.description]),
      ...Object.values(CONTROLS_AR).flatMap((c) => [c.name, c.description]),
      ...Object.values(CATEGORIES_AR),
      ...Object.values(FEATURES_AR),
    ]
    for (const t of texts) expect(t).toMatch(ARABIC)
  })

  it('uses the official Arabic framework names', () => {
    expect(FRAMEWORKS_AR.NCA_ECC.fullName).toContain('الضوابط الأساسية للأمن السيبراني')
    expect(FRAMEWORKS_AR.PDPL.fullName).toBe('نظام حماية البيانات الشخصية')
  })
})

describe('localizeFramework / localizeControl', () => {
  it('English returns the original objects', () => {
    for (const fw of COMPLIANCE_FRAMEWORKS) expect(localizeFramework(fw, 'en')).toBe(fw)
    expect(localizeControl(NCA_ECC.controls[0], 'en')).toBe(NCA_ECC.controls[0])
  })

  it('Arabic replaces text and keeps ids, keys, versions and assessment data', () => {
    const before = JSON.stringify(COMPLIANCE_FRAMEWORKS)
    for (const fw of COMPLIANCE_FRAMEWORKS) {
      const ar = localizeFramework(fw, 'ar')
      expect(ar.key).toBe(fw.key)
      expect(ar.name).toBe(fw.name)
      expect(ar.version).toBe(fw.version)
      expect(ar.fullName).toBe(FRAMEWORKS_AR[fw.key].fullName)
      expect(ar.controls).toHaveLength(fw.controls.length)
      ar.controls.forEach((c, i) => {
        const src = fw.controls[i]
        expect(c.id).toBe(src.id)
        expect(c.relatedViolations).toEqual(src.relatedViolations)
        expect(c.assessmentMethod).toBe(src.assessmentMethod)
        expect(c.name).toBe(CONTROLS_AR[src.id].name)
        expect(c.description).toBe(CONTROLS_AR[src.id].description)
        expect(c.category).toBe(CATEGORIES_AR[src.category])
        expect(c.coveredBy).toHaveLength(src.coveredBy.length)
        for (const f of c.coveredBy) expect(f).toMatch(ARABIC)
      })
    }
    expect(JSON.stringify(COMPLIANCE_FRAMEWORKS)).toBe(before)
  })

  it('falls back to English for unknown controls, categories and features', () => {
    const control = {
      id: 'X-1', name: 'Custom', description: 'Custom control', category: 'Other',
      coveredBy: ['Audit Trail', 'Some New Feature'], relatedViolations: [], assessmentMethod: 'manual' as const,
    }
    const ar = localizeControl(control, 'ar')
    expect(ar.name).toBe('Custom')
    expect(ar.description).toBe('Custom control')
    expect(ar.category).toBe('Other')
    expect(ar.coveredBy).toEqual(['سجل التدقيق', 'Some New Feature'])
  })

  it('reads ?locale= before the locale cookie', () => {
    const req = (q: string | null, cookie?: string) => ({
      nextUrl: { searchParams: { get: () => q } },
      cookies: { get: () => (cookie ? { value: cookie } : undefined) },
    })
    expect(complianceLocaleFromRequest(req(null, 'ar'))).toBe('ar')
    expect(complianceLocaleFromRequest(req('en', 'ar'))).toBe('en')
    expect(complianceLocaleFromRequest(req(null))).toBe('en')
    expect(normalizeComplianceLocale('de')).toBe('en')
  })
})
