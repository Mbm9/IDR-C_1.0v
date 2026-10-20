import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { classifyIdentities, type ClassificationResult } from '@/lib/data-quality/classifier'
import { logAction, unauthorized, forbidden } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const orgId = session.user.orgId

    const results = await classifyIdentities(orgId)

    // Auto-apply results with confidence > 80
    const applied: ClassificationResult[] = []
    const pendingReview: ClassificationResult[] = []

    for (const result of results) {
      if (result.confidence > 80) {
        // Apply the classification
        const updateData: Record<string, string> = {}
        switch (result.field) {
          case 'type':
            updateData.type = result.suggestedValue
            break
          case 'subType':
            updateData.subType = result.suggestedValue
            break
          case 'adTier':
            updateData.adTier = result.suggestedValue
            break
          case 'status':
            updateData.status = result.suggestedValue
            break
        }

        await db
          .update(identities)
          .set(updateData as any)
          .where(eq(identities.id, result.identityId))

        applied.push(result)
      } else {
        pendingReview.push(result)
      }
    }

    // Log the classification action
    await logAction({
      actionType: 'data_quality_action',
      actorIdentityId: session.user.id,
      orgId,
      rationale: `Auto-classification: ${applied.length} applied (>80% confidence), ${pendingReview.length} pending review`,
      payload: {
        operation: 'classify',
        totalResults: results.length,
        appliedCount: applied.length,
        pendingCount: pendingReview.length,
        appliedIdentityIds: applied.slice(0, 200).map((r) => r.identityId),
      },
    })

    return NextResponse.json({
      total: results.length,
      applied,
      pendingReview,
    })
  } catch (err: any) {
    console.error('[Data Quality] Classify error:', err)
    return NextResponse.json({ error: 'Classification failed', details: err.message }, { status: 500 })
  }
}
