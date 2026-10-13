import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import {
  shadowAdmins, identities, entitlements, groups, groupMemberships,
  policyViolations, policies,
} from '@/lib/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const params = req.nextUrl.searchParams
  const status = params.get('status')
  const method = params.get('detectionMethod')

  try {
    const conditions = [eq(shadowAdmins.orgId, orgId)]
    if (status) conditions.push(eq(shadowAdmins.status, status))
    if (method) conditions.push(eq(shadowAdmins.detectionMethod, method))

    const results = await db
      .select({
        id: shadowAdmins.id,
        identityId: shadowAdmins.identityId,
        identityName: identities.displayName,
        identityType: identities.type,
        identityTier: identities.adTier,
        detectionMethod: shadowAdmins.detectionMethod,
        detectionReasons: shadowAdmins.detectionReasons,
        effectiveRights: shadowAdmins.effectiveRights,
        equivalentToGroups: shadowAdmins.equivalentToGroups,
        riskScore: shadowAdmins.riskScore,
        status: shadowAdmins.status,
        detectedAt: shadowAdmins.detectedAt,
      })
      .from(shadowAdmins)
      .innerJoin(identities, eq(shadowAdmins.identityId, identities.id))
      .where(and(...conditions))
      .orderBy(desc(shadowAdmins.riskScore))

    // Summary stats
    const all = await db
      .select({
        status: shadowAdmins.status,
        method: shadowAdmins.detectionMethod,
        count: sql<number>`count(*)::int`,
      })
      .from(shadowAdmins)
      .where(eq(shadowAdmins.orgId, orgId))
      .groupBy(shadowAdmins.status, shadowAdmins.detectionMethod)

    const summary = {
      total: all.reduce((sum, r) => sum + r.count, 0),
      byStatus: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
    }
    for (const r of all) {
      summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + r.count
      summary.byMethod[r.method] = (summary.byMethod[r.method] || 0) + r.count
    }

    return NextResponse.json({ items: results, summary })
  } catch (error) {
    console.error('Shadow admins GET error:', error)
    return NextResponse.json({ error: 'Failed to load shadow admins' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Re-running the scan replaces stored findings, so it needs the triage role.
  if (!hasRole((session.user.appRole ?? 'viewer') as AppRole, 'analyst')) {
    return NextResponse.json({ error: 'Forbidden: analyst role required' }, { status: 403 })
  }

  const orgId = session.user.orgId

  try {
    // Load all identities and their group memberships
    const orgIdentities = await db
      .select({
        id: identities.id,
        displayName: identities.displayName,
        type: identities.type,
        adTier: identities.adTier,
      })
      .from(identities)
      .where(eq(identities.orgId, orgId))

    // Load all group memberships with group info
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

    // Load all entitlements to T0 resources
    const t0Entitlements = await db
      .select({
        identityId: entitlements.identityId,
        permissionName: entitlements.permissionName,
        adTierOfPermission: entitlements.adTierOfPermission,
      })
      .from(entitlements)
      .where(and(
        eq(entitlements.orgId, orgId),
        eq(entitlements.adTierOfPermission, 'tier_0'),
      ))

    // Identities in privileged groups
    const privilegedMembers = new Set(
      allMemberships
        .filter(m => m.isPrivileged)
        .map(m => m.identityId)
    )

    // Find shadow admins: have T0 access but NOT in any privileged group
    const shadowAdminCandidates: {
      identityId: string
      method: string
      reasons: string[]
      rights: string[]
      equivalentGroups: string[]
      riskScore: number
    }[] = []

    // Method 1: Direct T0 entitlements without privileged group membership
    const t0ByIdentity = new Map<string, string[]>()
    for (const ent of t0Entitlements) {
      if (!t0ByIdentity.has(ent.identityId)) {
        t0ByIdentity.set(ent.identityId, [])
      }
      t0ByIdentity.get(ent.identityId)!.push(ent.permissionName)
    }

    for (const [identityId, permissions] of t0ByIdentity) {
      if (!privilegedMembers.has(identityId)) {
        const identity = orgIdentities.find(i => i.id === identityId)
        if (!identity) continue

        const adminPerms = ['Domain Admin', 'Enterprise Admin', 'Schema Admin', 'Global Admin',
          'Privileged Authentication Admin', 'Security Admin', 'Exchange Admin']
        const matchedPerms = permissions.filter(p => adminPerms.some(ap => p.includes(ap) || ap.includes(p)))
        const equivalentGroups = matchedPerms.length > 0
          ? matchedPerms.map(p => `${p} (equivalent)`)
          : ['Tier 0 access holders']

        shadowAdminCandidates.push({
          identityId,
          method: 'acl_analysis',
          reasons: [
            `Has ${permissions.length} Tier 0 entitlement(s) but is not in any privileged group`,
            ...permissions.slice(0, 3).map(p => `Direct Tier 0 access: ${p}`),
          ],
          rights: permissions,
          equivalentGroups,
          riskScore: Math.min(100, 60 + permissions.length * 10),
        })
      }
    }

    // Method 2: Nested group path to privileged groups (T0 group membership via non-privileged intermediary)
    const t0GroupMembers = allMemberships.filter(m => m.groupTier === 'tier_0' && !m.isPrivileged)
    for (const mem of t0GroupMembers) {
      if (!privilegedMembers.has(mem.identityId)) {
        const existing = shadowAdminCandidates.find(c => c.identityId === mem.identityId)
        if (existing) {
          existing.reasons.push(`Member of T0 group "${mem.groupName}" which is not marked as privileged`)
          if (!existing.equivalentGroups.includes(mem.groupName)) {
            existing.equivalentGroups.push(mem.groupName)
          }
        } else {
          shadowAdminCandidates.push({
            identityId: mem.identityId,
            method: 'nested_group',
            reasons: [`Member of T0 group "${mem.groupName}" which is not marked as privileged`],
            rights: [`Group membership: ${mem.groupName}`],
            equivalentGroups: [mem.groupName],
            riskScore: 70,
          })
        }
      }
    }

    // Clear old open shadow admins for this org and insert new ones
    await db.delete(shadowAdmins).where(
      and(eq(shadowAdmins.orgId, orgId), eq(shadowAdmins.status, 'open'))
    )

    if (shadowAdminCandidates.length > 0) {
      await db.insert(shadowAdmins).values(
        shadowAdminCandidates.map(c => ({
          identityId: c.identityId,
          detectionMethod: c.method,
          detectionReasons: c.reasons,
          effectiveRights: c.rights,
          equivalentToGroups: c.equivalentGroups,
          riskScore: c.riskScore,
          status: 'open',
          orgId,
        }))
      )
    }

    return NextResponse.json({
      success: true,
      detected: shadowAdminCandidates.length,
      message: `Shadow admin scan complete. ${shadowAdminCandidates.length} shadow admins detected.`,
    })
  } catch (error) {
    console.error('Shadow admin scan error:', error)
    return NextResponse.json({ error: 'Shadow admin scan failed' }, { status: 500 })
  }
}
