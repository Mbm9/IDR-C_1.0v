import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { hasRole } from '@/lib/utils/rbac'
import { unauthorized, forbidden, logAction } from '@/lib/actions/helpers'
import { enrichIdentities } from '@/lib/data-quality/enricher'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const orgId = session.user.orgId
    const report = await enrichIdentities(orgId)

    await logAction({
      actionType: 'data_quality_action',
      actorIdentityId: session.user.id,
      orgId,
      payload: {
        operation: 'enrich',
        crossSourceFills: report.crossSourceFills,
        aiInferences: report.aiInferences,
        normalizations: report.normalizations,
        decayFlags: report.decayFlags,
        autoApplied: report.actions.filter((a) => !a.requiresReview).length,
        pendingReview: report.actions.filter((a) => a.requiresReview).length,
      },
    })

    return NextResponse.json(report)
  } catch (err: any) {
    console.error('[Data Quality] Enrich POST error:', err)
    return NextResponse.json({ error: 'Enrichment failed', details: err.message }, { status: 500 })
  }
}
