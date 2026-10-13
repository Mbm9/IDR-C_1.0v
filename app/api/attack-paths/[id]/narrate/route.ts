import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { attackPaths } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { ATTACK_PATH_NARRATION_PROMPT } from '@/lib/ai/prompts'
import { unauthorized, forbidden } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { generateJSON, aiMeta } from '@/lib/ai/client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const { id } = await params
    const orgId = session.user.orgId

    const [path] = await db
      .select()
      .from(attackPaths)
      .where(and(eq(attackPaths.id, id), eq(attackPaths.orgId, orgId)))

    if (!path) {
      return NextResponse.json({ error: 'Attack path not found' }, { status: 404 })
    }

    const prompt = `Analyze this attack path:\n${JSON.stringify({
      pathNodes: path.pathNodes,
      pathEdges: path.pathEdges,
      pathLength: path.pathLength,
      riskScore: path.riskScore,
      attackTechnique: path.attackTechnique,
      mitreId: path.mitreId,
    }, null, 2)}`

    const ai = await generateJSON({
      label: 'attack-path-narrate',
      system: ATTACK_PATH_NARRATION_PROMPT,
      prompt,
      temperature: 0.3,
      maxTokens: 2048,
      timeoutMs: 120_000,
    })
    const meta = aiMeta(ai)
    let narrative: any = ai.ok ? ai.data : null

    // Fallback
    if (!narrative) {
      narrative = {
        narrative: `This attack path shows a ${path.pathLength}-hop chain from a non-Tier 0 identity to a Tier 0 target using ${path.attackTechnique}. Risk score: ${path.riskScore}/100.`,
        riskAssessment: path.riskScore >= 80 ? 'Critical' : path.riskScore >= 60 ? 'High' : 'Medium',
        mitreMapping: path.mitreId ? [{ id: path.mitreId, name: path.attackTechnique, stage: 'privilege_escalation' }] : [],
        remediationOptions: [{ action: 'Review and revoke the most dangerous permission in this chain', breaksPathAtHop: 1, effort: 'medium', sideEffects: 'May impact dependent services' }],
        exploitability: path.pathLength <= 2 ? 'trivial' : path.pathLength <= 4 ? 'moderate' : 'advanced',
      }
    }

    // Save narrative to DB
    await db
      .update(attackPaths)
      .set({ aiNarrative: typeof narrative.narrative === 'string' ? narrative.narrative : JSON.stringify(narrative) })
      .where(eq(attackPaths.id, id))

    return NextResponse.json({ ...narrative, ...meta })
  } catch (error) {
    console.error('[AttackPaths] Narrate error:', error)
    return NextResponse.json({ error: 'Narration failed' }, { status: 500 })
  }
}
