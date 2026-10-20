import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { entitlements, identities, peerGroups, resources } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { parseJsonBody } from '@/lib/actions/helpers'
import { z } from 'zod'

// Read-only: produces suggestions, writes nothing (so no action_log entry).
const smartReviewSchema = z.object({
  identityIds: z.array(z.string().uuid()).min(1, 'identityIds array required').max(200),
})

interface SmartSuggestion {
  entitlementId: string
  suggestion: 'certify' | 'revoke' | 'manual'
  reason: string
  confidence: number
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = (session.user as any)?.appRole as AppRole | undefined
  if (!userRole || !hasRole(userRole, 'analyst')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const orgId = session.user.orgId

  const parsed = await parseJsonBody(req, smartReviewSchema)
  if (!parsed.ok) return parsed.response
  const { identityIds } = parsed.data

  try {

    const suggestions: SmartSuggestion[] = []

    for (const identityId of identityIds) {
      // Get the identity
      const [identity] = await db.select({
        id: identities.id,
        department: identities.department,
        adTier: identities.adTier,
        subType: identities.subType,
      })
        .from(identities)
        .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))
        .limit(1)

      if (!identity) continue

      // Get the identity's entitlements
      const identityEntitlements = await db.select({
        id: entitlements.id,
        permissionName: entitlements.permissionName,
        lastUsedAt: entitlements.lastUsedAt,
        certificationStatus: entitlements.certificationStatus,
        adTierOfPermission: entitlements.adTierOfPermission,
        resourceId: entitlements.resourceId,
      })
        .from(entitlements)
        .where(and(
          eq(entitlements.identityId, identityId),
          eq(entitlements.orgId, orgId),
        ))

      // Get peer group for this identity
      const peerGroup = identity.department ? await db.select({
        commonEntitlements: peerGroups.commonEntitlements,
        memberCount: peerGroups.memberCount,
      })
        .from(peerGroups)
        .where(and(
          eq(peerGroups.orgId, orgId),
          eq(peerGroups.department, identity.department),
          eq(peerGroups.adTier, identity.adTier),
        ))
        .limit(1) : []

      const peerData = peerGroup?.[0]
      const commonEntitlements = (peerData?.commonEntitlements as Array<{ permissionName: string; percentage: number }>) || []

      for (const ent of identityEntitlements) {
        // Check peer group pattern
        const peerMatch = commonEntitlements.find(
          ce => ce.permissionName === ent.permissionName
        )

        if (peerMatch && peerMatch.percentage > 80) {
          // >80% of peers have this entitlement
          suggestions.push({
            entitlementId: ent.id,
            suggestion: 'certify',
            reason: 'Matches peer pattern',
            confidence: Math.round(peerMatch.percentage),
          })
        } else if (peerMatch && peerMatch.percentage === 0) {
          // 0% of peers have this
          suggestions.push({
            entitlementId: ent.id,
            suggestion: 'revoke',
            reason: 'Unique to this identity',
            confidence: 85,
          })
        } else if (!peerMatch && commonEntitlements.length > 0) {
          // Not in peer common entitlements at all
          suggestions.push({
            entitlementId: ent.id,
            suggestion: 'revoke',
            reason: 'Unique to this identity',
            confidence: 75,
          })
        } else if (ent.lastUsedAt) {
          const daysSinceUse = Math.floor(
            (Date.now() - new Date(ent.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24)
          )
          if (daysSinceUse > 90) {
            suggestions.push({
              entitlementId: ent.id,
              suggestion: 'revoke',
              reason: 'Unused 90+ days',
              confidence: 70,
            })
          } else {
            suggestions.push({
              entitlementId: ent.id,
              suggestion: 'manual',
              reason: 'Reviewer decision needed',
              confidence: 50,
            })
          }
        } else if (!ent.lastUsedAt) {
          // Never used — suggest revoke with moderate confidence
          suggestions.push({
            entitlementId: ent.id,
            suggestion: 'revoke',
            reason: 'Unused 90+ days',
            confidence: 65,
          })
        } else {
          suggestions.push({
            entitlementId: ent.id,
            suggestion: 'manual',
            reason: 'Reviewer decision needed',
            confidence: 50,
          })
        }
      }
    }

    const certifyCount = suggestions.filter(s => s.suggestion === 'certify').length
    const revokeCount = suggestions.filter(s => s.suggestion === 'revoke').length
    const manualCount = suggestions.filter(s => s.suggestion === 'manual').length

    return NextResponse.json({
      suggestions,
      summary: {
        certify: certifyCount,
        revoke: revokeCount,
        manual: manualCount,
        total: suggestions.length,
      },
    })
  } catch (error) {
    console.error('Smart review error:', error)
    return NextResponse.json({ error: 'Smart review failed' }, { status: 500 })
  }
}
