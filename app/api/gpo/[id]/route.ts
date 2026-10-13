import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { gpoObjects, gpoLinks, gpoPermissions, identities, groups, attackPaths } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'
import { isControlPlaneTier, isStricterTier, TIER_SHORT } from '@/lib/utils/tiers'

// GET: GPO detail with links, permissions, and risk info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const { id } = await params

    // Get GPO object
    const [gpo] = await db
      .select()
      .from(gpoObjects)
      .where(and(eq(gpoObjects.id, id), eq(gpoObjects.orgId, orgId)))

    if (!gpo) {
      return NextResponse.json({ error: 'GPO not found' }, { status: 404 })
    }

    // Get owner info
    let owner = null
    if (gpo.ownerIdentityId) {
      const [ownerRow] = await db
        .select({ id: identities.id, displayName: identities.displayName, adTier: identities.adTier })
        .from(identities)
        .where(eq(identities.id, gpo.ownerIdentityId))
      owner = ownerRow || null
    }

    // Get all links with OU info
    const links = await db
      .select()
      .from(gpoLinks)
      .where(and(eq(gpoLinks.gpoId, id), eq(gpoLinks.orgId, orgId)))

    // Get all permissions with identity/group info
    const permissions = await db
      .select({
        id: gpoPermissions.id,
        gpoId: gpoPermissions.gpoId,
        trusteeIdentityId: gpoPermissions.trusteeIdentityId,
        trusteeGroupId: gpoPermissions.trusteeGroupId,
        trusteeName: gpoPermissions.trusteeName,
        permissionType: gpoPermissions.permissionType,
        dangerous: gpoPermissions.dangerous,
        adTierOfGpo: gpoPermissions.adTierOfGpo,
        createdAt: gpoPermissions.createdAt,
        identityName: sql<string>`(SELECT display_name FROM identities WHERE identities.id = ${gpoPermissions.trusteeIdentityId})`,
        identityTier: sql<string>`(SELECT ad_tier FROM identities WHERE identities.id = ${gpoPermissions.trusteeIdentityId})`,
        groupName: sql<string>`(SELECT name FROM groups WHERE groups.id = ${gpoPermissions.trusteeGroupId})`,
        groupTier: sql<string>`(SELECT ad_tier FROM groups WHERE groups.id = ${gpoPermissions.trusteeGroupId})`,
      })
      .from(gpoPermissions)
      .where(and(eq(gpoPermissions.gpoId, id), eq(gpoPermissions.orgId, orgId)))

    // Identify risks for this GPO
    const risks: Array<{ type: string; description: string; severity: string }> = []

    // Check for dangerous permissions held below a control-plane GPO's tier
    // (Tier 0, or Top Tier which can take over Tier 0).
    const gpoTier = gpo.adTier
    const gpoTarget = gpoTier === 'tier_0' ? 'T0' : 'Top'
    const dangerousPerms = permissions.filter(p => p.dangerous)
    for (const p of dangerousPerms) {
      const trusteeTier = p.identityTier || p.groupTier || 'unclassified'
      if (!isControlPlaneTier(gpoTier) || !isStricterTier(gpoTier, trusteeTier)) continue
      const lowTier = trusteeTier === 'tier_2' || trusteeTier === 'unclassified'
      const source = lowTier ? 't2' : trusteeTier === 'tier_1' ? 't1' : 'top'
      risks.push({
        type: `${source}Edit${gpoTarget}`,
        description: `${p.trusteeName} (${trusteeTier}) can ${p.permissionType} on ${TIER_SHORT[gpoTier]} GPO`,
        severity: lowTier ? 'critical' : 'high',
      })
    }

    // Check control-plane OU links (T0, then Top Tier) with lower-tier permission holders
    const linkedTier = links.some(l => l.adTierOfOu === 'tier_0') ? 'tier_0'
      : links.some(l => l.adTierOfOu === 'tier_top') ? 'tier_top'
      : null
    if (linkedTier) {
      const lowerPerms = permissions.filter(p => {
        const tier = p.identityTier || p.groupTier || 'unclassified'
        return isStricterTier(linkedTier, tier) && (p.permissionType === 'edit_settings' || p.permissionType === 'modify_security' || p.permissionType === 'full_control')
      })
      for (const p of lowerPerms) {
        risks.push({
          type: linkedTier === 'tier_0' ? 'gpoLinkedToT0' : 'gpoLinkedToTop',
          description: `GPO linked to ${TIER_SHORT[linkedTier]} OU modifiable by ${p.trusteeName}`,
          severity: 'critical',
        })
      }
    }

    if (!gpo.ownerIdentityId) {
      risks.push({
        type: 'noOwner',
        description: 'GPO has no assigned owner',
        severity: 'medium',
      })
    }

    if (links.length === 0) {
      risks.push({
        type: 'unlinked',
        description: 'GPO is not linked to any OU',
        severity: 'low',
      })
    }

    // Find related attack paths that mention this GPO
    const relatedPaths = await db
      .select()
      .from(attackPaths)
      .where(and(
        eq(attackPaths.orgId, orgId),
        sql`${attackPaths.pathNodes}::text LIKE '%' || ${gpo.name} || '%'`
      ))
      .limit(10)

    return NextResponse.json({
      gpo,
      owner,
      links,
      permissions,
      risks,
      relatedPaths,
    })
  } catch (error) {
    console.error('[GPO] GET detail error:', error)
    return NextResponse.json({ error: 'Failed to get GPO detail' }, { status: 500 })
  }
}
