import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import {
  identities,
  entitlements,
  resources,
  groupMemberships,
  groups,
  adDelegations,
  aclEntries,
  gpoObjects,
  gpoLinks,
  gpoPermissions,
} from '@/lib/db/schema'
import { isControlPlaneTier, isStricterTier } from '@/lib/utils/tiers'

// ── Types ──

export interface GraphEdge {
  source: string
  target: string
  type: 'entitlement' | 'membership' | 'manager' | 'owner' | 'delegation' | 'acl' | 'gpo_edit' | 'gpo_link'
  label: string
  properties?: Record<string, any>
  weight: number // lower = more dangerous
}

export interface NodeMetadata {
  type: string
  tier?: string
  name: string
}

export interface AdjacencyList {
  edges: Map<string, GraphEdge[]>
  nodeMetadata: Map<string, NodeMetadata>
  builtAt: Date
}

// ── Cache (per org, 5-min TTL) ──

const cache = new Map<string, { list: AdjacencyList; expires: Date }>()

const CACHE_TTL_MS = 5 * 60 * 1000

function getCached(orgId: string): AdjacencyList | null {
  const entry = cache.get(orgId)
  if (entry && entry.expires > new Date()) return entry.list
  if (entry) cache.delete(orgId)
  return null
}

function setCache(orgId: string, list: AdjacencyList): void {
  cache.set(orgId, { list, expires: new Date(Date.now() + CACHE_TTL_MS) })
}

export function invalidateCache(orgId: string): void {
  cache.delete(orgId)
}

// ── Edge weight helpers ──

/** Lower weight = more dangerous path (easier to exploit). */
function delegationWeight(permission: string, dangerous: boolean): number {
  if (dangerous) return 1
  const highRisk = ['generic_all', 'write_dacl', 'write_owner', 'dcsync', 'force_change_password']
  if (highRisk.includes(permission.toLowerCase())) return 2
  return 5
}

function aclWeight(rights: string[]): number {
  const critical = ['GenericAll', 'WriteDacl', 'WriteOwner']
  if (rights.some(r => critical.includes(r))) return 1
  const high = ['WriteProperty', 'ExtendedRight', 'AddMember']
  if (rights.some(r => high.includes(r))) return 3
  return 6
}

// ── Build Adjacency List ──

