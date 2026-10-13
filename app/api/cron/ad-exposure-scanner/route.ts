import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  identities, policyViolations, policies, organizations,
  exposureFindings, postureSnapshots,
  adcsAuthorities, adcsTemplates, gpoObjects, gpoLinks, gpoBaselines,
} from '@/lib/db/schema'
import { eq, and, inArray, isNotNull } from 'drizzle-orm'
import {
  runPostureChecks, VIOLATION_IMPACT,
  type PostureIdentity, type PostureViolationType,
} from '@/lib/itdr/posture-checks'
import { runAdcsChecks } from '@/lib/itdr/adcs-checks'
import { runGpoAudit, type GpoInput } from '@/lib/itdr/gpo-audit'
import { runSecretScan, type FileArtifact } from '@/lib/itdr/secret-scan'
import type { RawFinding } from '@/lib/itdr/exposure-types'
import { recordIssueEvents } from '@/lib/issues/aggregate'
import { verifyCronSecret } from '@/lib/auth/cron'

const POSTURE_TYPES = Object.keys(VIOLATION_IMPACT) as PostureViolationType[]
const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1 }

async function ensurePosturePolicy(orgId: string): Promise<string> {
  const [existing] = await db
    .select({ id: policies.id })
    .from(policies)
    .where(and(eq(policies.orgId, orgId), eq(policies.name, 'AD Security Posture')))
    .limit(1)
  if (existing) return existing.id
  const [created] = await db
    .insert(policies)
    .values({
      name: 'AD Security Posture',
      type: 'access_policy',
      definition: { kind: 'ad_posture', source: 'ad-exposure-scanner' },
      severity: 'high',
      orgId,
    })
    .returning({ id: policies.id })
  return created.id
}

// ── Identity posture (→ policy_violations) ──
async function scanIdentityPosture(orgId: string): Promise<number> {
  const rows = await db
    .select({
      id: identities.id, displayName: identities.displayName, adTier: identities.adTier,
      subType: identities.subType, status: identities.status,
      passwordLastSetAt: identities.passwordLastSetAt, adSecurity: identities.adSecurity,
    })
    .from(identities)
    .where(and(eq(identities.orgId, orgId), isNotNull(identities.adSecurity)))

  const postureIdentities: PostureIdentity[] = rows.map((r) => ({
    id: r.id, displayName: r.displayName, adTier: r.adTier, subType: r.subType,
    status: r.status, passwordLastSetAt: r.passwordLastSetAt,
    adSecurity: r.adSecurity as PostureIdentity['adSecurity'],
  }))
  const findings = runPostureChecks(postureIdentities)
  const policyId = await ensurePosturePolicy(orgId)

  await db.delete(policyViolations).where(and(
    eq(policyViolations.orgId, orgId),
    eq(policyViolations.status, 'open'),
    inArray(policyViolations.violationType, POSTURE_TYPES),
  ))
  if (findings.length === 0) return 0

  const handled = await db
    .select({ identityId: policyViolations.identityId, violationType: policyViolations.violationType })
    .from(policyViolations)
    .where(and(
      eq(policyViolations.orgId, orgId),
      inArray(policyViolations.violationType, POSTURE_TYPES),
      inArray(policyViolations.status, ['acknowledged', 'excepted']),
    ))
  const handledKeys = new Set(handled.map((h) => `${h.identityId}:${h.violationType}`))
  const toInsert = findings
    .filter((f) => !handledKeys.has(`${f.identityId}:${f.violationType}`))
    .map((f) => ({
      policyId, identityId: f.identityId, violationType: f.violationType,
      severity: f.severity, status: 'open' as const, orgId,
    }))
  if (toInsert.length > 0) await db.insert(policyViolations).values(toInsert)
  return toInsert.length
}

