import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { BLAST_RADIUS_PROMPT } from '@/lib/ai/prompts'
import { generateJSON, aiMeta } from '@/lib/ai/client'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { center, rings, stats } = body

    if (!center || !rings || !stats) {
      return NextResponse.json({ error: 'Missing blast radius data' }, { status: 400 })
    }

    // Provider chain via the shared client; deterministic narrative below if unavailable
    const ai = await generateJSON({
      label: 'blast-radius',
      system: BLAST_RADIUS_PROMPT,
      prompt: `Blast radius data:\n${JSON.stringify({ center, rings, stats }, null, 2)}`,
      temperature: 0.3,
      maxTokens: 1024,
      timeoutMs: 30_000,
    })
    if (ai.ok) {
      return NextResponse.json({ ...ai.data, ...aiMeta(ai) })
    }

    // Deterministic fallback
    const tierBreachWarning = stats.tierBreaches > 0
      ? `CRITICAL: ${stats.tierBreaches} Tier 0 assets are reachable from this ${center.tier} identity, representing potential full domain compromise.`
      : ''

    const narrative = {
      narrative: `Compromising ${center.name} (${center.type}, ${center.tier}) would expose ${stats.totalReachable} entities across ${rings.length} depth levels. ${tierBreachWarning} Direct access reaches ${rings[0]?.nodes?.length || 0} entities, with transitive paths expanding the blast radius significantly. ${stats.criticalAssets} critical assets are within the reachable set.`,
      criticalAssetsAtRisk: rings
        .flatMap((r: { nodes: Array<{ tier?: string; criticality?: string; name: string; type: string }> }) => r.nodes)
        .filter((n: { tier?: string; criticality?: string }) => n.tier === 'tier_0' || n.criticality === 'critical')
        .slice(0, 5)
        .map((n: { name: string; type: string; tier?: string }) => ({
          name: n.name,
          type: n.type,
          tier: n.tier || 'unknown',
          accessPath: 'via entitlement or group membership',
        })),
      identitiesAtRisk: stats.identityCount,
      tierEscalationPossible: stats.tierBreaches > 0,
      immediateContainmentSteps: [
        'Disable the compromised account immediately',
        'Revoke all active sessions and tokens',
        stats.tierBreaches > 0 ? 'Isolate Tier 0 assets from the compromised path' : 'Review and restrict entitlements',
        'Rotate credentials for all reachable service accounts',
        'Notify the SOC team and begin investigation',
      ].filter(Boolean),
      ...aiMeta(ai),
    }

    return NextResponse.json(narrative)
  } catch (error) {
    console.error('Blast radius narration error:', error)
    return NextResponse.json({ error: 'Failed to generate narration' }, { status: 500 })
  }
}