export async function buildAdjacencyList(orgId: string): Promise<AdjacencyList> {
  const cached = getCached(orgId)
  if (cached) return cached

  const edges = new Map<string, GraphEdge[]>()
  const nodeMetadata = new Map<string, NodeMetadata>()

  function addEdge(edge: GraphEdge): void {
    // Forward edge
    const fwd = edges.get(edge.source) || []
    fwd.push(edge)
    edges.set(edge.source, fwd)

    // Reverse edge (for undirected traversal)
    const rev = edges.get(edge.target) || []
    rev.push({ ...edge, source: edge.target, target: edge.source })
    edges.set(edge.target, rev)
  }

  // Run queries in parallel
  const [
    orgIdentities,
    orgEntitlements,
    orgMemberships,
    orgDelegations,
    orgAcls,
    orgResources,
    orgGroups,
    orgGpos,
    orgGpoLinks,
    orgGpoPerms,
  ] = await Promise.all([
    db.select({
      id: identities.id,
      displayName: identities.displayName,
      type: identities.type,
      adTier: identities.adTier,
      managerIdentityId: identities.managerIdentityId,
      ownerIdentityId: identities.ownerIdentityId,
    }).from(identities).where(eq(identities.orgId, orgId)),

    db.select({
      id: entitlements.id,
      identityId: entitlements.identityId,
      resourceId: entitlements.resourceId,
      permissionName: entitlements.permissionName,
      adTierOfPermission: entitlements.adTierOfPermission,
    }).from(entitlements).where(eq(entitlements.orgId, orgId)),

    db.select({
      groupId: groupMemberships.groupId,
      identityId: groupMemberships.identityId,
    }).from(groupMemberships).where(eq(groupMemberships.orgId, orgId)),

    db.select({
      id: adDelegations.id,
      sourceIdentityId: adDelegations.sourceIdentityId,
      targetDn: adDelegations.targetDn,
      targetObjectType: adDelegations.targetObjectType,
      permission: adDelegations.permission,
      adTierOfTarget: adDelegations.adTierOfTarget,
      dangerous: adDelegations.dangerous,
    }).from(adDelegations).where(eq(adDelegations.orgId, orgId)),

    db.select({
      id: aclEntries.id,
      objectDn: aclEntries.objectDn,
      objectType: aclEntries.objectType,
      principalIdentityId: aclEntries.principalIdentityId,
      principalGroupId: aclEntries.principalGroupId,
      rights: aclEntries.rights,
      accessType: aclEntries.accessType,
      adTierOfObject: aclEntries.adTierOfObject,
    }).from(aclEntries).where(eq(aclEntries.orgId, orgId)),

    db.select({
      id: resources.id,
      name: resources.name,
      adTier: resources.adTier,
      type: resources.type,
    }).from(resources).where(eq(resources.orgId, orgId)),

    db.select({
      id: groups.id,
      name: groups.name,
      adTier: groups.adTier,
      isPrivileged: groups.isPrivileged,
    }).from(groups).where(eq(groups.orgId, orgId)),

    db.select({
      id: gpoObjects.id,
      name: gpoObjects.name,
      adTier: gpoObjects.adTier,
    }).from(gpoObjects).where(eq(gpoObjects.orgId, orgId)),

    db.select({
      gpoId: gpoLinks.gpoId,
      linkedOu: gpoLinks.linkedOu,
      adTierOfOu: gpoLinks.adTierOfOu,
    }).from(gpoLinks).where(eq(gpoLinks.orgId, orgId)),

    db.select({
      gpoId: gpoPermissions.gpoId,
      trusteeIdentityId: gpoPermissions.trusteeIdentityId,
      trusteeGroupId: gpoPermissions.trusteeGroupId,
      permissionType: gpoPermissions.permissionType,
      dangerous: gpoPermissions.dangerous,
      adTierOfGpo: gpoPermissions.adTierOfGpo,
    }).from(gpoPermissions).where(eq(gpoPermissions.orgId, orgId)),
  ])

  // Register node metadata
  for (const i of orgIdentities) {
    nodeMetadata.set(i.id, { type: 'identity', tier: i.adTier, name: i.displayName })
  }
  for (const r of orgResources) {
    nodeMetadata.set(r.id, { type: 'resource', tier: r.adTier, name: r.name })
  }
  for (const g of orgGroups) {
    nodeMetadata.set(g.id, { type: 'group', tier: g.adTier, name: g.name })
  }

  // Entitlement edges: identity → resource
  for (const e of orgEntitlements) {
    addEdge({
      source: e.identityId,
      target: e.resourceId,
      type: 'entitlement',
      label: e.permissionName,
      properties: { entitlementId: e.id, tier: e.adTierOfPermission },
      weight: isControlPlaneTier(e.adTierOfPermission) ? 2 : e.adTierOfPermission === 'tier_1' ? 4 : 8,
    })
  }

  // Group membership edges: identity → group
  for (const m of orgMemberships) {
    const grp = orgGroups.find(g => g.id === m.groupId)
    addEdge({
      source: m.identityId,
      target: m.groupId,
      type: 'membership',
      label: grp ? grp.name : 'group',
      properties: { privileged: grp?.isPrivileged },
      weight: grp?.isPrivileged ? 2 : 6,
    })
  }

  // Manager edges: identity → manager
  for (const i of orgIdentities) {
    if (i.managerIdentityId) {
      addEdge({
        source: i.id,
        target: i.managerIdentityId,
        type: 'manager',
        label: 'reports to',
        weight: 10, // management chain = high weight (not a direct attack vector)
      })
    }
  }

  // Owner edges: identity → NHI they own
  for (const i of orgIdentities) {
    if (i.ownerIdentityId) {
      addEdge({
        source: i.ownerIdentityId,
        target: i.id,
        type: 'owner',
        label: 'owns',
        properties: { ownedType: i.type },
        weight: 3, // owner compromise = easy pivot
      })
    }
  }

  // Delegation edges: identity → target DN (synthetic node)
  for (const d of orgDelegations) {
    const syntheticId = `dn:${d.targetDn}`
    if (!nodeMetadata.has(syntheticId)) {
      nodeMetadata.set(syntheticId, {
        type: d.targetObjectType,
        tier: d.adTierOfTarget,
        name: d.targetDn.split(',')[0]?.replace(/^CN=|^OU=/, '') || d.targetDn,
      })
    }
    addEdge({
      source: d.sourceIdentityId,
      target: syntheticId,
      type: 'delegation',
      label: d.permission,
      properties: { delegationId: d.id, dangerous: d.dangerous, tier: d.adTierOfTarget },
      weight: delegationWeight(d.permission, d.dangerous),
    })
  }

  // ACL edges: identity/group → object DN (synthetic node)
  for (const a of orgAcls) {
    if (a.accessType === 'deny') continue // skip deny ACLs for attack path traversal

    const syntheticId = `dn:${a.objectDn}`
    if (!nodeMetadata.has(syntheticId)) {
      nodeMetadata.set(syntheticId, {
        type: a.objectType,
        tier: a.adTierOfObject,
        name: a.objectDn.split(',')[0]?.replace(/^CN=|^OU=/, '') || a.objectDn,
      })
    }

    const principalId = a.principalIdentityId || a.principalGroupId
    if (principalId) {
      addEdge({
        source: principalId,
        target: syntheticId,
        type: 'acl',
        label: a.rights.join(', '),
        properties: { aclId: a.id, rights: a.rights, tier: a.adTierOfObject },
        weight: aclWeight(a.rights),
      })
    }
  }

  // GPO node metadata
  for (const g of orgGpos) {
    nodeMetadata.set(g.id, { type: 'gpo', tier: g.adTier, name: g.name })
  }

  // GPO link edges: GPO → OU (synthetic node)
  for (const gl of orgGpoLinks) {
    const syntheticId = `dn:${gl.linkedOu}`
    if (!nodeMetadata.has(syntheticId)) {
      nodeMetadata.set(syntheticId, {
        type: 'ou',
        tier: gl.adTierOfOu,
        name: gl.linkedOu.split(',')[0]?.replace(/^OU=|^CN=/, '') || gl.linkedOu,
      })
    }
    addEdge({
      source: gl.gpoId,
      target: syntheticId,
      type: 'gpo_link',
      label: 'linked to',
      properties: { adTierOfOu: gl.adTierOfOu },
      weight: isControlPlaneTier(gl.adTierOfOu) ? 2 : 6,
    })
  }

  // GPO permission edges: identity/group → GPO (who can edit)
  for (const gp of orgGpoPerms) {
    const principalId = gp.trusteeIdentityId || gp.trusteeGroupId
    if (!principalId) continue

    // Only add edges for permissions that enable escalation
    const editPerms = ['edit_settings', 'modify_security', 'full_control', 'link_gpo']
    if (editPerms.includes(gp.permissionType)) {
      addEdge({
        source: principalId,
        target: gp.gpoId,
        type: 'gpo_edit',
        label: gp.permissionType.replace(/_/g, ' '),
        properties: { dangerous: gp.dangerous, tier: gp.adTierOfGpo },
        weight: gp.dangerous ? 1 : 3,
      })
    }
  }

  const list: AdjacencyList = { edges, nodeMetadata, builtAt: new Date() }
  setCache(orgId, list)
  return list
}

