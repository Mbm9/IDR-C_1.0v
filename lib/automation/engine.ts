import { db } from '@/lib/db'
import {
  automationRules, identities, actionLog, notifications,
  policyViolations, policies,
} from '@/lib/db/schema'
import { eq, and, sql, gte, lte, count, inArray } from 'drizzle-orm'

interface EvaluationResult {
  triggered: number
  actions: string[]
}

async function checkDataChange(rule: any, orgId: string): Promise<boolean> {
  if (!rule.lastTriggeredAt) return true // first run, always trigger

  const condition = rule.triggerCondition as any
  const actionTypes = condition?.actionTypes || []

  if (actionTypes.length === 0) return false

  const [result] = await db.select({ count: count() })
    .from(actionLog)
    .where(and(
      eq(actionLog.orgId, orgId),
      gte(actionLog.createdAt, rule.lastTriggeredAt),
      inArray(actionLog.actionType, actionTypes),
    ))

  return Number(result?.count ?? 0) > 0
}

async function checkThresholdBreach(rule: any, orgId: string): Promise<boolean> {
  const condition = rule.triggerCondition as any
  const metric = condition?.metric
  const operator = condition?.operator || '>'
  const threshold = condition?.threshold

  if (!metric || threshold == null) return false

  if (metric === 'riskScore') {
    const [result] = await db.select({ count: count() })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        operator === '>' ? gte(identities.riskScore, threshold) : lte(identities.riskScore, threshold),
      ))
    return Number(result?.count ?? 0) > 0
  }

  if (metric === 'openViolations') {
    const [result] = await db.select({ count: count() })
      .from(policyViolations)
      .where(and(
        eq(policyViolations.orgId, orgId),
        eq(policyViolations.status, 'open'),
      ))
    return Number(result?.count ?? 0) > threshold
  }

  return false
}

function checkSchedule(rule: any): boolean {
  const condition = rule.triggerCondition as any
  const schedule = condition?.schedule // 'daily' | 'weekly' | 'monthly'

  if (!schedule) return false

  const now = new Date()
  const lastTriggered = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt) : null

  if (!lastTriggered) return true

  const hoursSince = (now.getTime() - lastTriggered.getTime()) / (1000 * 60 * 60)

  if (schedule === 'daily' && hoursSince >= 24) return true
  if (schedule === 'weekly' && hoursSince >= 168) return true
  if (schedule === 'monthly' && hoursSince >= 720) return true

  return false
}

async function checkTimeElapsed(rule: any, orgId: string): Promise<boolean> {
  const condition = rule.triggerCondition as any
  const thresholdDays = condition?.thresholdDays || 90

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - thresholdDays)

  const [result] = await db.select({ count: count() })
    .from(identities)
    .where(and(
      eq(identities.orgId, orgId),
      eq(identities.status, 'active'),
      lte(identities.lastLogonAt, cutoff),
    ))

  return Number(result?.count ?? 0) > 0
}

