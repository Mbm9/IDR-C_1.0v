// Locale overlay for the issue catalog.
//
// The English catalog (./catalog) stays the source of truth for every non-text field. For the
// Arabic UI, `localizeIssue` returns a COPY of a catalog entry with name / description /
// mitigation text replaced from ./catalog.ar, falling back to English field-by-field (and
// step-by-step) wherever a translation is missing. Catalog objects are never mutated.

import {
  getIssueDef, fsidForType, GENERIC_ISSUE_TEXT,
  type IssueDef, type IssueCategory, type Severity,
} from './catalog'
import {
  ISSUE_CATALOG_AR, GENERIC_ISSUE_TEXT_AR, IMPACT_LABELS,
  type IssueTextOverlay,
} from './catalog.ar'

export type IssueLocale = 'en' | 'ar'

/** Coerce any cookie / query value to a supported locale (default English). */
export function normalizeIssueLocale(value: string | null | undefined): IssueLocale {
  return value === 'ar' ? 'ar' : 'en'
}

/** Minimal request shape (NextRequest satisfies it) so the helper stays unit-testable. */
interface LocaleSource {
  nextUrl?: { searchParams: { get(name: string): string | null } }
  cookies?: { get(name: string): { value: string } | undefined }
}

/** Locale for an API request: `?locale=` wins, then the `locale` cookie set by the UI. */
export function issueLocaleFromRequest(req: LocaleSource): IssueLocale {
  return normalizeIssueLocale(req.nextUrl?.searchParams.get('locale') ?? req.cookies?.get('locale')?.value)
}

const OVERLAYS: Record<IssueLocale, Map<string, Partial<IssueTextOverlay>>> = {
  en: new Map(),
  ar: new Map(Object.entries(ISSUE_CATALOG_AR).map(([type, o]) => [fsidForType(type), o])),
}

/** Translation overlay for a finding type (or FSID), if one exists. */
export function getIssueOverlay(typeOrFsid: string, locale: IssueLocale): Partial<IssueTextOverlay> | undefined {
  const map = OVERLAYS[locale]
  return map.get(typeOrFsid) ?? map.get(fsidForType(typeOrFsid))
}

/**
 * Return `def` with its human-readable text in `locale`. English returns the definition
 * unchanged. Missing translated fields (or individual steps) fall back to English.
 */
export function localizeIssue(def: IssueDef, locale: IssueLocale, overlay?: Partial<IssueTextOverlay>): IssueDef {
  if (locale === 'en') return def
  const o = overlay ?? getIssueOverlay(def.fsid, locale)

  if (!o) {
    // Uncatalogued finding type: only the generic placeholder text can be translated.
    if (locale !== 'ar') return def
    return {
      ...def,
      description: def.description === GENERIC_ISSUE_TEXT.description ? GENERIC_ISSUE_TEXT_AR.description : def.description,
      mitigation: {
        ...def.mitigation,
        summary: def.mitigation.summary === GENERIC_ISSUE_TEXT.summary ? GENERIC_ISSUE_TEXT_AR.summary : def.mitigation.summary,
      },
    }
  }

  const steps = o.mitigation?.steps
  return {
    ...def,
    name: o.name || def.name,
    description: o.description || def.description,
    mitigation: {
      ...def.mitigation, // keeps `script` (code is never translated)
      summary: o.mitigation?.summary || def.mitigation.summary,
      steps: def.mitigation.steps.map((s, i) => steps?.[i] || s),
    },
  }
}

/** Catalog entry for a finding type in the given locale (see getIssueDef for the fallback). */
export function getLocalizedIssueDef(
  type: string,
  locale: IssueLocale,
  fallback?: { severity?: Severity; category?: IssueCategory; impact?: string },
): IssueDef {
  return localizeIssue(getIssueDef(type, fallback), locale)
}

/** Display label for an attack-impact category, falling back to English, then the raw value. */
export function impactLabel(impact: string, locale: IssueLocale): string {
  return IMPACT_LABELS[locale][impact] ?? IMPACT_LABELS.en[impact] ?? impact
}
