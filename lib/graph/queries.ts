// Built-in graph query library + PathFinder.
//
// A catalog of pre-canned attack-graph questions ("who can DCSync", "shortest paths to Tier 0",
// "paths from broadly-accessible identities", etc.) plus an arbitrary source→target path finder.
// Each query resolves to a focused subgraph rendered by the ForceGraph engine.

import { db } from '@/lib/db'
import { identities, shadowAdmins } from '@/lib/db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'
import {
  buildAdjacencyList, bfs, findAllPaths,
  type AdjacencyList, type GraphEdge,
} from './traversal'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// Result shape mirrors the client FgNode/FgLink model (kept local to avoid importing client code).
export interface GNode {
  id: string; label: string; group: string; tier?: string
  riskScore?: number; severity?: 'critical' | 'high' | 'medium' | 'low'; badge?: string | number
  meta?: Record<string, unknown>
}
export interface GLink { source: string; target: string; label?: string; dangerous?: boolean }
export interface GraphResult { nodes: GNode[]; links: GLink[]; summary: string }

export interface GraphQueryDef {
  id: string
  label: string
  category: 'paths' | 'privilege' | 'exposure' | 'recon'
  description: string
}

export const GRAPH_QUERIES: GraphQueryDef[] = [
  { id: 'paths_to_tier0', label: 'Shortest paths to Tier 0', category: 'paths', description: 'Attack chains from any identity into Tier 0 assets.' },
  { id: 'paths_from_broad', label: 'Paths from broadly-accessible identities', category: 'paths', description: 'Escalation from Domain Users / Authenticated Users to Tier 0.' },
  { id: 'dcsync_holders', label: 'Who can DCSync', category: 'privilege', description: 'Identities holding DCSync (directory replication) rights.' },
  { id: 'dangerous_acl_tier0', label: 'Dangerous ACLs into Tier 0', category: 'privilege', description: 'GenericAll / WriteDACL / WriteOwner edges targeting Tier 0.' },
  { id: 'shadow_admins', label: 'Shadow admins', category: 'privilege', description: 'Identities with hidden Tier 0-equivalent privilege.' },
  { id: 'risky_admins', label: 'Risky admins (risk > 50)', category: 'privilege', description: 'Privileged identities with an elevated risk score.' },
  { id: 'kerberoastable', label: 'Kerberoastable accounts', category: 'exposure', description: 'Accounts exposing an SPN (offline-crackable).' },
  { id: 'unconstrained_delegation', label: 'Unconstrained delegation', category: 'exposure', description: 'Principals trusted for unconstrained delegation.' },
]

/** Node risk weight by tier; Top Tier sits between Tier 0 and Tier 1. */
export const TIER_RISK: Record<string, number> = { tier_0: 95, tier_top: 85, tier_1: 65, tier_2: 30, unclassified: 20 }
const UAC_TRUSTED_FOR_DELEGATION = 0x80000

function nodeFrom(list: AdjacencyList, id: string, extra?: Partial<GNode>): GNode {
  const meta = list.nodeMetadata.get(id)
  const tier = meta?.tier
  return {
    id, label: meta?.name || id, group: meta?.type || 'unknown', tier,
    riskScore: TIER_RISK[tier || 'unclassified'] ?? 20,
    severity: isControlPlaneTier(tier) ? 'critical' : undefined,
    meta: { type: meta?.type }, ...extra,
  }
}
function linkFrom(e: GraphEdge): GLink {
  return { source: e.source, target: e.target, label: e.label, dangerous: e.weight <= 2 }
}

function subgraphFromPaths(
  list: AdjacencyList,
  paths: Array<{ path: string[]; edges: GraphEdge[]; length: number }>,
): { nodes: GNode[]; links: GLink[] } {
  const nodeIds = new Set<string>()
  const links: GLink[] = []
  const seen = new Set<string>()
  for (const p of paths) {
    for (const id of p.path) nodeIds.add(id)
    for (const e of p.edges) {
      const k = `${e.source}|${e.target}|${e.label}`
      if (!seen.has(k)) { seen.add(k); links.push(linkFrom(e)) }
    }
  }
  return { nodes: [...nodeIds].map((id) => nodeFrom(list, id)), links }
}

