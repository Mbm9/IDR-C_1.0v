import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  organizations, identities, policyViolations, briefings,
  notifications, actionLog, webhookEndpoints, users,
} from '@/lib/db/schema'
import { eq, and, count, sql, desc, gte } from 'drizzle-orm'
import { DAILY_BRIEFING_PROMPT, BRIEFING_TRANSLATION_PROMPT } from '@/lib/ai/prompts'
import { verifyCronSecret } from '@/lib/auth/cron'
import { generateJSON } from '@/lib/ai/client'
import {
  buildDeterministicBriefing, fromAIBriefing, parseAIBriefing, toStoredHighlights,
  toEnglishNarrative, visibleHighlights, type AIBriefingJSON, type BriefingContent,
  type BriefingMetrics,
} from '@/lib/ai/briefing'

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

/**
 * AI briefing (English) plus, when the provider answers, an Arabic translation
 * of the same JSON so the Arabic UI does not show English model output.
 * Returns null when no provider is available; the caller then uses the
 * deterministic, message-keyed briefing which is rendered per locale on read.
 */
async function generateAIBriefing(userPrompt: string): Promise<BriefingContent | null> {
  const ai = await generateJSON(
    {
      label: 'daily-briefing',
      system: DAILY_BRIEFING_PROMPT,
      prompt: userPrompt,
      temperature: 0.3,
      maxTokens: 1024,
      timeoutMs: 120_000,
    },
    parseAIBriefing,
  )
  if (!ai.ok) return null

  const translation = await generateJSON<AIBriefingJSON>(
    {
      label: 'daily-briefing-ar',
      system: BRIEFING_TRANSLATION_PROMPT,
      prompt: JSON.stringify(ai.data),
      temperature: 0.1,
      maxTokens: 1536,
      timeoutMs: 120_000,
    },
    parseAIBriefing,
  )

  return fromAIBriefing(ai.data, ai.model, translation.ok ? translation.data : null)
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

      // Try AI, fallback to deterministic (message keys, localized on read)
      const content: BriefingContent =
        (await generateAIBriefing(userPrompt)) ?? buildDeterministicBriefing(metrics, delta as BriefingMetrics)

      const storedHighlights = toStoredHighlights(content)
      const highlights = visibleHighlights(storedHighlights)
      const narrative = toEnglishNarrative(content)
      const headline = content.headline.text

      const deliveredVia: string[] = ['in_app']

      // Store briefing
      await db.insert(briefings).values({
        orgId: org.id,
        metrics,
        delta,
        narrative,
        highlights: storedHighlights,
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
          message: headline || 'Your daily briefing is ready',
          severity: 'info',
          link: '/dashboard',
          // Rendered in the reader's locale by GET /api/notifications.
          metadata: { i18n: { titleKey: 'briefing.notificationTitle', messageKey: 'briefing.notificationReady' } },
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
                data: { metrics, delta, narrative, highlights, generatedBy: content.generatedBy, model: content.model ?? null },
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