// ── BFS ──

export function bfs(
  list: AdjacencyList,
  start: string,
  options?: { maxDepth?: number; edgeFilter?: (e: GraphEdge) => boolean }
): Map<string, { depth: number; path: string[] }> {
  const maxDepth = options?.maxDepth ?? 10
  const edgeFilter = options?.edgeFilter

  const visited = new Map<string, { depth: number; path: string[] }>()
  visited.set(start, { depth: 0, path: [start] })

  const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [
    { nodeId: start, depth: 0, path: [start] },
  ]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.depth >= maxDepth) continue

    const neighbors = list.edges.get(current.nodeId) || []
    for (const edge of neighbors) {
      if (edgeFilter && !edgeFilter(edge)) continue

      const target = edge.target
      if (!visited.has(target)) {
        const newPath = [...current.path, target]
        visited.set(target, { depth: current.depth + 1, path: newPath })
        queue.push({ nodeId: target, depth: current.depth + 1, path: newPath })
      }
    }
  }

  return visited
}

// ── Find All Paths ──

export function findAllPaths(
  list: AdjacencyList,
  source: string,
  targetPredicate: (nodeId: string) => boolean,
  maxDepth: number = 6
): Array<{ path: string[]; edges: GraphEdge[]; length: number }> {
  const results: Array<{ path: string[]; edges: GraphEdge[]; length: number }> = []
  const MAX_RESULTS = 200 // cap on results collected
  // Hard work budget: caps DFS node expansions independently of results found.
  // Without this, a high-degree hub (e.g. Domain Users) with few reachable Tier 0
  // targets enumerates O(b^depth) simple paths while `results` stays near 0, so
  // MAX_RESULTS never trips and the synchronous DFS can block the event loop (DoS).
  const MAX_OPS = 200_000
  let ops = 0

  function dfs(
    current: string,
    visited: Set<string>,
    pathNodes: string[],
    pathEdges: GraphEdge[],
    depth: number
  ): void {
    if (results.length >= MAX_RESULTS) return
    if (++ops > MAX_OPS) return // work budget exhausted — abort this search
    if (depth > maxDepth) return

    if (depth > 0 && targetPredicate(current)) {
      results.push({
        path: [...pathNodes],
        edges: [...pathEdges],
        length: pathNodes.length - 1,
      })
      return // don't continue past a target
    }

    const neighbors = list.edges.get(current) || []
    for (const edge of neighbors) {
      // Only follow forward edges (source → target direction)
      if (edge.source !== current) continue
      if (visited.has(edge.target)) continue

      visited.add(edge.target)
      pathNodes.push(edge.target)
      pathEdges.push(edge)

      dfs(edge.target, visited, pathNodes, pathEdges, depth + 1)

      pathNodes.pop()
      pathEdges.pop()
      visited.delete(edge.target)
    }
  }

  const visited = new Set<string>([source])
  dfs(source, visited, [source], [], 0)

  return results
}

// ── Control-plane targets ──

/** Tier 0 and Top Tier nodes: what attack-path discovery aims at. */
export function controlPlaneNodeIds(list: AdjacencyList): Set<string> {
  const s = new Set<string>()
  for (const [id, meta] of list.nodeMetadata) if (isControlPlaneTier(meta.tier)) s.add(id)
  return s
}

/**
 * Target predicate for an attacker starting at `startTier`: a Tier 0 or Top Tier
 * node more privileged than the start. Top Tier counts because owning it (ADFS,
 * Entra Connect, PKI, PAM, DC backup) is owning Tier 0; from a Top Tier start
 * only Tier 0 is a target.
 */
export function controlPlaneTargetFor(
  list: AdjacencyList,
  startTier: string | null | undefined,
): (nodeId: string) => boolean {
  return (nodeId) => {
    const tier = list.nodeMetadata.get(nodeId)?.tier
    return isControlPlaneTier(tier) && isStricterTier(tier, startTier)
  }
}

// ── Reachable Set ──

export function reachableSet(
  list: AdjacencyList,
  start: string,
  maxDepth: number = 10
): Set<string> {
  const result = bfs(list, start, { maxDepth })
  return new Set(result.keys())
}
