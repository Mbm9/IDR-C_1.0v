import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, entitlements, resources, groupMemberships, groups, policyViolations, policies, accounts, gpoObjects, gpoLinks, gpoPermissions } from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '50'))
  const tierFilter = req.nextUrl.searchParams.get('tier') || undefined

  // Get top identities by risk score (full columns)
  const identityFilter = tierFilter
    ? and(eq(identities.orgId, orgId), eq(identities.adTier, tierFilter as any))
    : eq(identities.orgId, orgId)

  const topIdentities = await db.select().from(identities)
    .where(identityFilter)
    .orderBy(desc(identities.riskScore))
    .limit(limit)

  const identityIds = topIdentities.map(i => i.id)
  if (identityIds.length === 0) {
    return NextResponse.json({ nodes: [], links: [] })
  }

  // Get entitlements + resources for these identities
  const entitlementData = await db.select({
    id: entitlements.id,
    identityId: entitlements.identityId,
    resourceId: entitlements.resourceId,
    permissionName: entitlements.permissionName,
    permissionType: entitlements.permissionType,
    permissionScope: entitlements.permissionScope,
    adTier: entitlements.adTierOfPermission,
    certificationStatus: entitlements.certificationStatus,
    lastUsedAt: entitlements.lastUsedAt,
    grantedAt: entitlements.grantedAt,
    grantedBy: entitlements.grantedBy,
    riskTags: entitlements.riskTags,
    resourceName: resources.name,
    resourceType: resources.type,
    resourceTier: resources.adTier,
    resourceCriticality: resources.criticality,
    resourceEnvironment: resources.environment,
    resourceOwnerIdentityId: resources.ownerIdentityId,
  }).from(entitlements)
    .innerJoin(resources, eq(entitlements.resourceId, resources.id))
    .where(eq(entitlements.orgId, orgId))
    .limit(500)

  // Filter to only entitlements for our identities
  const relevantEntitlements = entitlementData.filter(e => identityIds.includes(e.identityId))

  // Get group memberships with full group details
  const membershipData = await db.select({
    identityId: groupMemberships.identityId,
    groupId: groupMemberships.groupId,
    membershipType: groupMemberships.membershipType,
    addedAt: groupMemberships.addedAt,
    addedBy: groupMemberships.addedBy,
    groupName: groups.name,
    groupType: groups.type,
    groupScope: groups.scope,
    groupTier: groups.adTier,
    isPrivileged: groups.isPrivileged,
    memberCount: groups.memberCount,
    nestedGroupCount: groups.nestedGroupCount,
  }).from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(eq(groupMemberships.orgId, orgId))
    .limit(500)

  const relevantMemberships = membershipData.filter(m => identityIds.includes(m.identityId))

  // Get violations with policy info
  const violationData = await db.select({
    id: policyViolations.id,
    identityId: policyViolations.identityId,
    violationType: policyViolations.violationType,
    severity: policyViolations.severity,
    status: policyViolations.status,
    detectedAt: policyViolations.detectedAt,
    remediatedAt: policyViolations.remediatedAt,
    exceptionReason: policyViolations.exceptionReason,
    policyName: policies.name,
    policyType: policies.type,
  }).from(policyViolations)
    .innerJoin(policies, eq(policyViolations.policyId, policies.id))
    .where(eq(policyViolations.orgId, orgId))
    .limit(500)

  const relevantViolations = violationData.filter(v => identityIds.includes(v.identityId))

  // Get accounts for these identities
  const accountData = await db.select({
    id: accounts.id,
    identityId: accounts.identityId,
    accountName: accounts.accountName,
    platform: accounts.platform,
    accountType: accounts.accountType,
    enabled: accounts.enabled,
    mfaEnabled: accounts.mfaEnabled,
    privileged: accounts.privileged,
    lastAuthenticatedAt: accounts.lastAuthenticatedAt,
  }).from(accounts)
    .where(eq(accounts.orgId, orgId))
    .limit(500)

  const relevantAccounts = accountData.filter(a => identityIds.includes(a.identityId))

  // Collect manager/owner IDs that are not already in topIdentities
  const extraIdentityIds = new Set<string>()
  for (const identity of topIdentities) {
    if (identity.managerIdentityId && !identityIds.includes(identity.managerIdentityId)) {
      extraIdentityIds.add(identity.managerIdentityId)
    }
    if (identity.ownerIdentityId && !identityIds.includes(identity.ownerIdentityId)) {
      extraIdentityIds.add(identity.ownerIdentityId)
    }
  }

  // Fetch extra identities (managers/owners not in result set)
  let extraIdentities: typeof topIdentities = []
  if (extraIdentityIds.size > 0) {
    extraIdentities = await db.select().from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        inArray(identities.id, Array.from(extraIdentityIds))
      ))
  }

  const allIdentities = [...topIdentities, ...extraIdentities]
  const allIdentityIds = new Set(allIdentities.map(i => i.id))

  // Get GPO data
  const gpoData = await db.select({
    id: gpoObjects.id,
    name: gpoObjects.name,
    adTier: gpoObjects.adTier,
    status: gpoObjects.status,
    gpoGuid: gpoObjects.gpoGuid,
    version: gpoObjects.version,
  }).from(gpoObjects)
    .where(eq(gpoObjects.orgId, orgId))
    .limit(100)

  const gpoIds = gpoData.map(g => g.id)

  const gpoLinkData = gpoIds.length > 0 ? await db.select({
    gpoId: gpoLinks.gpoId,
    linkedOu: gpoLinks.linkedOu,
    adTierOfOu: gpoLinks.adTierOfOu,
    enforced: gpoLinks.enforced,
  }).from(gpoLinks)
    .where(eq(gpoLinks.orgId, orgId))
    .limit(300) : []

  const gpoPermData = gpoIds.length > 0 ? await db.select({
    gpoId: gpoPermissions.gpoId,
    trusteeIdentityId: gpoPermissions.trusteeIdentityId,
    trusteeGroupId: gpoPermissions.trusteeGroupId,
    trusteeName: gpoPermissions.trusteeName,
    permissionType: gpoPermissions.permissionType,
    dangerous: gpoPermissions.dangerous,
  }).from(gpoPermissions)
    .where(eq(gpoPermissions.orgId, orgId))
    .limit(300) : []

  // Build nodes and links
  const nodes: Array<{
    id: string
    label: string
    type: 'identity' | 'resource' | 'group' | 'violation' | 'account' | 'gpo'
    subType?: string
    tier?: string
    riskScore?: number
    tierViolation?: boolean
    identityType?: string
    isPrivileged?: boolean
    properties: Record<string, any>
  }> = []

  const links: Array<{
    source: string
    target: string
    type: 'entitlement' | 'membership' | 'manager' | 'owner' | 'violation' | 'account' | 'gpo_link' | 'gpo_edit'
    label?: string
    properties?: Record<string, any>
  }> = []

  const nodeSet = new Set<string>()

  // Add identity nodes with full properties
  for (const identity of allIdentities) {
    if (!nodeSet.has(identity.id)) {
      nodeSet.add(identity.id)
      nodes.push({
        id: identity.id,
        label: identity.displayName,
        type: 'identity',
        subType: identity.subType,
        tier: identity.adTier,
        riskScore: identity.riskScore,
        tierViolation: identity.tierViolation,
        identityType: identity.type,
        properties: {
          displayName: identity.displayName,
          upn: identity.upn,
          email: identity.email,
          samAccountName: identity.samAccountName,
          type: identity.type,
          subType: identity.subType,
          adTier: identity.adTier,
          effectiveTier: identity.effectiveTier,
          tierViolation: identity.tierViolation,
          riskScore: identity.riskScore,
          riskFactors: identity.riskFactors,
          status: identity.status,
          department: identity.department,
          sourceSystem: identity.sourceSystem,
          sourceId: identity.sourceId,
          lastLogonAt: identity.lastLogonAt,
          passwordLastSetAt: identity.passwordLastSetAt,
          createdInSourceAt: identity.createdInSourceAt,
          expiryAt: identity.expiryAt,
          managerIdentityId: identity.managerIdentityId,
          ownerIdentityId: identity.ownerIdentityId,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
        },
      })
    }
  }

  // Add resource nodes + entitlement links
  for (const ent of relevantEntitlements) {
    if (!nodeSet.has(ent.resourceId)) {
      nodeSet.add(ent.resourceId)
      nodes.push({
        id: ent.resourceId,
        label: ent.resourceName || 'Unknown Resource',
        type: 'resource',
        subType: ent.resourceType,
        tier: ent.resourceTier,
        properties: {
          name: ent.resourceName,
          resourceType: ent.resourceType,
          adTier: ent.resourceTier,
          criticality: ent.resourceCriticality,
          environment: ent.resourceEnvironment,
          ownerIdentityId: ent.resourceOwnerIdentityId,
        },
      })
    }
    links.push({
      source: ent.identityId,
      target: ent.resourceId,
      type: 'entitlement',
      label: ent.permissionName,
      properties: {
        permissionName: ent.permissionName,
        permissionType: ent.permissionType,
        adTierOfPermission: ent.adTier,
        certificationStatus: ent.certificationStatus,
        lastUsedAt: ent.lastUsedAt,
        grantedAt: ent.grantedAt,
        grantedBy: ent.grantedBy,
        riskTags: ent.riskTags,
        permissionScope: ent.permissionScope,
      },
    })
  }

  // Add group nodes + membership links
  for (const mem of relevantMemberships) {
    if (!nodeSet.has(mem.groupId)) {
      nodeSet.add(mem.groupId)
      nodes.push({
        id: mem.groupId,
        label: mem.groupName || 'Unknown Group',
        type: 'group',
        tier: mem.groupTier,
        isPrivileged: mem.isPrivileged ?? false,
        properties: {
          name: mem.groupName,
          groupType: mem.groupType,
          scope: mem.groupScope,
          groupTier: mem.groupTier,
          isPrivileged: mem.isPrivileged,
          memberCount: mem.memberCount,
          nestedGroupCount: mem.nestedGroupCount,
        },
      })
    }
    links.push({
      source: mem.identityId,
      target: mem.groupId,
      type: 'membership',
      properties: {
        membershipType: mem.membershipType,
        addedAt: mem.addedAt,
        addedBy: mem.addedBy,
      },
    })
  }

  // Add violation nodes + violation links
  for (const viol of relevantViolations) {
    const violNodeId = `violation-${viol.id}`
    if (!nodeSet.has(violNodeId)) {
      nodeSet.add(violNodeId)
      nodes.push({
        id: violNodeId,
        label: (viol.violationType || 'violation').replace(/_/g, ' '),
        type: 'violation',
        subType: viol.violationType,
        properties: {
          violationType: viol.violationType,
          severity: viol.severity,
          status: viol.status,
          detectedAt: viol.detectedAt,
          remediatedAt: viol.remediatedAt,
          exceptionReason: viol.exceptionReason,
          policyName: viol.policyName,
          policyType: viol.policyType,
        },
      })
    }
    links.push({
      source: viol.identityId,
      target: violNodeId,
      type: 'violation',
      label: viol.violationType?.replace(/_/g, ' ') || 'violation',
      properties: {
        violationType: viol.violationType,
        severity: viol.severity,
        status: viol.status,
      },
    })
  }

  // Add account nodes + account links
  for (const acct of relevantAccounts) {
    const acctNodeId = `account-${acct.id}`
    if (!nodeSet.has(acctNodeId)) {
      nodeSet.add(acctNodeId)
      nodes.push({
        id: acctNodeId,
        label: acct.accountName,
        type: 'account',
        subType: acct.accountType,
        properties: {
          accountName: acct.accountName,
          platform: acct.platform,
          accountType: acct.accountType,
          enabled: acct.enabled,
          mfaEnabled: acct.mfaEnabled,
          privileged: acct.privileged,
          lastAuthenticatedAt: acct.lastAuthenticatedAt,
        },
      })
    }
    links.push({
      source: acct.identityId,
      target: acctNodeId,
      type: 'account',
      label: acct.platform,
      properties: {
        platform: acct.platform,
        accountType: acct.accountType,
        mfaEnabled: acct.mfaEnabled,
        privileged: acct.privileged,
      },
    })
  }

  // Add manager edges
  for (const identity of topIdentities) {
    if (identity.managerIdentityId && allIdentityIds.has(identity.managerIdentityId)) {
      links.push({
        source: identity.managerIdentityId,
        target: identity.id,
        type: 'manager',
        label: 'manages',
      })
    }
  }

  // Add owner edges (NHI -> owner)
  for (const identity of topIdentities) {
    if (identity.ownerIdentityId && allIdentityIds.has(identity.ownerIdentityId)) {
      links.push({
        source: identity.ownerIdentityId,
        target: identity.id,
        type: 'owner',
        label: 'owns',
      })
    }
  }

  // Add GPO nodes
  for (const gpo of gpoData) {
    if (!nodeSet.has(gpo.id)) {
      nodeSet.add(gpo.id)
      nodes.push({
        id: gpo.id,
        label: gpo.name,
        type: 'gpo',
        tier: gpo.adTier,
        properties: {
          name: gpo.name,
          adTier: gpo.adTier,
          status: gpo.status,
          gpoGuid: gpo.gpoGuid,
          version: gpo.version,
        },
      })
    }
  }

  // Add GPO link edges (GPO → OU synthetic node)
  for (const link of gpoLinkData) {
    const ouNodeId = `ou:${link.linkedOu}`
    if (!nodeSet.has(ouNodeId)) {
      nodeSet.add(ouNodeId)
      nodes.push({
        id: ouNodeId,
        label: link.linkedOu.split(',')[0]?.replace(/^OU=|^CN=/, '') || link.linkedOu,
        type: 'resource',
        subType: 'ou',
        tier: link.adTierOfOu,
        properties: {
          dn: link.linkedOu,
          adTier: link.adTierOfOu,
        },
      })
    }
    links.push({
      source: link.gpoId,
      target: ouNodeId,
      type: 'gpo_link',
      label: link.enforced ? 'enforced link' : 'linked',
      properties: {
        enforced: link.enforced,
        adTierOfOu: link.adTierOfOu,
      },
    })
  }

  // Add GPO edit edges (identity → GPO)
  for (const perm of gpoPermData) {
    const principalId = perm.trusteeIdentityId || perm.trusteeGroupId
    if (principalId && nodeSet.has(perm.gpoId)) {
      if (perm.permissionType === 'edit_settings' || perm.permissionType === 'modify_security' || perm.permissionType === 'full_control') {
        links.push({
          source: principalId,
          target: perm.gpoId,
          type: 'gpo_edit',
          label: `can ${perm.permissionType.replace(/_/g, ' ')}`,
          properties: {
            permissionType: perm.permissionType,
            dangerous: perm.dangerous,
            trusteeName: perm.trusteeName,
          },
        })
      }
    }
  }

  return NextResponse.json({ nodes, links })
}
