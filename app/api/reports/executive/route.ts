import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, policyViolations, actionLog, identityThreats, integrationSources } from '@/lib/db/schema'
import { eq, and, count, desc, gte, sql } from 'drizzle-orm'
import { EXECUTIVE_REPORT_PROMPT } from '@/lib/ai/prompts'
import { generateJSON, aiMeta } from '@/lib/ai/client'

/**
 * HTML-escape untrusted strings before interpolating into the report markup.
 * The AI narrative is derived from identity data (display names etc.), so an
 * attacker-controlled AD attribute could otherwise inject script (stored XSS)
 * when the report HTML is rendered via dangerouslySetInnerHTML on the client.
 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const params = req.nextUrl.searchParams
  const days = Math.min(90, Math.max(7, parseInt(params.get('days') || '30')))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  try {
    const [
      totalIdentitiesResult,
      openViolationsResult,
      violationsInPeriodResult,
      remediatedInPeriodResult,
      activeThreatsResult,
      recentActionsResult,
      integrationHealthResult,
      riskDistributionResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(identities).where(eq(identities.orgId, orgId)),
      db.select({ count: count() }).from(policyViolations).where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open'))),
      db.select({ count: count() }).from(policyViolations).where(and(eq(policyViolations.orgId, orgId), gte(policyViolations.detectedAt, cutoff))),
      db.select({ count: count() }).from(policyViolations).where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'remediated'), gte(policyViolations.remediatedAt, cutoff))),
      db.select({ count: count() }).from(identityThreats).where(and(eq(identityThreats.orgId, orgId), eq(identityThreats.status, 'active'))),
      db.select().from(actionLog).where(and(eq(actionLog.orgId, orgId), gte(actionLog.createdAt, cutoff))).orderBy(desc(actionLog.createdAt)).limit(20),
      db.select({ id: integrationSources.id, name: integrationSources.name, syncStatus: integrationSources.syncStatus }).from(integrationSources).where(eq(integrationSources.orgId, orgId)),
      db.select({
        bucket: sql<string>`CASE WHEN ${identities.riskScore} >= 80 THEN 'critical' WHEN ${identities.riskScore} >= 60 THEN 'high' WHEN ${identities.riskScore} >= 30 THEN 'medium' ELSE 'low' END`,
        count: count(),
      }).from(identities).where(eq(identities.orgId, orgId)).groupBy(sql`CASE WHEN ${identities.riskScore} >= 80 THEN 'critical' WHEN ${identities.riskScore} >= 60 THEN 'high' WHEN ${identities.riskScore} >= 30 THEN 'medium' ELSE 'low' END`),
    ])

    const metrics = {
      totalIdentities: totalIdentitiesResult[0]?.count ?? 0,
      openViolations: openViolationsResult[0]?.count ?? 0,
      violationsInPeriod: violationsInPeriodResult[0]?.count ?? 0,
      remediatedInPeriod: remediatedInPeriodResult[0]?.count ?? 0,
      activeThreats: activeThreatsResult[0]?.count ?? 0,
      integrations: integrationHealthResult,
      riskDistribution: Object.fromEntries(riskDistributionResult.map(r => [r.bucket, r.count])),
      recentActions: recentActionsResult.length,
      period: `${days} days`,
    }

    const ai = await generateJSON(
      {
        label: 'executive-report',
        system: EXECUTIVE_REPORT_PROMPT,
        prompt: JSON.stringify(metrics),
        temperature: 0.3,
        maxTokens: 1024,
        timeoutMs: 120_000,
      },
      (parsed) => (parsed?.headline ? parsed : null),
    )
    const meta = aiMeta(ai)

    const aiReport: any = ai.ok ? ai.data : {
      headline: 'Executive report generated without AI analysis',
      topRisks: ['AI analysis unavailable - review metrics manually'],
      topWins: ['Report data collected successfully'],
      forecast: 'AI forecast unavailable. Please review metrics below.',
      recommendations: ['Enable AI provider for full report capabilities'],
    }

    const reportDate = new Date().toISOString().split('T')[0]

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Identity Radar - Executive Report</title>
<style>
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .no-print { display: none !important; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e; background: white; line-height: 1.6; }
  h1 { color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 12px; }
  h2 { color: #1e40af; margin-top: 32px; }
  .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 20px 0; }
  .metric-card { background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; }
  .metric-value { font-size: 28px; font-weight: 700; color: #1e40af; }
  .metric-label { font-size: 13px; color: #64748b; margin-top: 4px; }
  .risk-item, .win-item, .rec-item { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .headline { font-size: 18px; color: #334155; background: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0; }
  .forecast { background: #f0fdf4; padding: 16px; border-radius: 8px; border-left: 4px solid #22c55e; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
</style>
</head>
<body>
<h1>Identity Radar Executive Report</h1>
<p>Report Date: ${reportDate} | Period: Last ${days} days</p>

<div class="headline">${esc(aiReport.headline)}</div>

<h2>Key Metrics</h2>
<div class="metric-grid">
  <div class="metric-card"><div class="metric-value">${metrics.totalIdentities}</div><div class="metric-label">Total Identities</div></div>
  <div class="metric-card"><div class="metric-value">${metrics.openViolations}</div><div class="metric-label">Open Violations</div></div>
  <div class="metric-card"><div class="metric-value">${metrics.remediatedInPeriod}</div><div class="metric-label">Remediated (${days}d)</div></div>
  <div class="metric-card"><div class="metric-value">${metrics.activeThreats}</div><div class="metric-label">Active Threats</div></div>
  <div class="metric-card"><div class="metric-value">${metrics.riskDistribution.critical ?? 0}</div><div class="metric-label">Critical Risk</div></div>
  <div class="metric-card"><div class="metric-value">${metrics.recentActions}</div><div class="metric-label">Actions Taken (${days}d)</div></div>
</div>

<h2>Top Risks</h2>
${aiReport.topRisks?.map((r: string) => `<div class="risk-item">${esc(r)}</div>`).join('') || '<p>No risks identified</p>'}

<h2>Top Wins</h2>
${aiReport.topWins?.map((w: string) => `<div class="win-item">${esc(w)}</div>`).join('') || '<p>No wins recorded</p>'}

<h2>Forecast</h2>
<div class="forecast">${esc(aiReport.forecast)}</div>

<h2>Recommendations</h2>
${aiReport.recommendations?.map((r: string) => `<div class="rec-item">${esc(r)}</div>`).join('') || '<p>No recommendations</p>'}

<div class="footer">
  ${meta.generatedBy === 'ai'
    ? `Narrative sections are AI-generated recommendations (${esc(meta.model)}) and require human review.`
    : 'Narrative sections were generated without AI.'}<br>
  Generated by Identity Radar | ${reportDate} | Confidential
</div>
</body>
</html>`

    return NextResponse.json({
      html,
      metrics,
      aiReport,
      reportDate,
      period: days,
      ...meta,
    })
  } catch (err: any) {
    console.error('[Executive Report] Error:', err)
    return NextResponse.json({ error: 'Failed to generate report', details: err.message }, { status: 500 })
  }
}