// nodes for an explicit id set + the edges that run between them (optionally pulling in 1-hop group neighbours)
function subgraphFromNodes(
  list: AdjacencyList, ids: string[], opts?: { neighbourTypes?: GraphEdge['type'][] },
): { nodes: GNode[]; links: GLink[] } {
  const include = new Set(ids)
  const links: GLink[] = []
  const seen = new Set<string>()
  const pushLink = (e: GraphEdge) => {
    const k = `${e.source}|${e.target}|${e.label}`
    if (!seen.has(k)) { seen.add(k); links.push(linkFrom(e)) }
  }
  // optionally bring in neighbours (e.g. group memberships) for context
  if (opts?.neighbourTypes) {
    for (const id of ids) {
      for (const e of list.edges.get(id) || []) {
        if (e.source === id && opts.neighbourTypes.includes(e.type)) { include.add(e.target); pushLink(e) }
      }
    }
  }
  // edges among the included set
  for (const id of include) {
    for (const e of list.edges.get(id) || []) {
      if (e.source === id && include.has(e.target)) pushLink(e)
    }
  }
  return { nodes: [...include].map((id) => nodeFrom(list, id)), links }
}

function tier0Ids(list: AdjacencyList): Set<string> {
  const s = new Set<string>()
  for (const [id, meta] of list.nodeMetadata) if (meta.tier === 'tier_0') s.add(id)
  return s
}

const MAX_PATHS = 120

// ── Query runner ──

export async function runGraphQuery(orgId: string, id: string): Promise<GraphResult> {
  const list = await buildAdjacencyList(orgId)

  switch (id) {
    case 'paths_to_tier0': {
      const t0 = tier0Ids(list)
      if (t0.size === 0) return { nodes: [], links: [], summary: 'No Tier 0 assets found' }
      const starts: string[] = []
      for (const [nid, meta] of list.nodeMetadata) if (meta.type === 'identity' && meta.tier !== 'tier_0') starts.push(nid)
      const allPaths: Array<{ path: string[]; edges: GraphEdge[]; length: number }> = []
      for (const s of starts.slice(0, 250)) {
        const paths = findAllPaths(list, s, (n) => t0.has(n), 5)
        allPaths.push(...paths)
        if (allPaths.length >= MAX_PATHS) break
      }
      allPaths.sort((a, b) => a.length - b.length)
      const sg = subgraphFromPaths(list, allPaths.slice(0, MAX_PATHS))
      return { ...sg, summary: `${allPaths.length} attack path(s) into Tier 0` }
    }

    case 'paths_from_broad': {
      const t0 = tier0Ids(list)
      const starts: string[] = []
      for (const [nid, meta] of list.nodeMetadata) {
        const n = meta.name.toLowerCase()
        if (n.includes('domain users') || n.includes('authenticated users') || n.includes('everyone')) starts.push(nid)
      }
      const allPaths: Array<{ path: string[]; edges: GraphEdge[]; length: number }> = []
      for (const s of starts) {
        allPaths.push(...findAllPaths(list, s, (n) => t0.has(n), 6))
        if (allPaths.length >= MAX_PATHS) break
      }
      allPaths.sort((a, b) => a.length - b.length)
      const sg = subgraphFromPaths(list, allPaths.slice(0, MAX_PATHS))
      return { ...sg, summary: `${allPaths.length} path(s) from broadly-accessible identities` }
    }

    case 'dcsync_holders': {
      // collect dcsync edges
      const dc: GraphEdge[] = []
      for (const arr of list.edges.values()) for (const e of arr) {
        if (e.source && (e.label?.toLowerCase().includes('dcsync') || e.properties?.permission === 'dcsync')) dc.push(e)
      }
      const ids = new Set<string>()
      dc.forEach((e) => { ids.add(e.source); ids.add(e.target) })
      const links = dedupeLinks(dc.map(linkFrom))
      return { nodes: [...ids].map((i) => nodeFrom(list, i)), links, summary: `${dc.length} DCSync grant(s)` }
    }

    case 'dangerous_acl_tier0': {
      const t0 = tier0Ids(list)
      const dangerous: GraphEdge[] = []
      for (const arr of list.edges.values()) for (const e of arr) {
        const lbl = (e.label || '').toLowerCase()
        const isDangerous = e.weight <= 2 || lbl.includes('genericall') || lbl.includes('writedacl') || lbl.includes('writeowner')
        if (isDangerous && (e.type === 'acl' || e.type === 'delegation') && t0.has(e.target)) dangerous.push(e)
      }
      const ids = new Set<string>()
      dangerous.forEach((e) => { ids.add(e.source); ids.add(e.target) })
      return { nodes: [...ids].map((i) => nodeFrom(list, i)), links: dedupeLinks(dangerous.map(linkFrom)), summary: `${dangerous.length} dangerous ACL edge(s) into Tier 0` }
    }

    case 'shadow_admins': {
      const rows = await db.select({ identityId: shadowAdmins.identityId }).from(shadowAdmins)
        .where(and(eq(shadowAdmins.orgId, orgId), eq(shadowAdmins.status, 'open')))
      const ids = rows.map((r) => r.identityId).filter((i) => list.nodeMetadata.has(i))
      const sg = subgraphFromNodes(list, ids, { neighbourTypes: ['membership', 'entitlement'] })
      sg.nodes = sg.nodes.map((n) => (ids.includes(n.id) ? { ...n, severity: 'high', badge: '!' } : n))
      return { ...sg, summary: `${ids.length} shadow admin(s)` }
    }

    case 'risky_admins': {
      const rows = await db.select({ id: identities.id, name: identities.displayName, risk: identities.riskScore, tier: identities.adTier })
        .from(identities)
        .where(and(eq(identities.orgId, orgId)))
      const risky = rows.filter((r) => (r.risk ?? 0) > 50 && list.nodeMetadata.has(r.id))
      const ids = risky.map((r) => r.id)
      const sg = subgraphFromNodes(list, ids, { neighbourTypes: ['membership'] })
      const riskMap = new Map(risky.map((r) => [r.id, r.risk ?? 0]))
      sg.nodes = sg.nodes.map((n) => riskMap.has(n.id)
        ? { ...n, riskScore: riskMap.get(n.id), severity: (riskMap.get(n.id)! >= 75 ? 'critical' : 'high') as GNode['severity'] }
        : n)
      return { ...sg, summary: `${ids.length} risky admin(s)` }
    }

    case 'kerberoastable': {
      const rows = await db.select({ id: identities.id, sec: identities.adSecurity })
        .from(identities).where(and(eq(identities.orgId, orgId), isNotNull(identities.adSecurity)))
      const ids = rows.filter((r) => {
        const spn = (r.sec as any)?.spn
        return Array.isArray(spn) && spn.length > 0 && list.nodeMetadata.has(r.id)
      }).map((r) => r.id)
      const sg = subgraphFromNodes(list, ids, { neighbourTypes: ['membership'] })
      sg.nodes = sg.nodes.map((n) => (ids.includes(n.id) ? { ...n, severity: 'high', badge: 'SPN' } : n))
      return { ...sg, summary: `${ids.length} Kerberoastable account(s)` }
    }

    case 'unconstrained_delegation': {
      const rows = await db.select({ id: identities.id, sec: identities.adSecurity })
        .from(identities).where(and(eq(identities.orgId, orgId), isNotNull(identities.adSecurity)))
      const ids = rows.filter((r) => {
        const uac = (r.sec as any)?.uac
        return typeof uac === 'number' && (uac & UAC_TRUSTED_FOR_DELEGATION) === UAC_TRUSTED_FOR_DELEGATION && list.nodeMetadata.has(r.id)
      }).map((r) => r.id)
      const sg = subgraphFromNodes(list, ids, { neighbourTypes: ['membership'] })
      sg.nodes = sg.nodes.map((n) => (ids.includes(n.id) ? { ...n, severity: 'critical', badge: '⚑' } : n))
      return { ...sg, summary: `${ids.length} unconstrained-delegation principal(s)` }
    }

    default:
      return { nodes: [], links: [], summary: 'Unknown query' }
  }
}

