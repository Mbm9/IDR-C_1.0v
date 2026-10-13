import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { buildGpoValidationReport, loadGpoValidationInput } from '@/lib/reports/gpo-validation'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/gpo-validation
 *
 * GPO-to-account validation (who can change which GPO versus their tier and
 * account state, GPO links versus OU tier, settings versus baseline) and
 * internal policy compliance (recorded violations plus direct measurement).
 * Read-only; available to every role. Display text is localized by the page.
 */
export const GET = withApiHandler(async (_req: NextRequest, { orgId, log }) => {
  const report = buildGpoValidationReport(await loadGpoValidationInput(orgId))
  log.info('GPO validation report built', {
    findings: report.findings.length,
    gpoCompliancePct: report.totals.gpoCompliancePct,
    policyCompliancePct: report.totals.policyCompliancePct,
  })
  return NextResponse.json(report)
})
