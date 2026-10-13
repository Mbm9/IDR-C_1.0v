import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { identities, policyViolations, exposureFindings } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { VIOLATION_IMPACT, type PostureViolationType } from '@/lib/itdr/posture-checks'
import { getIssueOverlay, getLocalizedIssueDef, impactLabel, issueLocaleFromRequest } from '@/lib/issues/localize'

/**
 * GET /api/exposures
 *
 * Unified AD exposure view: identity posture findings (policy_violations) + certificate/GPO/secret
 * findings (exposure_findings), grouped into attack-vector "impact" categories — fsProtect Impacts.
 *
 * Query: ?category=identity|certificate|gpo|secret  (optional filter)
 *        ?locale=en|ar  (optional; defaults to the `locale` cookie) — language of `title`,
 *        `typeLabel` and impact `label`. English titles are unchanged.
 */
const POSTURE_TYPES = Object.keys(VIOLATION_IMPACT) as PostureViolationType[]
const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1 }
type Impact = 'credential_theft' | 'privilege_escalation' | 'lateral_movement' | 'persistence'

interface UnifiedFinding {
  id: string
  category: 'identity' | 'certificate' | 'gpo' | 'secret'
  type: string
  title: string
  /** Catalog name of the finding type in the reader's locale. */
  typeLabel: string
  subjectName: string
  identityId: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  impact: Impact
  detectedAt: string
}

export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const categoryFilter = req.nextUrl.searchParams.get('category')
  const locale = issueLocaleFromRequest(req)
  const typeLabel = (type: string) => getLocalizedIssueDef(type, locale).name
  // Arabic: the stored/derived titles are English, so rebuild them from the localized catalog
  // name when the finding type has a translation; otherwise keep the original title.
  const localTitle = (type: string, subjectName: string, englishTitle: string) =>
    locale !== 'en' && getIssueOverlay(type, locale) ? `${subjectName}: ${typeLabel(type)}` : englishTitle

  const [identityRows, genericRows] = await Promise.all([
    db.select({
      id: policyViolations.id,
      identityId: policyViolations.identityId,
      subjectName: identities.displayName,
      type: policyViolations.violationType,
      severity: policyViolations.severity,
      detectedAt: policyViolations.detectedAt,
    })
      .from(policyViolations)
      .innerJoin(identities, eq(policyViolations.identityId, identities.id))
      .where(and(
        eq(policyViolations.orgId, orgId),
        eq(policyViolations.status, 'open'),
        inArray(policyViolations.violationType, POSTURE_TYPES),
      ))
      .orderBy(desc(policyViolations.detectedAt)),

    db.select({
      id: exposureFindings.id,
      category: exposureFindings.category,
      type: exposureFindings.findingType,
      title: exposureFindings.title,
      subjectName: exposureFindings.subjectName,
      severity: exposureFindings.severity,
      impact: exposureFindings.impact,
      detectedAt: exposureFindings.detectedAt,
    })
      .from(exposureFindings)
      .where(and(eq(exposureFindings.orgId, orgId), eq(exposureFindings.status, 'open')))
      .orderBy(desc(exposureFindings.detectedAt)),
  ])

  let findings: UnifiedFinding[] = [
    ...identityRows.map((r): UnifiedFinding => ({
      id: r.id,
      category: 'identity',
      type: r.type,
      title: localTitle(r.type, r.subjectName, `${r.subjectName}: ${r.type.replace(/_/g, ' ')}`),
      typeLabel: typeLabel(r.type),
      subjectName: r.subjectName,
      identityId: r.identityId,
      severity: r.severity,
      impact: VIOLATION_IMPACT[r.type as PostureViolationType],
      detectedAt: r.detectedAt.toISOString(),
    })),
    ...genericRows.map((r): UnifiedFinding => ({
      id: r.id,
      category: r.category as UnifiedFinding['category'],
      type: r.type,
      title: localTitle(r.type, r.subjectName, r.title),
      typeLabel: typeLabel(r.type),
      subjectName: r.subjectName,
      identityId: null,
      severity: r.severity,
      impact: r.impact as Impact,
      detectedAt: r.detectedAt.toISOString(),
    })),
  ]

  // Category breakdown across ALL findings (before any filter).
  const byCategory = { identity: 0, certificate: 0, gpo: 0, secret: 0 }
  for (const f of findings) byCategory[f.category]++

  if (categoryFilter && categoryFilter in byCategory) {
    findings = findings.filter((f) => f.category === categoryFilter)
  }

  const emptySeverity = () => ({ critical: 0, high: 0, medium: 0, low: 0 })
  const bySeverity = emptySeverity()
  const impactMap = new Map<Impact, { category: Impact; label: string; count: number; bySeverity: ReturnType<typeof emptySeverity>; findings: UnifiedFinding[] }>()

  for (const f of findings) {
    bySeverity[f.severity]++
    if (!impactMap.has(f.impact)) impactMap.set(f.impact, { category: f.impact, label: impactLabel(f.impact, locale), count: 0, bySeverity: emptySeverity(), findings: [] })
    const g = impactMap.get(f.impact)!
    g.count++
    g.bySeverity[f.severity]++
    g.findings.push(f)
  }

  const weighted = findings.reduce((s, f) => s + (SEVERITY_WEIGHT[f.severity] ?? 0), 0)
  const exposureScore = Math.min(100, weighted)
  const impacts = Array.from(impactMap.values()).sort((a, b) => b.count - a.count)

  log.info('AD exposures assessed', { totalOpen: findings.length, exposureScore, byCategory })

  return NextResponse.json({
    exposureScore,
    totalOpen: findings.length,
    bySeverity,
    byCategory,
    impacts,
    assessedAt: new Date().toISOString(),
  })
})
