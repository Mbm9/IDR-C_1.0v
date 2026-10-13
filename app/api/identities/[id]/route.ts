import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import {
  identities, accounts, entitlements, resources,
  groupMemberships, groups, policyViolations, policies,
  actionLog, users,
} from '@/lib/db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const identityId = params.id

  // Fetch identity
  const [identity] = await db
    .select()
    .from(identities)
    .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))
    .limit(1)

  if (!identity) {
    return NextResponse.json({ error: 'Identity not found' }, { status: 404 })
  }

  // Fetch all related data in parallel
  const [
    identityAccounts,
    identityEntitlements,
    identityGroups,
    identityViolations,
    identityTimeline,
    manager,
    owner,
  ] = await Promise.all([
    // Accounts
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.identityId, identityId), eq(accounts.orgId, orgId))),

    // Entitlements with resource info
    db
      .select({
        id: entitlements.id,
        permissionType: entitlements.permissionType,
        permissionName: entitlements.permissionName,
        permissionScope: entitlements.permissionScope,
        adTierOfPermission: entitlements.adTierOfPermission,
        grantedAt: entitlements.grantedAt,
        grantedBy: entitlements.grantedBy,
        lastUsedAt: entitlements.lastUsedAt,
        certificationStatus: entitlements.certificationStatus,
        lastCertifiedAt: entitlements.lastCertifiedAt,
        riskTags: entitlements.riskTags,
        resourceName: resources.name,
        resourceType: resources.type,
      })
      .from(entitlements)
      .leftJoin(resources, eq(entitlements.resourceId, resources.id))
      .where(and(eq(entitlements.identityId, identityId), eq(entitlements.orgId, orgId))),

    // Group memberships with group info
    db
      .select({
        id: groupMemberships.id,
        membershipType: groupMemberships.membershipType,
        addedAt: groupMemberships.addedAt,
        groupName: groups.name,
        groupType: groups.type,
        groupAdTier: groups.adTier,
        isPrivileged: groups.isPrivileged,
      })
      .from(groupMemberships)
      .leftJoin(groups, eq(groupMemberships.groupId, groups.id))
      .where(and(eq(groupMemberships.identityId, identityId), eq(groupMemberships.orgId, orgId))),

    // Policy violations with policy info
    db
      .select({
        id: policyViolations.id,
        violationType: policyViolations.violationType,
        severity: policyViolations.severity,
        status: policyViolations.status,
        detectedAt: policyViolations.detectedAt,
        remediatedAt: policyViolations.remediatedAt,
        exceptionReason: policyViolations.exceptionReason,
        policyName: policies.name,
      })
      .from(policyViolations)
      .leftJoin(policies, eq(policyViolations.policyId, policies.id))
      .where(and(eq(policyViolations.identityId, identityId), eq(policyViolations.orgId, orgId)))
      .orderBy(desc(policyViolations.detectedAt)),

    // Action log (last 50 entries)
    db
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
      .where(eq(actionLog.targetIdentityId, identityId))
      .orderBy(desc(actionLog.createdAt))
      .limit(50),

    // Manager
    identity.managerIdentityId
      ? db.select({ id: identities.id, displayName: identities.displayName })
          .from(identities)
          .where(eq(identities.id, identity.managerIdentityId))
          .limit(1)
          .then(r => r[0] || null)
      : null,

    // Owner (for NHI)
    identity.ownerIdentityId
      ? db.select({ id: identities.id, displayName: identities.displayName })
          .from(identities)
          .where(eq(identities.id, identity.ownerIdentityId))
          .limit(1)
          .then(r => r[0] || null)
      : null,
  ])

  return NextResponse.json({
    identity,
    accounts: identityAccounts,
    entitlements: identityEntitlements,
    groups: identityGroups,
    violations: identityViolations,
    timeline: identityTimeline,
    manager,
    owner,
  })
}
