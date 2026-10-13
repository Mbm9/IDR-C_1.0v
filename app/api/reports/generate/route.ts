import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { actionLog, identities, users, policyViolations, policies, organizations } from '@/lib/db/schema'
import { eq, and, desc, count, gte, lte, sql, SQL } from 'drizzle-orm'
import ReactPDF from '@react-pdf/renderer'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/actions/helpers'
import { tierRank } from '@/lib/utils/tiers'
import {
  AuditTrailDocument,
  RiskSummaryDocument,
  ComplianceDocument,
} from '@/lib/reports/pdf-templates'

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be a date')
const reportRequestSchema = z.object({
  // compliance_<framework> (e.g. compliance_ncaecc from the compliance page, compliance_nca from the export button)
  type: z.union([z.enum(['audit_trail', 'risk_summary']), z.string().regex(/^compliance_[a-z]{2,20}$/)]),
  dateRange: z.object({ from: isoDate, to: isoDate }).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const body = await parseJsonBody(req, reportRequestSchema)
  if (!body.ok) return body.response
  const { type, dateRange } = body.data

  // Fetch org name
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId))
  const orgName = org?.name || 'Organization'

  const from = dateRange?.from ? new Date(dateRange.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const to = dateRange?.to ? new Date(dateRange.to) : new Date()

  let pdfBuffer: any

  try {
    if (type === 'audit_trail') {
      const entries = await db
        .select({
          id: actionLog.id,
          actionType: actionLog.actionType,
          rationale: actionLog.rationale,
          source: actionLog.source,
          createdAt: actionLog.createdAt,
          actorName: sql<string | null>`coalesce(${identities.displayName}, ${users.name}, ${users.email})`,
        })
        .from(actionLog)
        .leftJoin(identities, eq(actionLog.actorIdentityId, identities.id))
        .leftJoin(users, eq(actionLog.actorIdentityId, users.id))
        .where(
          and(
            eq(actionLog.orgId, orgId),
            gte(actionLog.createdAt, from),
            lte(actionLog.createdAt, to),
          )
        )
        .orderBy(desc(actionLog.createdAt))
        .limit(500)

      pdfBuffer = await ReactPDF.renderToBuffer(
        AuditTrailDocument({
          orgName,
          dateFrom: from.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          dateTo: to.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          entries: entries.map(e => ({
            timestamp: e.createdAt ? new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
            actor: e.actorName || 'System',
            actionType: e.actionType.replace(/_/g, ' '),
            rationale: e.rationale || '-',
            source: e.source,
          })),
          totalActions: entries.length,
        })
      )

    } else if (type === 'risk_summary') {
      // Gather risk summary data
      const [
        identityByTier,
        topRisky,
        violationBySeverity,
        violationByType,
        tierViolationCount,
      ] = await Promise.all([
        db
          .select({ tier: identities.adTier, count: count() })
          .from(identities)
          .where(eq(identities.orgId, orgId))
          .groupBy(identities.adTier),

        db
          .select({
            displayName: identities.displayName,
            type: identities.type,
            adTier: identities.adTier,
            riskScore: identities.riskScore,
          })
          .from(identities)
          .where(eq(identities.orgId, orgId))
          .orderBy(desc(identities.riskScore))
          .limit(10),

        db
          .select({ severity: policyViolations.severity, count: count() })
          .from(policyViolations)
          .where(eq(policyViolations.orgId, orgId))
          .groupBy(policyViolations.severity),

        db
          .select({ type: policyViolations.violationType, count: count() })
          .from(policyViolations)
          .where(eq(policyViolations.orgId, orgId))
          .groupBy(policyViolations.violationType),

        db
          .select({ count: count() })
          .from(identities)
          .where(and(eq(identities.orgId, orgId), eq(identities.tierViolation, true))),
      ])

      const avgRisk = topRisky.length > 0
        ? Math.round(topRisky.reduce((s, i) => s + i.riskScore, 0) / topRisky.length)
        : 0

      pdfBuffer = await ReactPDF.renderToBuffer(
        RiskSummaryDocument({
          orgName,
          generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          overallRiskScore: avgRisk,
          identityByTier: Object.fromEntries([...identityByTier].sort((a, b) => tierRank(a.tier) - tierRank(b.tier)).map(t => [t.tier, Number(t.count)])),
          topRiskyIdentities: topRisky.map(i => ({
            name: i.displayName,
            type: i.type,
            tier: i.adTier,
            riskScore: i.riskScore,
          })),
          violationBySeverity: Object.fromEntries(violationBySeverity.map(v => [v.severity, Number(v.count)])),
          violationByType: Object.fromEntries(violationByType.map(v => [v.type, Number(v.count)])),
          tierViolationCount: Number(tierViolationCount[0]?.count ?? 0),
        })
      )

    } else if (type.startsWith('compliance_')) {
      const framework = type.replace('compliance_', '').toUpperCase()
      const frameworkNames: Record<string, string> = {
        NCA: 'NCA Essential Cybersecurity Controls (ECC)',
        SAMA: 'SAMA Cyber Security Framework (CSF)',
        PDPL: 'Personal Data Protection Law (PDPL)',
      }

      // Violation stats for compliance gaps
      const [violationStats, totalIdentities, totalViolations] = await Promise.all([
        db
          .select({ type: policyViolations.violationType, severity: policyViolations.severity, count: count() })
          .from(policyViolations)
          .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))
          .groupBy(policyViolations.violationType, policyViolations.severity),

        db.select({ count: count() }).from(identities).where(eq(identities.orgId, orgId)),

        db.select({ count: count() }).from(policyViolations).where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open'))),
      ])

      // Audit evidence count
      const [auditCount] = await db
        .select({ count: count() })
        .from(actionLog)
        .where(and(
          eq(actionLog.orgId, orgId),
          gte(actionLog.createdAt, from),
          lte(actionLog.createdAt, to),
        ))

      pdfBuffer = await ReactPDF.renderToBuffer(
        ComplianceDocument({
          orgName,
          frameworkName: frameworkNames[framework] || framework,
          frameworkKey: framework,
          generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          dateFrom: from.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          dateTo: to.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          totalIdentities: Number(totalIdentities[0]?.count ?? 0),
          openViolations: Number(totalViolations[0]?.count ?? 0),
          violationStats: violationStats.map(v => ({
            type: v.type.replace(/_/g, ' '),
            severity: v.severity,
            count: Number(v.count),
          })),
          auditEntries: Number(auditCount?.count ?? 0),
        })
      )

    } else {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="identity-radar-${type}-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[Reports] PDF generation failed:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
