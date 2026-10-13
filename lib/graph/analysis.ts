// Choke-Point Analysis + What-If Simulation.
//
// Two attack-graph capabilities that sit above the market (BloodHound Enterprise's
// premium territory) but run fully self-hosted / air-gapped:
//
//  • computeChokePoints — greedy set-cover over every attack path into the control plane
//    (Tier 0, plus Top Tier which can take over Tier 0) to answer
//    "fix these N edges and you break M% of all paths into Tier 0" (highest-ROI remediation).
//  • simulateRemoval — remove a node (disable identity) or an edge (revoke a permission),
//    recompute reachability into Tier 0, and report the exact before/after delta
//    BEFORE anyone touches production.
//
// Both are pure graph algorithms over the cached AdjacencyList — no AI, no new data.

import {
  buildAdjacencyList, findAllPaths, controlPlaneNodeIds, controlPlaneTargetFor,
  type AdjacencyList, type GraphEdge,
} from './traversal'
import { TIER_RISK, type GNode, type GLink } from './queries'
import { isControlPlaneTier, TIER_SHORT, type AdTier } from '@/lib/utils/tiers'

// ── Tuning ──
// These bound the path enumeration so a large directory can't blow up the request.
// The SAME constants are used for choke-point discovery and simulation so the
// "before" count and the choke-point coverage are measured on the same population.
const MAX_STARTS = 250          // attacker start nodes sampled
const MAX_DEPTH = 5             // max hops into Tier 0
const MAX_PATHS = 600           // hard cap on enumerated paths
const MAX_FIXES = 8             // fixes returned by the set-cover

// ── Shared helpers ──

function attackerStarts(list: AdjacencyList): string[] {
  const starts: string[] = []
  for (const [id, meta] of list.nodeMetadata) {
    if (meta.type === 'identity' && meta.tier !== 'tier_0') starts.push(id)
  }
  return starts
}

/**
 * Enumerate attack paths from non-Tier-0 identities into the control plane
 * (Tier 0, or Top Tier above the start's tier), capped for safety.
 */
function enumeratePaths(
  list: AdjacencyList,
): Array<{ path: string[]; edges: GraphEdge[]; length: number }> {
  const all: Array<{ path: string[]; edges: GraphEdge[]; length: number }> = []
  for (const s of attackerStarts(list).slice(0, MAX_STARTS)) {
    all.push(...findAllPaths(list, s, controlPlaneTargetFor(list, list.nodeMetadata.get(s)?.tier), MAX_DEPTH))
    if (all.length >= MAX_PATHS) break
  }
  return all.slice(0, MAX_PATHS)
}

const edgeKey = (e: { source: string; target: string; label: string }) =>
  `${e.source}|${e.target}|${e.label}`

const nameOf = (list: AdjacencyList, id: string) => list.nodeMetadata.get(id)?.name ?? id

// ── Choke-Point Analysis ──

export interface ChokeFix {
  rank: number
  source: string
  target: string
  sourceName: string
  targetName: string
  edgeType: GraphEdge['type']
  technique: string          // human label for the edge (permission / relationship)
  pathsBroken: number        // paths this fix removes that weren't already covered
  cumulativeBroken: number   // running total covered by fixes 1..rank
  cumulativePct: number      // cumulative share of all paths (0–100)
  dangerous: boolean
}

export interface ChokePointResult {
  totalPaths: number
  fixes: ChokeFix[]
  nodes: GNode[]
  links: GLink[]
  summary: string
}

function chokeNode(list: AdjacencyList, id: string, onFix: boolean): GNode {
  const meta = list.nodeMetadata.get(id)
  const tier = meta?.tier
  return {
    id, label: meta?.name || id, group: meta?.type || 'unknown', tier,
    riskScore: TIER_RISK[tier || 'unclassified'] ?? 20,
    severity: isControlPlaneTier(tier) ? 'critical' : onFix ? 'high' : undefined,
    badge: isControlPlaneTier(tier) ? TIER_SHORT[tier as AdTier] : undefined,
    meta: { type: meta?.type },
  }
}

/**
 * Greedy weighted set-cover: repeatedly pick the edge that eliminates the most
 * still-uncovered attack paths. The result is a prioritised "fix list" — the few
 * permissions whose removal collapses the most paths into Tier 0.
 */