function dedupeLinks(links: GLink[]): GLink[] {
  const seen = new Set<string>()
  const out: GLink[] = []
  for (const l of links) {
    const k = `${l.source}|${l.target}|${l.label}`
    if (!seen.has(k)) { seen.add(k); out.push(l) }
  }
  return out
}

// ── PathFinder: shortest path between two arbitrary nodes ──

export async function findPath(orgId: string, source: string, target: string, maxDepth = 8): Promise<GraphResult & { found: boolean; hops: number }> {
  const list = await buildAdjacencyList(orgId)
  if (!list.nodeMetadata.has(source) || !list.nodeMetadata.has(target)) {
    return { nodes: [], links: [], summary: 'Source or target not found', found: false, hops: 0 }
  }
  const visited = bfs(list, source, { maxDepth })
  const dest = visited.get(target)
  if (!dest) {
    // still show the two endpoints
    return {
      nodes: [nodeFrom(list, source), nodeFrom(list, target)], links: [],
      summary: 'No path found within depth limit', found: false, hops: 0,
    }
  }
  // reconstruct edges along the path
  const links: GLink[] = []
  for (let i = 0; i < dest.path.length - 1; i++) {
    const a = dest.path[i], b = dest.path[i + 1]
    const e = (list.edges.get(a) || []).find((x) => x.target === b)
    if (e) links.push(linkFrom(e))
  }
  const nodes = dest.path.map((id, i) => nodeFrom(list, id, i === 0 || i === dest.path.length - 1 ? { badge: i === 0 ? 'A' : 'B' } : undefined))
  return { nodes, links, summary: `Shortest path: ${dest.depth} hop(s)`, found: true, hops: dest.depth }
}
