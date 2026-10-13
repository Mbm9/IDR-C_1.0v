import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { attackPaths, identities, resources } from '@/lib/db/schema'
import { eq, and, gte, desc, sql } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { buildAdjacencyList, findAllPaths } from '@/lib/graph/traversal'
import { determineTechnique, edgeToTechnique } from '@/lib/graph/techniques'
import { ATTACK_PATH_NARRATION_PROMPT } from '@/lib/ai/prompts'
import { logAction, unauthorized, forbidden } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

// GET: List attack paths with filters
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const url = new URL(req.url)
    const minRiskScore = Number(url.searchParams.get('minRiskScore') || '0')
    const sourceId = url.searchParams.get('sourceId')
    const targetId = url.searchParams.get('targetId')
    const status = url.searchParams.get('status')
    const technique = url.searchParams.get('technique')
    const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200)
    const offset = Number(url.searchParams.get('offset') || '0')

    const conditions = [eq(attackPaths.orgId, orgId)]
    if (minRiskScore > 0) conditions.push(gte(attackPaths.riskScore, minRiskScore))
    if (sourceId) conditions.push(eq(attackPaths.sourceIdentityId, sourceId))
    if (targetId) conditions.push(eq(attackPaths.targetIdentityId, targetId))
    if (status) conditions.push(eq(attackPaths.status, status as any))
    if (technique) conditions.push(eq(attackPaths.attackTechnique, technique))

    const paths = await db
      .select()
      .from(attackPaths)
      .where(and(...conditions))
      .orderBy(desc(attackPaths.riskScore))
      .limit(limit)
      .offset(offset)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(attackPaths)
      .where(and(...conditions))

    return NextResponse.json({ paths, total: count })
  } catch (error) {
    console.error('[AttackPaths] GET error:', error)
    return NextResponse.json({ error: 'Failed to list attack paths' }, { status: 500 })
  }
}

// POST: Trigger attack path computation
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId

    // Build adjacency list
    const graph = await buildAdjacencyList(orgId)

    // Find T0 targets (identities and resources)
    const t0NodeIds = new Set<string>()
    for (const [nodeId, meta] of graph.nodeMetadata) {
      if (meta.tier === 'tier_0') t0NodeIds.add(nodeId)
    }

    if (t0NodeIds.size === 0) {
      return NextResponse.json({ message: 'No Tier 0 targets found', pathsFound: 0 })
    }

    // Find non-T0 identity starting points
    const startingIdentities: string[] = []
    const orgIdents = await db
      .select({ id: identities.id, adTier: identities.adTier })
      .from(identities)
      .where(eq(identities.orgId, orgId))

    for (const ident of orgIdents) {
      if (ident.adTier !== 'tier_0') startingIdentities.push(ident.id)
    }

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
      const paths = findAllPaths(
        graph,
        startId,
        (nodeId) => t0NodeIds.has(nodeId),
        6 // max depth
      )

      for (const p of paths) {
        const lastNodeId = p.path[p.path.length - 1]
        const targetMeta = graph.nodeMetadata.get(lastNodeId)
        const sourceMeta = graph.nodeMetadata.get(startId)

        // Compute risk score based on path
        const baseRisk = Math.max(20, 100 - (p.length - 1) * 15) // shorter = riskier
        const hasDangerous = p.edges.some(e => e.properties?.dangerous)
        const hasGenericAll = p.edges.some(e => e.label?.includes('GenericAll'))
        const riskBonus = (hasDangerous ? 15 : 0) + (hasGenericAll ? 20 : 0)
        const riskScore = Math.min(100, baseRisk + riskBonus)

        // Determine primary technique
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
            source: e.source,
            target: e.target,
            type: e.type,
            label: e.label,
            technique: edgeToTechnique(e),
          })),
          pathLength: p.length,
          riskScore,
          attackTechnique: technique.name,
          mitreId: technique.mitreId,
        })
      }
    }

    // Sort by risk score and take top paths
    discoveredPaths.sort((a, b) => b.riskScore - a.riskScore)
    const topPaths = discoveredPaths.slice(0, 100)

    // Store in database (clear old paths first for this org)
    if (topPaths.length > 0) {
      // Delete existing paths for this org
      await db.delete(attackPaths).where(eq(attackPaths.orgId, orgId))

      // Insert new paths
      const insertValues = topPaths.map(p => ({
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
      }))

      await db.insert(attackPaths).values(insertValues)
    }

    // Narrate top 50 paths via AI (fire-and-forget for non-blocking)
    narrateTopPaths(orgId, topPaths.slice(0, 50)).catch(err =>
      console.error('[AttackPaths] Narration error:', err)
    )

    await logAction({
      actionType: 'assess_identity',
      actorIdentityId: session.user.id,
      orgId,
      rationale: `Attack path scan completed: ${topPaths.length} paths discovered`,
      payload: { pathsFound: topPaths.length, totalDiscovered: discoveredPaths.length },
    })

    return NextResponse.json({
      message: `Scan complete`,
      pathsFound: topPaths.length,
      totalDiscovered: discoveredPaths.length,
    })
  } catch (error) {
    console.error('[AttackPaths] POST error:', error)
    return NextResponse.json({ error: 'Attack path computation failed' }, { status: 500 })
  }
}

// ── Helpers ──

// AI narration for top paths (non-blocking)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'

async function narrateTopPaths(orgId: string, paths: any[]) {
  for (const path of paths) {
    try {
      const narrative = await callAIForNarration(path)
      if (narrative) {
        // Find and update the matching attack path
        const matching = await db
          .select({ id: attackPaths.id })
          .from(attackPaths)
          .where(
            and(
              eq(attackPaths.orgId, orgId),
              eq(attackPaths.sourceIdentityId, path.sourceIdentityId),
              eq(attackPaths.riskScore, path.riskScore)
            )
          )
          .limit(1)

        if (matching.length > 0) {
          await db
            .update(attackPaths)
            .set({ aiNarrative: narrative })
            .where(eq(attackPaths.id, matching[0].id))
        }
      }
    } catch {
      // Non-critical, continue
    }
  }
}

async function callAIForNarration(pathData: any): Promise<string | null> {
  const prompt = `Analyze this attack path:\n${JSON.stringify(pathData, null, 2)}`

  // Try Ollama first
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
        stream: false,
        format: 'json',
        options: { temperature: 0.3, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (response.ok) {
      const result = await response.json()
      const text = result.message?.content || ''
      try {
        const parsed = JSON.parse(text)
        return parsed.narrative || text
      } catch {
        return text
      }
    }
  } catch { /* fallthrough */ }

  // Try Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: ATTACK_PATH_NARRATION_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (response.ok) {
        const result = await response.json()
        const text = result.content?.[0]?.text || ''
        try {
          const parsed = JSON.parse(text)
          return parsed.narrative || text
        } catch {
          return text
        }
      }
    } catch { /* fallthrough */ }
  }

  return null
}
