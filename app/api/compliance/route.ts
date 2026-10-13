import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { identities, policyViolations, accounts, entitlements, actionLog } from '@/lib/db/schema'
import { eq, and, count, sql } from 'drizzle-orm'
import { COMPLIANCE_FRAMEWORKS, getFramework, type ComplianceControl } from '@/lib/compliance/frameworks'
import { complianceLocaleFromRequest, localizeFramework } from '@/lib/compliance/localize'

/**
 * GET /api/compliance
 *
 * Returns compliance posture across all frameworks (NCA ECC, SAMA CSF, PDPL).
 * For each control, calculates coverage status based on actual system data.
 *
 * Query params:
 *   ?framework=NCA_ECC  — filter to a specific framework
 *   ?locale=en|ar       — language of framework/control text (defaults to the `locale` cookie);
 *                         ids, keys and statuses are locale-neutral
 */
export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const frameworkKey = req.nextUrl.searchParams.get('framework')
  const locale = complianceLocaleFromRequest(req)

  // Gather system-wide metrics for compliance assessment
  const [
    violationsByType,
    totalIdentities,
    orphanedNhis,
    dormantCount,
    mfaStats,
    tierViolationCount,
    auditEntryCount,
    certOverdueCount,
  ] = await Promise.all([
    db.select({ type: policyViolations.violationType, count: count() })
      .from(policyViolations)
      .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))
      .groupBy(policyViolations.violationType),

    db.select({ count: count() }).from(identities).where(eq(identities.orgId, orgId)),

    db.select({ count: count() }).from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.type, 'non_human'),
        sql`${identities.ownerIdentityId} IS NULL`,
      )),

    db.select({ count: count() }).from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.status, 'active'),
        sql`${identities.lastLogonAt} < NOW() - INTERVAL '90 days'`,
      )),

    db.select({
      total: count(),
      withMfa: sql<number>`COUNT(*) FILTER (WHERE ${accounts.mfaEnabled} = true)`,
    }).from(accounts).where(eq(accounts.orgId, orgId)),

    db.select({ count: count() }).from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.tierViolation, true))),

    db.select({ count: count() }).from(actionLog).where(eq(actionLog.orgId, orgId)),

    db.select({ count: count() }).from(entitlements)
      .where(and(
        eq(entitlements.orgId, orgId),
        eq(entitlements.certifiable, true),
        eq(entitlements.certificationStatus, 'expired'),
      )),
  ])

  const violationMap = Object.fromEntries(
    violationsByType.map(v => [v.type, Number(v.count)])
  )

  const metrics = {
    totalIdentities: Number(totalIdentities[0]?.count ?? 0),
    orphanedNhis: Number(orphanedNhis[0]?.count ?? 0),
    dormantIdentities: Number(dormantCount[0]?.count ?? 0),
    mfaTotal: Number(mfaStats[0]?.total ?? 0),
    mfaEnabled: Number(mfaStats[0]?.withMfa ?? 0),
    tierViolations: Number(tierViolationCount[0]?.count ?? 0),
    auditEntries: Number(auditEntryCount[0]?.count ?? 0),
    certOverdue: Number(certOverdueCount[0]?.count ?? 0),
    violations: violationMap,
  }

  // Assess each control
  function assessControl(control: ComplianceControl): 'compliant' | 'partial' | 'non_compliant' | 'not_assessed' {
    if (control.assessmentMethod === 'manual') return 'not_assessed'

    // For automated controls, check related violations
    if (control.relatedViolations.length > 0) {
      const totalRelatedViolations = control.relatedViolations.reduce(
        (sum, vt) => sum + (violationMap[vt] || 0), 0
      )
      if (totalRelatedViolations === 0) return 'compliant'
      if (totalRelatedViolations <= 5) return 'partial'
      return 'non_compliant'
    }

    // For evidence-based controls, check if related features have data
    if (control.assessmentMethod === 'evidence') {
      if (metrics.auditEntries > 0) return 'compliant'
      return 'not_assessed'
    }

    return 'not_assessed'
  }

  const frameworks = frameworkKey
    ? [getFramework(frameworkKey)].filter(Boolean)
    : COMPLIANCE_FRAMEWORKS

  const results = frameworks.map(fw => {
    if (!fw) return null

    const localized = localizeFramework(fw, locale)
    const controlResults = localized.controls.map(control => ({
      ...control,
      status: assessControl(control),
      relatedViolationCounts: Object.fromEntries(
        control.relatedViolations.map(vt => [vt, violationMap[vt] || 0])
      ),
    }))

    const compliant = controlResults.filter(c => c.status === 'compliant').length
    const partial = controlResults.filter(c => c.status === 'partial').length
    const nonCompliant = controlResults.filter(c => c.status === 'non_compliant').length
    const notAssessed = controlResults.filter(c => c.status === 'not_assessed').length
    const total = controlResults.length
    const score = total > 0 ? Math.round(((compliant + partial * 0.5) / total) * 100) : 0

    return {
      key: fw.key,
      name: localized.name,
      fullName: localized.fullName,
      version: fw.version,
      score,
      summary: { compliant, partial, nonCompliant, notAssessed, total },
      controls: controlResults,
    }
  }).filter(Boolean)

  log.info('Compliance posture assessed', {
    frameworks: results.map(r => ({ key: r!.key, score: r!.score })),
  })

  return NextResponse.json({
    metrics,
    frameworks: results,
    assessedAt: new Date().toISOString(),
  })
})
