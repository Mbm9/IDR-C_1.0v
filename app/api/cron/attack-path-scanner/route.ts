import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations, identities, attackPaths } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { buildAdjacencyList, findAllPaths, invalidateCache } from '@/lib/graph/traversal'
import { determineTechnique, edgeToTechnique } from '@/lib/graph/techniques'
import { ATTACK_PATH_NARRATION_PROMPT } from '@/lib/ai/prompts'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalPaths = 0

    for (const org of allOrgs) {
      const orgId = org.id

      // Invalidate cache to get fresh data
      invalidateCache(orgId)

      // Build adjacency list
      const graph = await buildAdjacencyList(orgId)

      // Find T0 targets
      const t0NodeIds = new Set<string>()
      for (const [nodeId, meta] of graph.nodeMetadata) {
        if (meta.tier === 'tier_0') t0NodeIds.add(nodeId)
      }

      if (t0NodeIds.size === 0) continue

      // Find non-T0 identity starting points
      const orgIdents = await db
        .select({ id: identities.id, adTier: identities.adTier })
        .from(identities)
        .where(eq(identities.orgId, orgId))

      const startingIdentities = orgIdents
        .filter(i => i.adTier !== 'tier_0')
        .map(i => i.id)

      // Discover paths
      const discoveredPaths: Array<{
        sourceIdentityId: string
        targetId: string
        // Groups, GPOs and AD objects (synthetic `dn:` nodes) are valid targets but
      // have no row in identities/resources; they live only in pathNodes.
      targetType: 'identity' | 'resource' | 'other'
        pathNodes: any[]
        pathEdges: any[]
        pathLength: number
        riskScore: number
        attackTechnique: string
        mitreId: string | null
      }> = []

      for (const startId of startingIdentities) {
        const paths = findAllPaths(graph, startId, (nodeId) => t0NodeIds.has(nodeId), 6)

        for (const p of paths) {
          const lastNodeId = p.path[p.path.length - 1]
          const targetMeta = graph.nodeMetadata.get(lastNodeId)

          const baseRisk = Math.max(20, 100 - (p.length - 1) * 15)
          const hasDangerous = p.edges.some(e => e.properties?.dangerous)
          const hasGenericAll = p.edges.some(e => e.label?.includes('GenericAll'))
          const riskScore = Math.min(100, baseRisk + (hasDangerous ? 15 : 0) + (hasGenericAll ? 20 : 0))

          const technique = determineTechnique(p.edges)

          discoveredPaths.push({
            sourceIdentityId: startId,
            targetId: lastNodeId,
            targetType: targetMeta?.type === 'identity' ? 'identity' : targetMeta?.type === 'resource' ? 'resource' : 'other',
            pathNodes: p.path.map(nodeId => {
              const meta = graph.nodeMetadata.get(nodeId)
              return { id: nodeId, type: meta?.type || 'unknown', name: meta?.name || nodeId, tier: meta?.tier }
            }),
            pathEdges: p.edges.map(e => ({
              source: e.source, target: e.target, type: e.type, label: e.label,
              technique: edgeToTechnique(e),
            })),
            pathLength: p.length,
            riskScore,
            attackTechnique: technique.name,
            mitreId: technique.mitreId,
          })
        }
      }

      // Sort and take top 100
      discoveredPaths.sort((a, b) => b.riskScore - a.riskScore)
      const topPaths = discoveredPaths.slice(0, 100)

      if (topPaths.length > 0) {
        await db.delete(attackPaths).where(eq(attackPaths.orgId, orgId))

        await db.insert(attackPaths).values(topPaths.map(p => ({
          sourceIdentityId: p.sourceIdentityId,
          targetIdentityId: p.targetType === 'identity' ? p.targetId : undefined,
          targetResourceId: p.targetType === 'resource' ? p.targetId : undefined,
          pathNodes: p.pathNodes,
          pathEdges: p.pathEdges,
          pathLength: p.pathLength,
          riskScore: p.riskScore,
          attackTechnique: p.attackTechnique,
          mitreId: p.mitreId,
          status: 'open' as const,
          orgId,
        })))

        totalPaths += topPaths.length
      }

      // Narrate top 50 (background, non-blocking)
      narrateTopPaths(orgId, topPaths.slice(0, 50)).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      message: `Attack path scan complete: ${totalPaths} paths discovered`,
      count: totalPaths,
    })
  } catch (error) {
    console.error('Attack path scanner cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Attack path scanner failed', error: String(error) },
      { status: 500 }
    )
  }
}

// ── AI narration ──

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

async function narrateTopPaths(orgId: string, paths: any[]) {
  for (const path of paths) {
    try {
      const prompt = `Analyze this attack path:\n${JSON.stringify(path, null, 2)}`
      let narrative: string | null = null

      // Try Ollama
      try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
              { role: 'system', content: ATTACK_PATH_NARRATION_PROMPT },
              { role: 'user', content: prompt },
            ],
            stream: false, format: 'json',
            options: { temperature: 0.3, num_predict: 1024 },
          }),
          signal: AbortSignal.timeout(60000),
        })
        if (response.ok) {
          const result = await response.json()
          const text = result.message?.content || ''
          try { const parsed = JSON.parse(text); narrative = parsed.narrative || text } catch { narrative = text }
        }
      } catch { /* fallthrough */ }

      // Try Anthropic
      if (!narrative && process.env.ANTHROPIC_API_KEY) {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 2048,
              system: ATTACK_PATH_NARRATION_PROMPT,
              messages: [{ role: 'user', content: prompt }],
            }),
          })
          if (response.ok) {
            const result = await response.json()
            const text = result.content?.[0]?.text || ''
            try { const parsed = JSON.parse(text); narrative = parsed.narrative || text } catch { narrative = text }
          }
        } catch { /* fallthrough */ }
      }

      if (narrative) {
        const matching = await db
          .select({ id: attackPaths.id })
          .from(attackPaths)
          .where(and(eq(attackPaths.orgId, orgId), eq(attackPaths.sourceIdentityId, path.sourceIdentityId), eq(attackPaths.riskScore, path.riskScore)))
          .limit(1)

        if (matching.length > 0) {
          await db.update(attackPaths).set({ aiNarrative: narrative }).where(eq(attackPaths.id, matching[0].id))
        }
      }
    } catch { /* continue */ }
  }
}
