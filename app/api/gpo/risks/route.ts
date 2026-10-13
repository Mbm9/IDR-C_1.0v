import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { gpoObjects, gpoLinks, gpoPermissions, identities, groups } from '@/lib/db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'
import { isControlPlaneTier, TIER_SHORT } from '@/lib/utils/tiers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

interface GpoRisk {
  gpoId: string
  gpoName: string
  gpoTier: string
  riskType: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  affectedIdentity?: string
  affectedIdentityTier?: string
}

// GET: GPO-specific risks
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const risks: GpoRisk[] = []

    // 1. GPOs linked to control-plane OUs (Tier 0, or Top Tier which can take over Tier 0)
    //    modifiable by T2 identities
    const t0LinkedGpos = await db
      .select({
        gpoId: gpoLinks.gpoId,
        gpoName: gpoObjects.name,
        gpoTier: gpoObjects.adTier,
        linkedOu: gpoLinks.linkedOu,
        ouTier: gpoLinks.adTierOfOu,
      })
      .from(gpoLinks)
      .innerJoin(gpoObjects, eq(gpoLinks.gpoId, gpoObjects.id))
      .where(and(
        eq(gpoLinks.orgId, orgId),
        inArray(gpoLinks.adTierOfOu, ['tier_0', 'tier_top'])
      ))

    for (const gpo of t0LinkedGpos) {
      const isT0 = gpo.ouTier === 'tier_0'
      // Find non-T0 identities with edit permissions on this GPO
      const dangerousPerms = await db
        .select({
          trusteeName: gpoPermissions.trusteeName,
          permissionType: gpoPermissions.permissionType,
          identityTier: identities.adTier,
        })
        .from(gpoPermissions)
        .leftJoin(identities, eq(gpoPermissions.trusteeIdentityId, identities.id))
        .where(and(
          eq(gpoPermissions.gpoId, gpo.gpoId),
          eq(gpoPermissions.orgId, orgId),
          sql`${gpoPermissions.permissionType} IN ('edit_settings', 'modify_security', 'full_control')`,
          sql`(${identities.adTier} = 'tier_2' OR ${identities.adTier} = 'unclassified' OR ${identities.adTier} IS NULL)`
        ))

      for (const perm of dangerousPerms) {
        risks.push({
          gpoId: gpo.gpoId,
          gpoName: gpo.gpoName,
          gpoTier: gpo.gpoTier,
          riskType: isT0 ? 't2_edit_t0_gpo' : 't2_edit_top_gpo',
          description: `T2 identity "${perm.trusteeName}" can ${perm.permissionType} on GPO linked to ${TIER_SHORT[gpo.ouTier]} OU (${gpo.linkedOu})`,
          severity: 'critical',
          affectedIdentity: perm.trusteeName,
          affectedIdentityTier: perm.identityTier || 'unknown',
        })
      }
    }

    // 2. GPOs with edit_settings granted to non-privileged identities
    const editPerms = await db
      .select({
        gpoId: gpoPermissions.gpoId,
        gpoName: gpoObjects.name,
        gpoTier: gpoObjects.adTier,
        trusteeName: gpoPermissions.trusteeName,
        permissionType: gpoPermissions.permissionType,
        identityTier: identities.adTier,
      })
      .from(gpoPermissions)
      .innerJoin(gpoObjects, eq(gpoPermissions.gpoId, gpoObjects.id))
      .leftJoin(identities, eq(gpoPermissions.trusteeIdentityId, identities.id))
      .where(and(
        eq(gpoPermissions.orgId, orgId),
        eq(gpoPermissions.permissionType, 'edit_settings'),
        sql`(${identities.adTier} = 'tier_2' OR ${identities.adTier} = 'unclassified')`
      ))

    for (const perm of editPerms) {
      // Avoid duplicating risks already caught above
      if (!risks.some(r => r.gpoId === perm.gpoId && r.affectedIdentity === perm.trusteeName && (r.riskType === 't2_edit_t0_gpo' || r.riskType === 't2_edit_top_gpo'))) {
        risks.push({
          gpoId: perm.gpoId,
          gpoName: perm.gpoName,
          gpoTier: perm.gpoTier,
          riskType: 'non_priv_edit',
          description: `Non-privileged "${perm.trusteeName}" has edit_settings on GPO "${perm.gpoName}"`,
          severity: 'high',
          affectedIdentity: perm.trusteeName,
          affectedIdentityTier: perm.identityTier || 'unknown',
        })
      }
    }

    // 3. GPOs linked to Domain Controllers OU with weak permissions
    const dcLinkedGpos = await db
      .select({
        gpoId: gpoLinks.gpoId,
        gpoName: gpoObjects.name,
        gpoTier: gpoObjects.adTier,
        linkedOu: gpoLinks.linkedOu,
      })
      .from(gpoLinks)
      .innerJoin(gpoObjects, eq(gpoLinks.gpoId, gpoObjects.id))
      .where(and(
        eq(gpoLinks.orgId, orgId),
        sql`lower(${gpoLinks.linkedOu}) LIKE '%domain controllers%'`
      ))

    for (const gpo of dcLinkedGpos) {
      const weakPerms = await db
        .select({
          trusteeName: gpoPermissions.trusteeName,
          permissionType: gpoPermissions.permissionType,
        })
        .from(gpoPermissions)
        .where(and(
          eq(gpoPermissions.gpoId, gpo.gpoId),
          eq(gpoPermissions.orgId, orgId),
          eq(gpoPermissions.dangerous, true)
        ))

      for (const perm of weakPerms) {
        if (!risks.some(r => r.gpoId === gpo.gpoId && r.affectedIdentity === perm.trusteeName)) {
          risks.push({
            gpoId: gpo.gpoId,
            gpoName: gpo.gpoName,
            gpoTier: gpo.gpoTier,
            riskType: 'dc_ou_weak_perms',
            description: `GPO "${gpo.gpoName}" linked to Domain Controllers OU with dangerous permission (${perm.permissionType}) for "${perm.trusteeName}"`,
            severity: 'critical',
            affectedIdentity: perm.trusteeName,
          })
        }
      }
    }

    // 4. Unmanaged GPOs (no owner)
    const unmanaged = await db
      .select({
        id: gpoObjects.id,
        name: gpoObjects.name,
        adTier: gpoObjects.adTier,
      })
      .from(gpoObjects)
      .where(and(
        eq(gpoObjects.orgId, orgId),
        sql`${gpoObjects.ownerIdentityId} IS NULL`
      ))

    for (const gpo of unmanaged) {
      risks.push({
        gpoId: gpo.id,
        gpoName: gpo.name,
        gpoTier: gpo.adTier,
        riskType: 'no_owner',
        description: `GPO "${gpo.name}" has no assigned owner`,
        severity: isControlPlaneTier(gpo.adTier) ? 'high' : 'medium',
      })
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    risks.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3))

    return NextResponse.json({ risks, total: risks.length })
  } catch (error) {
    console.error('[GPO Risks] GET error:', error)
    return NextResponse.json({ error: 'Failed to get GPO risks' }, { status: 500 })
  }
}
