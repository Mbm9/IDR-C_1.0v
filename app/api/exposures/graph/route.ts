import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { identities, policyViolations, exposureFindings } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { VIOLATION_IMPACT, type PostureViolationType } from '@/lib/itdr/posture-checks'
import { impactLabel, issueLocaleFromRequest } from '@/lib/issues/localize'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/exposures/graph
 *
 * Relationship graph of AD exposures: each affected subject (identity / certificate template /
 * GPO / secret) links to the attack-impact hub(s) it enables. Powers the Exposures graph view.
 * Impact hub labels follow the reader's locale (`?locale=` or the `locale` cookie).
 */
const POSTURE_TYPES = Object.keys(VIOLATION_IMPACT) as PostureViolationType[]
type Sev = 'critical' | 'high' | 'medium' | 'low'
const SEV_RANK: Record<Sev, number> = { critical: 4, high: 3, medium: 2, low: 1 }
const SEV_RISK: Record<Sev, number> = { critical: 95, high: 70, medium: 45, low: 22 }

interface GNode {
  id: string; label: string; group: string; tier?: string; riskScore?: number
  severity?: Sev; badge?: string | number; meta?: Record<string, any>
}
interface GLink { source: string; target: string; type?: string; dangerous?: boolean }

export const GET = withApiHandler(async (req: NextRequest, { orgId }) => {
  const locale = issueLocaleFromRequest(req)
  const [identityRows, genericRows] = await Promise.all([
    db.select({
      subjectName: identities.displayName, identityId: identities.id, tier: identities.adTier,
      type: policyViolations.violationType, severity: policyViolations.severity,
    })
      .from(policyViolations)
      .innerJoin(identities, eq(policyViolations.identityId, identities.id))
      .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open'), inArray(policyViolations.violationType, POSTURE_TYPES)))
      .orderBy(desc(policyViolations.detectedAt)),
    db.select({
      subjectName: exposureFindings.subjectName, category: exposureFindings.category,
      type: exposureFindings.findingType, severity: exposureFindings.severity, impact: exposureFindings.impact,
    })
      .from(exposureFindings)
      .where(and(eq(exposureFindings.orgId, orgId), eq(exposureFindings.status, 'open'))),
  ])

  const subjectMap = new Map<string, GNode & { _findings: number }>()
  const impactCount = new Map<string, number>()
  const linkSet = new Set<string>()
  const links: GLink[] = []

  const addSubject = (id: string, node: GNode) => {
    const ex = subjectMap.get(id)
    if (!ex) { subjectMap.set(id, { ...node, _findings: 1 }); return }
    ex._findings++
    if (SEV_RANK[node.severity as Sev] > SEV_RANK[ex.severity as Sev]) {
      ex.severity = node.severity; ex.riskScore = node.riskScore
    }
  }
  const addLink = (subjId: string, impact: string, dangerous: boolean) => {
    const key = `${subjId}|${impact}`
    if (linkSet.has(key)) return
    linkSet.add(key)
    links.push({ source: subjId, target: `impact:${impact}`, dangerous })
    impactCount.set(impact, (impactCount.get(impact) ?? 0) + 1)
  }

  for (const r of identityRows) {
    const id = `subj:identity:${r.identityId}`
    const sev = r.severity as Sev
    const impact = VIOLATION_IMPACT[r.type as PostureViolationType]
    addSubject(id, { id, label: r.subjectName, group: 'identity', tier: r.tier ?? undefined, severity: sev, riskScore: SEV_RISK[sev], meta: { identityId: r.identityId } })
    addLink(id, impact, sev === 'critical' || sev === 'high')
  }
  for (const r of genericRows) {
    const id = `subj:${r.category}:${r.subjectName}`
    const sev = r.severity as Sev
    const impact = r.impact
    addSubject(id, { id, label: r.subjectName, group: r.category, severity: sev, riskScore: SEV_RISK[sev], meta: { type: r.type } })
    addLink(id, impact, sev === 'critical' || sev === 'high')
  }

  const nodes: GNode[] = []
  // impact hubs
  for (const [impact, count] of impactCount) {
    nodes.push({ id: `impact:${impact}`, label: impactLabel(impact, locale), group: 'impact', badge: count, riskScore: 100, meta: { findings: count } })
  }
  // subjects
  for (const s of subjectMap.values()) {
    const { _findings, ...node } = s
    nodes.push({ ...node, badge: _findings > 1 ? _findings : undefined })
  }

  return NextResponse.json({ nodes, links })
})
