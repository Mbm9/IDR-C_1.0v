import { describe, it, expect } from 'vitest'
import en from '@/i18n/messages/en.json'
import ar from '@/i18n/messages/ar.json'
import { DOCS_CONTENT, getDocsContent, plainText } from '@/app/dashboard/docs/content'
import { CONNECTOR_REGISTRY } from '@/lib/connectors/registry'
import { createTranslator } from 'next-intl'

const EN = DOCS_CONTENT.en
const AR = DOCS_CONTENT.ar

/**
 * Structural "shape" of a value: object keys (sorted) and array lengths,
 * recursively, with every string collapsed to a marker. Two locales with the
 * same shape have the same sections, the same fields and the same number of
 * list items.
 */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])])
    )
  }
  return typeof value
}

/** Every string leaf, for content-quality checks. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

const ARABIC = /[؀-ۿ]/

describe('docs content: EN/AR parity', () => {
  it('has an identical overall shape (keys and array lengths)', () => {
    expect(shape(AR)).toEqual(shape(EN))
  })

  it('has the same guide section ids, in order, with matching list lengths', () => {
    expect(AR.guide.map((s) => s.id)).toEqual(EN.guide.map((s) => s.id))
    EN.guide.forEach((s, i) => {
      expect(AR.guide[i].features.length, `${s.id}.features`).toBe(s.features.length)
      expect(AR.guide[i].actions.length, `${s.id}.actions`).toBe(s.actions.length)
    })
  })

  it('guide section ids are unique', () => {
    const ids = EN.guide.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps locale-invariant guide fields identical', () => {
    expect(AR.guide.map((s) => s.path)).toEqual(EN.guide.map((s) => s.path))
  })

  it('has the same API groups and identical method/path/role per endpoint', () => {
    expect(AR.api.map((g) => g.id)).toEqual(EN.api.map((g) => g.id))
    const invariant = (c: typeof EN) =>
      c.api.map((g) => g.endpoints.map((e) => ({ method: e.method, path: e.path, role: e.role })))
    expect(invariant(AR)).toEqual(invariant(EN))
  })

  it('has the same compliance frameworks and identical control ids/links', () => {
    const invariant = (c: typeof EN) =>
      c.compliance.map((fw) => ({
        id: fw.id,
        acronym: fw.acronym,
        rows: fw.rows.map((r) => ({ controlId: r.controlId, link: r.link })),
      }))
    expect(invariant(AR)).toEqual(invariant(EN))
  })

  it('has the same connector guides with matching list lengths and optional notes', () => {
    expect(Object.keys(AR.connectors).sort()).toEqual(Object.keys(EN.connectors).sort())
    for (const type of Object.keys(EN.connectors) as (keyof typeof EN.connectors)[]) {
      const e = EN.connectors[type]
      const a = AR.connectors[type]
      expect(a.prerequisites.length, `${type}.prerequisites`).toBe(e.prerequisites.length)
      expect(a.setupSteps.length, `${type}.setupSteps`).toBe(e.setupSteps.length)
      expect(a.dataPulled.length, `${type}.dataPulled`).toBe(e.dataPulled.length)
      expect(a.troubleshooting.length, `${type}.troubleshooting`).toBe(e.troubleshooting.length)
      expect(a.notes === undefined, `${type}.notes`).toBe(e.notes === undefined)
    }
  })
})

describe('docs content: connectors stay in sync with the registry', () => {
  it('documents every registered connector in every locale', () => {
    for (const locale of ['en', 'ar'] as const) {
      for (const c of CONNECTOR_REGISTRY) {
        expect(DOCS_CONTENT[locale].connectors[c.type], `${locale}:${c.type}`).toBeDefined()
      }
    }
  })

  it('English label and description match the registry', () => {
    for (const c of CONNECTOR_REGISTRY) {
      expect(EN.connectors[c.type].label).toBe(c.label)
      expect(EN.connectors[c.type].description).toBe(c.description)
    }
  })
})

describe('docs content: translation quality guards', () => {
  it('every Arabic prose field contains Arabic text', () => {
    const prose = [
      ...AR.guide.flatMap((s) => [s.title, s.description, ...s.features, ...s.actions]),
      ...AR.api.flatMap((g) => [g.title, ...g.endpoints.map((e) => e.description)]),
      ...AR.compliance.flatMap((fw) => [fw.name, ...fw.rows.flatMap((r) => [r.controlName, r.feature])]),
      ...Object.values(AR.connectors).flatMap((c) => [
        c.description,
        c.syncFrequency,
        ...c.troubleshooting,
        ...c.dataPulled,
      ]),
    ]
    const untranslated = prose.filter((s) => !ARABIC.test(plainText(s)))
    expect(untranslated).toEqual([])
  })

  it('backtick code markup is balanced', () => {
    for (const locale of ['en', 'ar'] as const) {
      const unbalanced = strings(DOCS_CONTENT[locale]).filter((s) => (s.match(/`/g) ?? []).length % 2 !== 0)
      expect(unbalanced, locale).toEqual([])
    }
  })

  it('Arabic navigation chains use the RTL arrow', () => {
    expect(strings(AR).filter((s) => s.includes('→'))).toEqual([])
  })

  it('falls back to English for unknown locales', () => {
    expect(getDocsContent('fr')).toBe(EN)
    expect(getDocsContent('ar')).toBe(AR)
  })
})

describe('docs UI chrome messages', () => {
  it('docs namespace has the same keys in EN and AR', () => {
    expect(shape(ar.docs)).toEqual(shape(en.docs))
  })

  it('plural count messages format correctly in both locales', () => {
    const tEn = createTranslator({ locale: 'en', messages: en, namespace: 'docs' })
    const tAr = createTranslator({ locale: 'ar', messages: ar, namespace: 'docs' })
    expect(tEn('api.endpointCount', { count: 1 })).toBe('1 endpoint')
    expect(tEn('api.endpointCount', { count: 3 })).toBe('3 endpoints')
    expect(tAr('api.endpointCount', { count: 1 })).toBe('نقطة نهاية واحدة')
    expect(tAr('connectors.connectorCount', { count: 2 })).toBe('موصلان')
    expect(tAr('compliance.controlCount', { count: 10 })).toMatch(/ضوابط$/)
  })

  it('has a label for every connector category and API role in use', () => {
    for (const msgs of [en, ar]) {
      for (const c of CONNECTOR_REGISTRY) {
        expect(msgs.docs.categories[c.category]).toBeTruthy()
      }
      for (const g of EN.api) {
        for (const e of g.endpoints) {
          expect(msgs.docs.roles[e.role]).toBeTruthy()
        }
      }
    }
  })
})
