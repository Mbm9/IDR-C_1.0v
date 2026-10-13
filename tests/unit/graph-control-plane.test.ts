import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { findAllPaths, controlPlaneNodeIds, controlPlaneTargetFor, type AdjacencyList, type GraphEdge } from '@/lib/graph/traversal'

function graph(nodes: Record<string, string>, edges: Array<[string, string]>): AdjacencyList {
  const list: AdjacencyList = { edges: new Map(), nodeMetadata: new Map(), builtAt: new Date() }
  for (const [id, tier] of Object.entries(nodes)) list.nodeMetadata.set(id, { type: 'identity', tier, name: id })
  for (const [source, target] of edges) {
    const e: GraphEdge = { source, target, type: 'membership', label: 'member of', weight: 5 }
    for (const id of [source, target]) {
      if (!list.edges.has(id)) list.edges.set(id, [])
      list.edges.get(id)!.push(e)
    }
  }
  return list
}

describe('control-plane attack-path targets', () => {
  const g = graph(
    { u2: 'tier_2', u1: 'tier_1', adfs: 'tier_top', dc: 'tier_0' },
    [['u2', 'u1'], ['u1', 'adfs'], ['adfs', 'dc']],
  )

  it('includes Tier 0 and Top Tier nodes', () => {
    expect([...controlPlaneNodeIds(g)].sort()).toEqual(['adfs', 'dc'])
  })

  it('stops a lower-tier attacker at the first Top Tier node (owning it owns Tier 0)', () => {
    const paths = findAllPaths(g, 'u2', controlPlaneTargetFor(g, 'tier_2'), 6)
    expect(paths.map((p) => p.path)).toEqual([['u2', 'u1', 'adfs']])
  })

  it('from a Top Tier start, only Tier 0 is a target', () => {
    const paths = findAllPaths(g, 'adfs', controlPlaneTargetFor(g, 'tier_top'), 6)
    expect(paths.map((p) => p.path)).toEqual([['adfs', 'dc']])
  })
})
