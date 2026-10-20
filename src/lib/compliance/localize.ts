// Locale overlay for the compliance framework mappings.
//
// ./frameworks stays the source of truth; for Arabic, `localizeFramework` / `localizeControl`
// return COPIES with fullName / description / control name / description / category / coveredBy
// replaced from ./frameworks.ar, falling back to English per field (and per feature name).

import type { ComplianceControl, ComplianceFramework } from './frameworks'
import { FRAMEWORKS_AR, CONTROLS_AR, CATEGORIES_AR, FEATURES_AR } from './frameworks.ar'

export type ComplianceLocale = 'en' | 'ar'

export function normalizeComplianceLocale(value: string | null | undefined): ComplianceLocale {
  return value === 'ar' ? 'ar' : 'en'
}

/** Minimal request shape (NextRequest satisfies it). `?locale=` wins over the `locale` cookie. */
export function complianceLocaleFromRequest(req: {
  nextUrl?: { searchParams: { get(name: string): string | null } }
  cookies?: { get(name: string): { value: string } | undefined }
}): ComplianceLocale {
  return normalizeComplianceLocale(req.nextUrl?.searchParams.get('locale') ?? req.cookies?.get('locale')?.value)
}

/** Control with localized text; English returns the same object. Ids and enums are untouched. */
export function localizeControl<C extends ComplianceControl>(control: C, locale: ComplianceLocale): C {
  if (locale === 'en') return control
  const o = CONTROLS_AR[control.id]
  return {
    ...control,
    name: o?.name || control.name,
    description: o?.description || control.description,
    category: CATEGORIES_AR[control.category] || control.category,
    coveredBy: control.coveredBy.map((f) => FEATURES_AR[f] || f),
  }
}

/** Framework (including its controls) with localized text; English returns the same object. */
export function localizeFramework(fw: ComplianceFramework, locale: ComplianceLocale): ComplianceFramework {
  if (locale === 'en') return fw
  const o = FRAMEWORKS_AR[fw.key]
  return {
    ...fw,
    fullName: o?.fullName || fw.fullName,
    description: o?.description || fw.description,
    controls: fw.controls.map((c) => localizeControl(c, locale)),
  }
}
