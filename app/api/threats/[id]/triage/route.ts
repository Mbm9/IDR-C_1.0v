import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityThreats, identities } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { unauthorized, forbidden } from '@/lib/actions/helpers'
import { THREAT_TRIAGE_PROMPT } from '@/lib/ai/prompts'
import type { AppRole } from '@/lib/utils/rbac'
import { generateJSON, aiMeta } from '@/lib/ai/client'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId
    const { id } = params

    // Load threat + identity
    const [threat] = await db
      .select()
      .from(identityThreats)
      .where(and(eq(identityThreats.id, id), eq(identityThreats.orgId, orgId)))
      .limit(1)

    if (!threat) {
      return NextResponse.json({ error: 'Threat not found' }, { status: 404 })
    }

    const [identity] = await db
      .select()
      .from(identities)
      .where(eq(identities.id, threat.identityId))
      .limit(1)

    // Build triage prompt
    const context = `Threat: ${threat.threatType} (${threat.severity})
Kill Chain Phase: ${threat.killChainPhase}
MITRE ATT&CK: ${threat.mitreTechniqueIds?.join(', ') || 'N/A'}
Confidence: ${threat.confidence}%
Identity: ${identity?.displayName || 'Unknown'} (Type: ${identity?.subType}, Tier: ${identity?.adTier}, Risk: ${identity?.riskScore})
Source IP: ${threat.sourceIp || 'N/A'}
Source Location: ${threat.sourceLocation || 'N/A'}
Target Resource: ${threat.targetResource || 'N/A'}
Evidence: ${JSON.stringify(threat.evidence)}
First Seen: ${threat.firstSeenAt}
Last Seen: ${threat.lastSeenAt}`

    // Provider chain via the shared client, then deterministic triage
    const ai = await generateJSON(
      {
        label: 'threat-triage',
        system: THREAT_TRIAGE_PROMPT,
        prompt: context,
        temperature: 0.3,
        maxTokens: 1024,
        timeoutMs: 120_000,
      },
      (parsed) => (parsed && (parsed.assessment || parsed.narrative) ? parsed : null),
    )
    const meta = aiMeta(ai)
    const triage: any = ai.ok ? ai.data : generateFallbackTriage(threat, identity)

    // Save narrative to threat
    await db
      .update(identityThreats)
      .set({ aiNarrative: triage.narrative || triage.assessment })
      .where(eq(identityThreats.id, id))

    return NextResponse.json({ ...triage, ...meta })
  } catch (err: any) {
    console.error('[Threat Triage] Error:', err)
    return NextResponse.json({ error: 'Triage failed', details: err.message }, { status: 500 })
  }
}

function generateFallbackTriage(threat: any, identity: any): any {
  const severityMap: Record<string, string> = {
    critical: 'IMMEDIATE ACTION REQUIRED',
    high: 'Urgent investigation recommended',
    medium: 'Investigation recommended within 24 hours',
    low: 'Review during next security assessment',
  }

  const recommendations: string[] = []

  if (threat.threatType === 'password_spray' || threat.threatType === 'credential_stuffing') {
    recommendations.push('Reset passwords for targeted accounts')
    recommendations.push('Enforce MFA for affected identities')
    recommendations.push('Block source IP at firewall level')
  } else if (threat.threatType === 'mfa_fatigue') {
    recommendations.push('Contact user to verify MFA push requests')
    recommendations.push('Temporarily disable push MFA and switch to FIDO2/hardware token')
    recommendations.push('Review account for signs of compromise')
  } else if (threat.threatType === 'privilege_escalation') {
    recommendations.push('Immediately remove unauthorized group membership')
    recommendations.push('Review all recent changes by this identity')
    recommendations.push('Check for persistence mechanisms')
  } else if (threat.threatType === 'dcsync') {
    recommendations.push('CRITICAL: Isolate the source system immediately')
    recommendations.push('Reset KRBTGT password (twice, with 12-hour gap)')
    recommendations.push('Full AD security assessment required')
  } else if (threat.threatType === 'golden_ticket') {
    recommendations.push('Reset KRBTGT password twice')
    recommendations.push('Investigate all Tier 0 accounts for compromise')
    recommendations.push('Full incident response engagement recommended')
  } else {
    recommendations.push('Investigate source IP and activity patterns')
    recommendations.push('Review identity access history')
    recommendations.push('Consider temporary access restriction')
  }

  return {
    assessment: severityMap[threat.severity] || 'Review required',
    narrative: `Detected ${threat.threatType} activity involving identity "${identity?.displayName || 'Unknown'}" with ${threat.confidence}% confidence. This maps to MITRE ATT&CK technique(s) ${threat.mitreTechniqueIds?.join(', ') || 'N/A'} in the ${threat.killChainPhase} phase. ${recommendations[0]}.`,
    riskLevel: threat.severity,
    recommendations,
    containmentSteps: [
      'Disable affected account temporarily',
      'Block source IP if identified',
      'Preserve logs for forensic analysis',
    ],
    investigationSteps: [
      'Correlate with other security events in the same timeframe',
      'Check for similar patterns across other identities',
      'Review network logs for additional indicators',
    ],
  }
}
