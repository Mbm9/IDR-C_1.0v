import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { automationRules, identities, policyViolations } from '@/lib/db/schema'
import { eq, and, count, gte, lte } from 'drizzle-orm'

/**
 * POST /api/automation-rules/[id]/dry-run
 *
 * Simulate a rule execution without making changes.
 * Returns matched entities and what actions WOULD be taken.
 */
export const POST = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const ruleId = req.nextUrl.pathname.split('/').slice(-2, -1)[0]

  const [rule] = await db.select()
    .from(automationRules)
    .where(and(eq(automationRules.id, ruleId), eq(automationRules.orgId, orgId)))
    .limit(1)

  if (!rule) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  const condition = (rule.triggerCondition || {}) as Record<string, any>
  let matchedCount = 0
  let matchedEntities: { id: string; name: string; type: string }[] = []
  let wouldExecute = ''

  switch (rule.triggerType) {
    case 'time_elapsed': {
      const thresholdDays = condition.thresholdDays || 90
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - thresholdDays)

      const matches = await db.select({
        id: identities.id,
        name: identities.displayName,
        type: identities.type,
      })
        .from(identities)
        .where(and(
          eq(identities.orgId, orgId),
          eq(identities.status, 'active'),
          lte(identities.lastLogonAt, cutoff),
        ))
        .limit(50)

      matchedEntities = matches.map(m => ({ id: m.id, name: m.name, type: m.type }))
      matchedCount = matchedEntities.length
      wouldExecute = `Would ${rule.actionType.replace(/_/g, ' ')} for ${matchedCount} identities inactive ${thresholdDays}+ days`
      break
    }

    case 'threshold_breach': {
      const metric = condition.metric
      const threshold = condition.threshold || 0

      if (metric === 'riskScore') {
        const matches = await db.select({
          id: identities.id,
          name: identities.displayName,
          type: identities.type,
        })
          .from(identities)
          .where(and(eq(identities.orgId, orgId), gte(identities.riskScore, threshold)))
          .limit(50)

        matchedEntities = matches.map(m => ({ id: m.id, name: m.name, type: m.type }))
        matchedCount = matchedEntities.length
        wouldExecute = `Would ${rule.actionType.replace(/_/g, ' ')} — ${matchedCount} identities with risk score >= ${threshold}`
      } else if (metric === 'openViolations') {
        const [result] = await db.select({ count: count() })
          .from(policyViolations)
          .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))

        matchedCount = Number(result?.count ?? 0)
        wouldExecute = matchedCount > threshold
          ? `Would trigger — ${matchedCount} open violations (threshold: ${threshold})`
          : `Would NOT trigger — ${matchedCount} open violations (threshold: ${threshold})`
      }
      break
    }

    case 'schedule': {
      wouldExecute = `Schedule-based rule (${condition.schedule || 'daily'}). Would execute on next scheduled run.`
      matchedCount = -1 // N/A
      break
    }

    default:
      wouldExecute = `Dry-run not supported for trigger type: ${rule.triggerType}`
  }

  log.info('Rule dry-run completed', { ruleId, matchedCount })

  return NextResponse.json({
    ruleId,
    ruleName: rule.name,
    triggerType: rule.triggerType,
    actionType: rule.actionType,
    matchedCount,
    matchedEntities: matchedEntities.slice(0, 20),
    wouldExecute,
    dryRun: true,
  })
}, { requiredRole: 'iam_admin' })
