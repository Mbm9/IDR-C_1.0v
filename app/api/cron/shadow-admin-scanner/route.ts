import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  shadowAdmins, identities, entitlements, groups, groupMemberships, organizations,
} from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalDetected = 0

    for (const org of allOrgs) {
      const orgId = org.id

      // Load identities
      const orgIdentities = await db
        .select({ id: identities.id, type: identities.type, adTier: identities.adTier })
        .from(identities)
        .where(eq(identities.orgId, orgId))

      // Load group memberships with privilege status
      const allMemberships = await db
        .select({
          identityId: groupMemberships.identityId,
          groupId: groupMemberships.groupId,
          groupName: groups.name,
          isPrivileged: groups.isPrivileged,
          groupTier: groups.adTier,
        })
        .from(groupMemberships)
        .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
        .where(eq(groupMemberships.orgId, orgId))

      // Load T0 entitlements
      const t0Ents = await db
        .select({ identityId: entitlements.identityId, permissionName: entitlements.permissionName })
        .from(entitlements)
        .where(and(eq(entitlements.orgId, orgId), eq(entitlements.adTierOfPermission, 'tier_0')))

      const privilegedMembers = new Set(
        allMemberships.filter(m => m.isPrivileged).map(m => m.identityId)
      )

      const candidates: (typeof shadowAdmins.$inferInsert)[] = []

      // T0 access without privileged group membership
      const t0ByIdentity = new Map<string, string[]>()
      for (const ent of t0Ents) {
        if (!t0ByIdentity.has(ent.identityId)) t0ByIdentity.set(ent.identityId, [])
        t0ByIdentity.get(ent.identityId)!.push(ent.permissionName)
      }

      for (const [identityId, perms] of t0ByIdentity) {
        if (!privilegedMembers.has(identityId)) {
          candidates.push({
            identityId,
            detectionMethod: 'acl_analysis',
            detectionReasons: [`Has ${perms.length} T0 entitlements without privileged group membership`],
            effectiveRights: perms,
            equivalentToGroups: ['Tier 0 access holders'],
            riskScore: Math.min(100, 60 + perms.length * 10),
            status: 'open',
            orgId,
          })
        }
      }

      // T0 group membership via non-privileged group
      for (const mem of allMemberships) {
        if (mem.groupTier === 'tier_0' && !mem.isPrivileged && !privilegedMembers.has(mem.identityId)) {
          const existing = candidates.find(c => c.identityId === mem.identityId)
          if (!existing) {
            candidates.push({
              identityId: mem.identityId,
              detectionMethod: 'nested_group',
              detectionReasons: [`Member of T0 group "${mem.groupName}" not marked as privileged`],
              effectiveRights: [`Group: ${mem.groupName}`],
              equivalentToGroups: [mem.groupName],
              riskScore: 70,
              status: 'open',
              orgId,
            })
          }
        }
      }

      // Clear old open and insert new
      await db.delete(shadowAdmins).where(and(eq(shadowAdmins.orgId, orgId), eq(shadowAdmins.status, 'open')))
      if (candidates.length > 0) {
        await db.insert(shadowAdmins).values(candidates)
      }
      totalDetected += candidates.length
    }

    return NextResponse.json({
      success: true,
      message: `Shadow admin scan complete. ${totalDetected} detected across ${allOrgs.length} orgs.`,
      count: totalDetected,
    })
  } catch (error) {
    console.error('Shadow admin scanner cron error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