// ── Certificate / GPO / Secret exposures (→ exposure_findings) ──
async function scanGenericExposures(orgId: string): Promise<number> {
  const findings: RawFinding[] = []

  // ADCS / ESC
  const [cas, templates] = await Promise.all([
    db.select().from(adcsAuthorities).where(eq(adcsAuthorities.orgId, orgId)),
    db.select().from(adcsTemplates).where(eq(adcsTemplates.orgId, orgId)),
  ])
  findings.push(...runAdcsChecks(
    cas.map((c) => ({
      name: c.name, dnsName: c.dnsName,
      editfAttributeSubjectAltName2: c.editfAttributeSubjectAltName2,
      webEnrollmentHttp: c.webEnrollmentHttp,
      enrollmentAgentRestrictionsEnabled: c.enrollmentAgentRestrictionsEnabled,
    })),
    templates.map((t) => ({
      name: t.name, displayName: t.displayName, published: t.published,
      enrolleeSuppliesSubject: t.enrolleeSuppliesSubject,
      requiresManagerApproval: t.requiresManagerApproval,
      authorizedSignaturesRequired: t.authorizedSignaturesRequired,
      ekus: (t.ekus ?? []) as string[],
      enrollmentLowPriv: t.enrollmentLowPriv,
      aclWritableByLowPriv: t.aclWritableByLowPriv,
    })),
  ))

  // GPO audit (RSoP, baseline drift, dangerous settings)
  const [gpos, links, baselines] = await Promise.all([
    db.select().from(gpoObjects).where(eq(gpoObjects.orgId, orgId)),
    db.select().from(gpoLinks).where(eq(gpoLinks.orgId, orgId)),
    db.select().from(gpoBaselines).where(eq(gpoBaselines.orgId, orgId)),
  ])
  const gpoInputs: GpoInput[] = gpos.map((g) => ({
    id: g.id, name: g.name, adTier: g.adTier,
    settings: (g.settings ?? null) as Record<string, string> | null,
  }))
  findings.push(...runGpoAudit(
    gpoInputs,
    links.map((l) => ({
      gpoId: l.gpoId, linkedOu: l.linkedOu, linkOrder: l.linkOrder,
      enforced: l.enforced, linkEnabled: l.linkEnabled, adTierOfOu: l.adTierOfOu,
    })),
    baselines.map((b) => ({
      name: b.name, scope: b.scope, adTier: b.adTier,
      settings: (b.settings ?? {}) as Record<string, string>,
    })),
  ))

  // Secret sprawl — scan GPO settings (SYSVOL/GPP) for embedded credentials.
  const artifacts: FileArtifact[] = gpoInputs
    .filter((g) => g.settings)
    .map((g) => ({
      path: `\\\\SYSVOL\\Policies\\${g.name}\\Preferences`,
      share: 'SYSVOL',
      content: Object.entries(g.settings!).map(([k, v]) => `${k} = "${v}"`).join('\n'),
    }))
  findings.push(...runSecretScan(artifacts))

  // Persist: clear open, preserve acknowledged/excepted, re-insert.
  await db.delete(exposureFindings).where(and(
    eq(exposureFindings.orgId, orgId),
    eq(exposureFindings.status, 'open'),
  ))
  const handled = await db
    .select({ findingType: exposureFindings.findingType, subjectName: exposureFindings.subjectName })
    .from(exposureFindings)
    .where(and(eq(exposureFindings.orgId, orgId), inArray(exposureFindings.status, ['acknowledged', 'excepted'])))
  const handledKeys = new Set(handled.map((h) => `${h.findingType}:${h.subjectName}`))

  const toInsert = findings
    .filter((f) => !handledKeys.has(`${f.findingType}:${f.subjectName}`))
    .map((f) => ({
      category: f.category, findingType: f.findingType, title: f.title,
      severity: f.severity, impact: f.impact, subjectName: f.subjectName,
      subjectRef: f.subjectRef ?? null, evidence: f.evidence as any,
      status: 'open' as const, orgId,
    }))
  if (toInsert.length > 0) await db.insert(exposureFindings).values(toInsert)
  return toInsert.length
}

// ── Trend snapshot — aggregate all open exposures (identity + generic) ──
async function captureSnapshot(orgId: string): Promise<void> {
  const [identityRows, genericRows] = await Promise.all([
    db.select({ severity: policyViolations.severity, violationType: policyViolations.violationType })
      .from(policyViolations)
      .where(and(
        eq(policyViolations.orgId, orgId),
        eq(policyViolations.status, 'open'),
        inArray(policyViolations.violationType, POSTURE_TYPES),
      )),
    db.select({ severity: exposureFindings.severity, category: exposureFindings.category, impact: exposureFindings.impact })
      .from(exposureFindings)
      .where(and(eq(exposureFindings.orgId, orgId), eq(exposureFindings.status, 'open'))),
  ])

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
  const byCategory = { identity: 0, certificate: 0, gpo: 0, secret: 0 }
  const byImpact = { credential_theft: 0, privilege_escalation: 0, lateral_movement: 0, persistence: 0 }
  let weighted = 0

  for (const r of identityRows) {
    bySeverity[r.severity as keyof typeof bySeverity]++
    byCategory.identity++
    byImpact[VIOLATION_IMPACT[r.violationType as PostureViolationType]]++
    weighted += SEVERITY_WEIGHT[r.severity] ?? 0
  }
  for (const r of genericRows) {
    bySeverity[r.severity as keyof typeof bySeverity]++
    byCategory[r.category as keyof typeof byCategory]++
    byImpact[r.impact as keyof typeof byImpact]++
    weighted += SEVERITY_WEIGHT[r.severity] ?? 0
  }

  const totalOpen = identityRows.length + genericRows.length
  await db.insert(postureSnapshots).values({
    orgId, exposureScore: Math.min(100, weighted), totalOpen,
    bySeverity, byCategory, byImpact,
  })
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let identityTotal = 0
    let genericTotal = 0

    for (const org of allOrgs) {
      identityTotal += await scanIdentityPosture(org.id)
      genericTotal += await scanGenericExposures(org.id)
      await captureSnapshot(org.id)
      await recordIssueEvents(org.id) // derive issue lifecycle/timeline events
    }

    return NextResponse.json({
      success: true,
      message: `AD exposure scan complete: ${identityTotal} identity + ${genericTotal} certificate/GPO/secret exposures across ${allOrgs.length} org(s)`,
      identityExposures: identityTotal,
      genericExposures: genericTotal,
    })
  } catch (error) {
    console.error('AD exposure scanner cron error:', error)
    return NextResponse.json(
      { success: false, message: 'AD exposure scanner failed', error: String(error) },
      { status: 500 },
    )
  }
}
