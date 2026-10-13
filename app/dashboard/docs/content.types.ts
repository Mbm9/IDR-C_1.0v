/**
 * Shared types for the in-app documentation content.
 *
 * Long-form documentation lives in typed, per-locale data modules
 * (content.en.ts / content.ar.ts) that MUST keep an identical structure.
 * tests/unit/docs-content.test.ts enforces this so the translations
 * cannot drift apart.
 *
 * Inline markup: any text wrapped in backticks (`like this`) is rendered as
 * an LTR-isolated <code> span (see rich-text.tsx). Use it for paths,
 * commands, attribute/parameter names and other technical tokens that must
 * keep left-to-right order inside Arabic prose.
 *
 * Locale-invariant fields (ids, paths, HTTP methods, roles, control IDs,
 * links, framework acronyms) must be identical in every locale; only the
 * human-readable fields are translated.
 */
import type { ConnectorType } from '@/lib/connectors/base'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** Role required to call an endpoint. Labels live in messages (docs.roles.*). */
export type DocsRole = 'public' | 'viewer' | 'analyst' | 'iam_admin' | 'ciso' | 'admin'

export interface GuideSection {
  /** Stable, locale-invariant identifier. */
  id: string
  title: string
  /** Dashboard route (locale-invariant). */
  path: string
  description: string
  features: string[]
  actions: string[]
}

export interface ApiEndpoint {
  method: HttpMethod
  path: string
  description: string
  role: DocsRole
  note: string
}

export interface ApiGroup {
  id: string
  title: string
  endpoints: ApiEndpoint[]
}

export interface ComplianceRow {
  controlId: string
  controlName: string
  feature: string
  link: string
}

export interface ComplianceFramework {
  id: string
  /** Framework acronym, never translated (e.g. "NCA ECC"). */
  acronym: string
  /** Full, translated framework name. */
  name: string
  rows: ComplianceRow[]
}

export interface ConnectorGuide {
  /** Display label (brand names stay as-is). */
  label: string
  description: string
  prerequisites: string[]
  setupSteps: string[]
  dataPulled: string[]
  syncFrequency: string
  troubleshooting: string[]
  notes?: string
}

export interface DocsContent {
  guide: GuideSection[]
  api: ApiGroup[]
  compliance: ComplianceFramework[]
  connectors: Record<ConnectorType, ConnectorGuide>
}