export async function computeChokePoints(orgId: string): Promise<ChokePointResult> {
  const list = await buildAdjacencyList(orgId)
  // Sentinel string is matched by the UI; it now means "no Tier 0 or Top Tier assets".
  if (controlPlaneNodeIds(list).size === 0) {
    return { totalPaths: 0, fixes: [], nodes: [], links: [], summary: 'No Tier 0 assets found' }
  }

  const paths = enumeratePaths(list)
  const totalPaths = paths.length
  if (totalPaths === 0) {
    return { totalPaths: 0, fixes: [], nodes: [], links: [], summary: 'No attack paths into Tier 0 / Top Tier — nothing to fix.' }
  }

  // Map each candidate edge → the set of path indices it appears on.
  const edgePaths = new Map<string, { edge: GraphEdge; paths: Set<number> }>()
  paths.forEach((p, i) => {
    const seen = new Set<string>()
    for (const e of p.edges) {
      const k = edgeKey(e)
      if (seen.has(k)) continue
      seen.add(k)
      let entry = edgePaths.get(k)
      if (!entry) { entry = { edge: e, paths: new Set() }; edgePaths.set(k, entry) }
      entry.paths.add(i)
    }
  })

  const covered = new Set<number>()
  const fixes: ChokeFix[] = []
  while (covered.size < totalPaths && fixes.length < MAX_FIXES) {
    let best: { edge: GraphEdge; gain: number } | null = null
    for (const { edge, paths: idxs } of edgePaths.values()) {
      let gain = 0
      for (const i of idxs) if (!covered.has(i)) gain++
      if (gain > 0 && (!best || gain > best.gain)) best = { edge, gain }
    }
    if (!best || best.gain === 0) break

    // mark the newly-covered paths
    const entry = edgePaths.get(edgeKey(best.edge))!
    for (const i of entry.paths) covered.add(i)

    fixes.push({
      rank: fixes.length + 1,
      source: best.edge.source,
      target: best.edge.target,
      sourceName: nameOf(list, best.edge.source),
      targetName: nameOf(list, best.edge.target),
      edgeType: best.edge.type,
      technique: best.edge.label,
      pathsBroken: best.gain,
      cumulativeBroken: covered.size,
      cumulativePct: Math.round((covered.size / totalPaths) * 100),
      dangerous: best.edge.weight <= 2,
    })
  }

  // Subgraph: the fix edges + their endpoints, so the UI can highlight the chokepoints.
  const nodeIds = new Set<string>()
  const links: GLink[] = []
  for (const f of fixes) {
    nodeIds.add(f.source); nodeIds.add(f.target)
    links.push({ source: f.source, target: f.target, label: `#${f.rank} · ${f.technique}`, dangerous: true })
  }
  const onFix = new Set([...fixes.flatMap((f) => [f.source, f.target])])
  const nodes = [...nodeIds].map((id) => chokeNode(list, id, onFix.has(id)))

  const topPct = fixes.length ? fixes[fixes.length - 1].cumulativePct : 0
  return {
    totalPaths,
    fixes,
    nodes,
    links,
    summary: `${fixes.length} fix(es) eliminate ${topPct}% of ${totalPaths} attack path(s) into Tier 0 / Top Tier`,
  }
}

// ── What-If Simulation ──

export interface SimulateInput {
  removeNodeId?: string
  removeEdge?: { source: string; target: string; label?: string }
}

export interface SimulateResult {
  before: number
  after: number
  pathsBroken: number
  pctReduction: number
  targetLabel: string
  kind: 'node' | 'edge'
  summary: string
  capped: boolean
}

/**
 * Preview the impact of a change without touching production: remove a node
 * (e.g. disable an identity) or an edge (e.g. revoke a group membership / ACL),
 * then report how many Tier 0 attack paths break.
 *
 * Removing a node/edge can only *break* existing paths, never create new ones, so
 * we enumerate the current attack paths once and count how many survive the removal.
 * This is exact for the enumerated population and consistent with the choke-point
 * coverage numbers (which run set-cover over the same enumeration).
 */
export async function simulateRemoval(orgId: string, input: SimulateInput): Promise<SimulateResult> {
  const list = await buildAdjacencyList(orgId)
  const paths = enumeratePaths(list)
  const before = paths.length
  const capped = before >= MAX_PATHS

  const re = input.removeEdge
  const edgeRemoved = (e: GraphEdge): boolean => {
    if (!re) return false
    const labelOk = !re.label || e.label === re.label
    return (e.source === re.source && e.target === re.target && labelOk) ||
           (e.source === re.target && e.target === re.source && labelOk)
  }
  const pathBroken = (p: { path: string[]; edges: GraphEdge[] }): boolean =>
    input.removeNodeId ? p.path.includes(input.removeNodeId) : p.edges.some(edgeRemoved)

  const after = paths.filter((p) => !pathBroken(p)).length
  const broken = before - after
  const pct = before > 0 ? Math.round((broken / before) * 100) : 0

  const kind: 'node' | 'edge' = input.removeNodeId ? 'node' : 'edge'
  const targetLabel = input.removeNodeId
    ? nameOf(list, input.removeNodeId)
    : `${nameOf(list, input.removeEdge!.source)} → ${nameOf(list, input.removeEdge!.target)}`

  const verb = kind === 'node' ? 'Disabling' : 'Revoking'
  const summary = broken > 0
    ? `${verb} ${targetLabel} breaks ${broken} attack path(s) into Tier 0 / Top Tier (${pct}% reduction)`
    : `${verb} ${targetLabel} does not break any Tier 0 / Top Tier attack paths`

  return { before, after, pathsBroken: broken, pctReduction: pct, targetLabel, kind, summary, capped }
}
