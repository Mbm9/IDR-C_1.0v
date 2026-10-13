import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  organizations, identities, policyViolations, briefings,
  notifications, actionLog, webhookEndpoints, users,
} from '@/lib/db/schema'
import { eq, and, count, sql, desc, gte } from 'drizzle-orm'
import { DAILY_BRIEFING_PROMPT } from '@/lib/ai/prompts'
import { verifyCronSecret } from '@/lib/auth/cron'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'

async function getOrgMetrics(orgId: string) {
  const [identityCount] = await db.select({ count: count() })
    .from(identities).where(eq(identities.orgId, orgId))

  const [violationCount] = await db.select({ count: count() })
    .from(policyViolations)
    .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))

  const [tierViolationCount] = await db.select({ count: count() })
    .from(identities)
    .where(and(eq(identities.orgId, orgId), eq(identities.tierViolation, true)))

  const [avgRisk] = await db.select({
    avg: sql<number>`round(avg(${identities.riskScore}))`,
  }).from(identities).where(eq(identities.orgId, orgId))

  return {
    totalIdentities: Number(identityCount?.count ?? 0),
    openViolations: Number(violationCount?.count ?? 0),
    tierViolations: Number(tierViolationCount?.count ?? 0),
    avgRiskScore: Number(avgRisk?.avg ?? 0),
  }
}

async function getRecentEvents(orgId: string) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const events = await db.select({
    actionType: actionLog.actionType,
    count: count(),
  })
    .from(actionLog)
    .where(and(
      eq(actionLog.orgId, orgId),
      gte(actionLog.createdAt, yesterday),
    ))
    .groupBy(actionLog.actionType)
    .limit(20)

  return events
}

async function callOllama(userPrompt: string): Promise<any | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: DAILY_BRIEFING_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        format: 'json',
      }),
    })
    if (!response.ok) return null
    const data = await response.json()
    const text = data.message?.content || ''
    return JSON.parse(text)
  } catch {
    return null
  }
}

function generateFallbackBriefing(metrics: any, delta: any, events: any[]) {
  const headline = delta.openViolations > 0
    ? `${delta.openViolations} new open violations detected overnight`
    : 'No significant changes overnight — posture is stable'

  const needsAttention: string[] = []
  const positives: string[] = []

  if (delta.openViolations > 0) needsAttention.push(`${delta.openViolations} new open violations`)
  if (delta.tierViolations > 0) needsAttention.push(`${delta.tierViolations} new tier violations`)
  if (delta.avgRiskScore > 2) needsAttention.push(`Average risk score increased by ${delta.avgRiskScore}`)

  if (delta.openViolations < 0) positives.push(`${Math.abs(delta.openViolations)} violations resolved`)
  if (delta.avgRiskScore < -2) positives.push(`Average risk score improved by ${Math.abs(delta.avgRiskScore)}`)
  if (delta.tierViolations < 0) positives.push(`${Math.abs(delta.tierViolations)} tier violations resolved`)

  if (!positives.length) positives.push('Maintaining current security posture')
  if (!needsAttention.length) needsAttention.push('No urgent items')

  return {
    headline,
    needsAttention,
    positives,
    insight: `Current posture: ${metrics.totalIdentities} identities, ${metrics.openViolations} open violations, avg risk ${metrics.avgRiskScore}.`,
    suggestedPriority: needsAttention[0] !== 'No urgent items'
      ? `Address the ${needsAttention[0]}`
      : 'Continue proactive review of expiring certifications',
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalBriefings = 0

    for (const org of allOrgs) {
      const metrics = await getOrgMetrics(org.id)
      const events = await getRecentEvents(org.id)

      // Get previous briefing for delta calculation
      const [prevBriefing] = await db.select({ metrics: briefings.metrics })
        .from(briefings)
        .where(eq(briefings.orgId, org.id))
        .orderBy(desc(briefings.generatedAt))
        .limit(1)

      const prevMetrics = (prevBriefing?.metrics as any) || {
        totalIdentities: 0,
        openViolations: 0,
        tierViolations: 0,
        avgRiskScore: 0,
      }

      const delta = {
        totalIdentities: metrics.totalIdentities - (prevMetrics.totalIdentities ?? 0),
        openViolations: metrics.openViolations - (prevMetrics.openViolations ?? 0),
        tierViolations: metrics.tierViolations - (prevMetrics.tierViolations ?? 0),
        avgRiskScore: metrics.avgRiskScore - (prevMetrics.avgRiskScore ?? 0),
      }

      const eventSummary = events.map(e => `${e.actionType}: ${e.count}`).join(', ')
      const userPrompt = `Metrics: ${JSON.stringify(metrics)}. 24h deltas: ${JSON.stringify(delta)}. Recent events: ${eventSummary || 'none'}. Generate the daily briefing.`

      // Try AI, fallback to deterministic
      let briefingData = await callOllama(userPrompt)
      if (!briefingData) {
        briefingData = generateFallbackBriefing(metrics, delta, events)
      }

      const highlights: Array<{ type: string; text: string }> = []
      if (briefingData.needsAttention) {
        for (const item of briefingData.needsAttention) {
          highlights.push({ type: 'negative', text: item })
        }
      }
      if (briefingData.positives) {
        for (const item of briefingData.positives) {
          highlights.push({ type: 'positive', text: item })
        }
      }
      if (briefingData.suggestedPriority) {
        highlights.push({ type: 'action', text: briefingData.suggestedPriority })
      }

      const narrative = [
        briefingData.headline,
        '',
        briefingData.insight,
        '',
        `Priority: ${briefingData.suggestedPriority}`,
      ].join('\n')

      const deliveredVia: string[] = ['in_app']

      // Store briefing
      await db.insert(briefings).values({
        orgId: org.id,
        metrics,
        delta,
        narrative,
        highlights,
        deliveredVia,
      })

      // Notify admin/ciso users
      const adminUsers = await db.select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.orgId, org.id),
          sql`${users.appRole} IN ('admin', 'ciso')`,
        ))

      for (const user of adminUsers) {
        await db.insert(notifications).values({
          orgId: org.id,
          userId: user.id,
          type: 'system',
          title: 'Daily Intelligence Briefing',
          message: briefingData.headline || 'Your daily briefing is ready',
          severity: 'info',
          link: '/dashboard',
        })
      }

      // Send to configured webhooks
      const webhooks = await db.select()
        .from(webhookEndpoints)
        .where(and(
          eq(webhookEndpoints.orgId, org.id),
          eq(webhookEndpoints.enabled, true),
        ))

      for (const wh of webhooks) {
        if (wh.events.includes('daily_briefing')) {
          try {
            await fetch(wh.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(wh.secret ? { 'X-Webhook-Secret': wh.secret } : {}),
              },
              body: JSON.stringify({
                event: 'daily_briefing',
                data: { metrics, delta, narrative, highlights },
              }),
            })
          } catch (err) {
            console.error(`Webhook delivery failed for ${wh.url}:`, err)
          }
        }
      }

      totalBriefings++
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${totalBriefings} daily briefings`,
      count: totalBriefings,
    })
  } catch (error) {
    console.error('Daily briefing cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Daily briefing failed', error: String(error) },
      { status: 500 }
    )
  }
}