async function executeAction(rule: any, orgId: string): Promise<string> {
  const actionParams = (rule.actionParams as any) || {}

  switch (rule.actionType) {
    case 'disable_identity': {
      const thresholdDays = (rule.triggerCondition as any)?.thresholdDays || 90
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - thresholdDays)

      const result = await db.update(identities)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(and(
          eq(identities.orgId, orgId),
          eq(identities.status, 'active'),
          lte(identities.lastLogonAt, cutoff),
        ))

      return `Disabled dormant identities (inactive ${thresholdDays}+ days)`
    }

    case 'create_alert': {
      const severity = actionParams.severity || 'medium'
      const title = actionParams.title || `Automation Rule: ${rule.name}`
      const message = actionParams.message || `Rule "${rule.name}" was triggered`
      const targets = rule.notifyTargets || []

      // Notify target roles
      if (targets.length > 0) {
        const targetUsers = await db.select({ id: sql<string>`${sql.raw("users.id")}` })
          .from(sql`users`)
          .where(and(
            sql`users.org_id = ${orgId}`,
            inArray(sql`users.app_role`, targets),
          ))

        for (const user of targetUsers) {
          await db.insert(notifications).values({
            orgId,
            userId: user.id,
            type: 'system',
            title,
            message,
            severity,
          })
        }
      }

      return `Created alert: ${title}`
    }

    case 'create_violation': {
      const severity = actionParams.severity || 'medium'
      const violationType = actionParams.violationType || 'excessive_privilege'

      // Get a default policy for the org
      const [policy] = await db.select({ id: policies.id })
        .from(policies)
        .where(eq(policies.orgId, orgId))
        .limit(1)

      if (!policy) return 'No policy found for violation creation'

      // Find identities matching the condition
      const thresholdDays = (rule.triggerCondition as any)?.thresholdDays || 90
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - thresholdDays)

      const matchingIdentities = await db.select({ id: identities.id })
        .from(identities)
        .where(and(
          eq(identities.orgId, orgId),
          eq(identities.status, 'active'),
          lte(identities.lastLogonAt, cutoff),
        ))
        .limit(50)

      for (const identity of matchingIdentities) {
        await db.insert(policyViolations).values({
          policyId: policy.id,
          identityId: identity.id,
          violationType,
          severity,
          status: 'open',
          orgId,
        })
      }

      return `Created ${matchingIdentities.length} violations (${violationType})`
    }

    case 'update_status': {
      const newStatus = actionParams.newStatus || 'suspended'
      const thresholdDays = (rule.triggerCondition as any)?.thresholdDays || 90
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - thresholdDays)

      await db.update(identities)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(
          eq(identities.orgId, orgId),
          eq(identities.status, 'active'),
          lte(identities.lastLogonAt, cutoff),
        ))

      return `Updated identity statuses to ${newStatus}`
    }

    case 'notify': {
      const title = actionParams.title || `Automation: ${rule.name}`
      const message = actionParams.message || `Rule "${rule.name}" was triggered`
      const targets = rule.notifyTargets || []

      if (targets.length > 0) {
        const targetUsers = await db.select({ id: sql<string>`${sql.raw("users.id")}` })
          .from(sql`users`)
          .where(and(
            sql`users.org_id = ${orgId}`,
            inArray(sql`users.app_role`, targets),
          ))

        for (const user of targetUsers) {
          await db.insert(notifications).values({
            orgId,
            userId: user.id,
            type: 'system',
            title,
            message,
            severity: 'info',
          })
        }
      }

      return `Sent notifications for rule: ${rule.name}`
    }

    default:
      return `Unknown action type: ${rule.actionType}`
  }
}

export async function evaluateRules(orgId: string): Promise<EvaluationResult> {
  const rules = await db.select()
    .from(automationRules)
    .where(and(
      eq(automationRules.orgId, orgId),
      eq(automationRules.enabled, true),
    ))

  let triggered = 0
  const actions: string[] = []

  for (const rule of rules) {
    let shouldTrigger = false

    switch (rule.triggerType) {
      case 'data_change':
        shouldTrigger = await checkDataChange(rule, orgId)
        break
      case 'threshold_breach':
        shouldTrigger = await checkThresholdBreach(rule, orgId)
        break
      case 'schedule':
        shouldTrigger = checkSchedule(rule)
        break
      case 'time_elapsed':
        shouldTrigger = await checkTimeElapsed(rule, orgId)
        break
    }

    if (shouldTrigger) {
      const actionResult = await executeAction(rule, orgId)
      actions.push(actionResult)

      // Log automated action
      // Use a system actor ID - first admin user in the org
      const [systemActor] = await db.select({ id: sql<string>`${sql.raw("users.id")}` })
        .from(sql`users`)
        .where(and(
          sql`users.org_id = ${orgId}`,
          sql`users.app_role = 'admin'`,
        ))
        .limit(1)

      if (systemActor) {
        await db.insert(actionLog).values({
          actionType: 'assess_identity',
          actorIdentityId: systemActor.id,
          payload: { ruleId: rule.id, ruleName: rule.name, action: actionResult },
          rationale: `Automated rule: ${rule.name}`,
          source: 'automated',
          orgId,
        })
      }

      // Update rule trigger count and timestamp
      await db.update(automationRules)
        .set({
          lastTriggeredAt: new Date(),
          triggerCount: sql`${automationRules.triggerCount} + 1`,
        })
        .where(eq(automationRules.id, rule.id))

      triggered++
    }
  }

  return { triggered, actions }
}
