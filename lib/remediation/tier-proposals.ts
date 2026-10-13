/**
 * Tier Violation Remediation Proposal Generator
 *
 * Scans for tier violations and generates actionable remediation proposals
 * that require human approval before execution. Each proposal contains
 * specific actions (revoke entitlement or reclassify identity) with
 * justification and impact assessment.
 *
 * Flow:
 *   1. Scan → detect tier violations
 *   2. Generate → create proposals with specific actions
 *   3. Review → human reviews in remediation queue
 *   4. Approve → CISO/IAM Admin approves (or rejects)
 *   5. Execute → system performs the approved actions
 *   6. Audit → everything logged in action_log
 */

import { db } from '@/lib/db'
import {
  identities, entitlements, policyViolations, remediationPlans,
} from '@/lib/db/schema'
import { eq, and, desc, sql, count } from 'drizzle-orm'
import { logger } from '@/lib/logger'
import { logAction } from '@/lib/actions/helpers'

const log = logger.child({ module: 'tier-remediation' })

export interface RemediationAction {
  priority: number
  actionType: 'revoke_entitlement' | 'reclassify_tier' | 'disable_identity' | 'flag_for_review'
  targetIdentityId: string
  targetIdentityName: string
  targetEntitlementId?: string
  description: string
  justification: string
  currentTier: string
  effectiveTier: string
  riskScore: number
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
}

/**
 * Scan for all tier violations in an org and generate a remediation plan.
 * Returns a plan ID that can be reviewed and approved.
 */
export async function generateTierRemediationProposals(orgId: string): Promise<{
  planId: string
  totalViolations: number
  proposedActions: number
}> {
  log.info('Generating tier remediation proposals', { orgId })

  // Find all identities with tier violations
  const violatingIdentities = await db
    .select({
      id: identities.id,
      displayName: identities.displayName,
      type: identities.type,
      subType: identities.subType,
      adTier: identities.adTier,
      effectiveTier: identities.effectiveTier,
      riskScore: identities.riskScore,
      status: identities.status,
    })
    .from(identities)
    .where(and(
      eq(identities.orgId, orgId),
      eq(identities.tierViolation, true),
      eq(identities.status, 'active'),
    ))
    .orderBy(desc(identities.riskScore))

  if (violatingIdentities.length === 0) {
    log.info('No tier violations found', { orgId })
    // Create an empty plan to record the scan
    const [plan] = await db.insert(remediationPlans).values({
      generatedBy: 'ai',
      inputParams: { type: 'tier_remediation', scanTime: new Date().toISOString() },
      rankedActions: [],
      executiveSummary: 'No tier violations detected. Identity posture is clean.',
      projectedRiskReduction: 0,
      quickWins: [],
      status: 'completed',
      orgId,
    }).returning()

    return { planId: plan.id, totalViolations: 0, proposedActions: 0 }
  }

  // For each violating identity, determine the best remediation action
  const actions: RemediationAction[] = []
  let priority = 1

  for (const identity of violatingIdentities) {
    // Get the cross-tier entitlements causing the violation
    const crossTierEntitlements = await db
      .select({
        id: entitlements.id,
        permissionName: entitlements.permissionName,
        permissionScope: entitlements.permissionScope,
        adTierOfPermission: entitlements.adTierOfPermission,
        lastUsedAt: entitlements.lastUsedAt,
      })
      .from(entitlements)
      .where(and(
        eq(entitlements.identityId, identity.id),
        eq(entitlements.orgId, orgId),
      ))

    // Find entitlements that are above the identity's assigned tier
    const tierRank: Record<string, number> = { tier_0: 0, tier_1: 1, tier_2: 2, unclassified: 3 }
    const identityTierRank = tierRank[identity.adTier] ?? 3

    const violatingEntitlements = crossTierEntitlements.filter(e => {
      const entTierRank = tierRank[e.adTierOfPermission ?? 'unclassified'] ?? 3
      return entTierRank < identityTierRank // Lower rank = higher tier = violation
    })

    if (violatingEntitlements.length > 0) {
      // Propose revoking each cross-tier entitlement
      for (const ent of violatingEntitlements) {
        const daysSinceUsed = ent.lastUsedAt
          ? Math.floor((Date.now() - new Date(ent.lastUsedAt).getTime()) / (86400 * 1000))
          : null

        const isUnused = daysSinceUsed === null || daysSinceUsed > 90

        actions.push({
          priority: priority++,
          actionType: 'revoke_entitlement',
          targetIdentityId: identity.id,
          targetIdentityName: identity.displayName,
          targetEntitlementId: ent.id,
          description: `Revoke "${ent.permissionName}" from ${identity.displayName}`,
          justification: `${identity.adTier} identity has ${ent.adTierOfPermission} permission "${ent.permissionName}"${ent.permissionScope ? ` on ${ent.permissionScope}` : ''}.${isUnused ? ' This permission has not been used in 90+ days.' : ''}`,
          currentTier: identity.adTier,
          effectiveTier: identity.effectiveTier ?? 'unknown',
          riskScore: identity.riskScore,
          effort: isUnused ? 'low' : 'medium',
          impact: ent.adTierOfPermission === 'tier_0' ? 'high' : 'medium',
        })
      }
    } else {
      // No specific entitlement found — propose reclassification or review
      actions.push({
        priority: priority++,
        actionType: identity.riskScore > 70 ? 'reclassify_tier' : 'flag_for_review',
        targetIdentityId: identity.id,
        targetIdentityName: identity.displayName,
        description: identity.riskScore > 70
          ? `Reclassify ${identity.displayName} from ${identity.adTier} to ${identity.effectiveTier}`
          : `Review tier assignment for ${identity.displayName}`,
        justification: `${identity.displayName} (${identity.type}/${identity.subType}) is assigned ${identity.adTier} but has effective access at ${identity.effectiveTier} level. Risk score: ${identity.riskScore}.`,
        currentTier: identity.adTier,
        effectiveTier: identity.effectiveTier ?? 'unknown',
        riskScore: identity.riskScore,
        effort: 'medium',
        impact: identity.effectiveTier === 'tier_0' ? 'high' : 'medium',
      })
    }
  }

  // Sort by risk score descending (highest risk first)
  actions.sort((a, b) => b.riskScore - a.riskScore)
  actions.forEach((a, i) => { a.priority = i + 1 })

  const quickWins = actions.filter(a => a.effort === 'low' && a.impact === 'high')
  const totalRiskReduction = Math.min(100, actions.length * 3)

  const summary = [
    `Found ${violatingIdentities.length} identities with tier violations.`,
    `Proposing ${actions.length} remediation actions.`,
    `${quickWins.length} quick wins (low effort, high impact) identified.`,
    actions.some(a => a.effectiveTier === 'tier_0')
      ? 'CRITICAL: Tier 0 (Domain Controller level) violations detected — prioritize these.'
      : '',
  ].filter(Boolean).join(' ')

  // Save as remediation plan awaiting approval
  const [plan] = await db.insert(remediationPlans).values({
    generatedBy: 'ai',
    inputParams: {
      type: 'tier_remediation',
      scanTime: new Date().toISOString(),
      totalViolatingIdentities: violatingIdentities.length,
    },
    rankedActions: actions,
    executiveSummary: summary,
    projectedRiskReduction: totalRiskReduction,
    quickWins,
    status: 'draft', // Awaiting human approval
    orgId,
  }).returning()

  log.info('Tier remediation plan created', {
    planId: plan.id,
    violations: violatingIdentities.length,
    actions: actions.length,
    quickWins: quickWins.length,
  })

  return {
    planId: plan.id,
    totalViolations: violatingIdentities.length,
    proposedActions: actions.length,
  }
}

/**
 * Execute approved remediation actions from a plan.
 * Only runs actions from plans with status 'approved'.
 */
export async function executeApprovedActions(
  planId: string,
  orgId: string,
  approvedBy: string,
): Promise<{
  executed: number
  failed: number
  results: { action: string; success: boolean; error?: string }[]
}> {
  const [plan] = await db.select()
    .from(remediationPlans)
    .where(and(eq(remediationPlans.id, planId), eq(remediationPlans.orgId, orgId)))
    .limit(1)

  if (!plan) throw new Error('Plan not found')
  if (plan.status !== 'approved') throw new Error(`Plan status is '${plan.status}', expected 'approved'`)

  const actions = (plan.rankedActions as RemediationAction[]) || []
  const results: { action: string; success: boolean; error?: string }[] = []
  let executed = 0
  let failed = 0

  for (const action of actions) {
    try {
      switch (action.actionType) {
        case 'revoke_entitlement': {
          if (!action.targetEntitlementId) {
            results.push({ action: action.description, success: false, error: 'No entitlement ID' })
            failed++
            continue
          }
          await db.update(entitlements)
            .set({ certificationStatus: 'revoked' })
            .where(eq(entitlements.id, action.targetEntitlementId))

          // Mark related violations as remediated
          await db.update(policyViolations)
            .set({
              status: 'remediated',
              remediatedAt: new Date(),
              // remediated_by is a foreign key to identities, but approvedBy is
              // an app user id; the approver is recorded in action_log below.
            })
            .where(and(
              eq(policyViolations.identityId, action.targetIdentityId),
              eq(policyViolations.entitlementId, action.targetEntitlementId),
              eq(policyViolations.status, 'open'),
            ))

          await logAction({
            actionType: 'revoke_access',
            actorIdentityId: approvedBy,
            orgId,
            targetIdentityId: action.targetIdentityId,
            targetEntitlementId: action.targetEntitlementId,
            rationale: `Approved remediation: ${action.justification}`,
            payload: { planId, actionPriority: action.priority },
            source: 'automated',
          })
          break
        }

        case 'reclassify_tier': {
          await db.update(identities)
            .set({
              adTier: action.effectiveTier as any,
              updatedAt: new Date(),
            })
            .where(eq(identities.id, action.targetIdentityId))

          await logAction({
            actionType: 'update_tier',
            actorIdentityId: approvedBy,
            orgId,
            targetIdentityId: action.targetIdentityId,
            rationale: `Approved reclassification: ${action.justification}`,
            payload: {
              planId,
              previousTier: action.currentTier,
              newTier: action.effectiveTier,
            },
            source: 'automated',
          })
          break
        }

        case 'flag_for_review':
          // No-op — just logged
          await logAction({
            actionType: 'assess_identity',
            actorIdentityId: approvedBy,
            orgId,
            targetIdentityId: action.targetIdentityId,
            rationale: `Flagged for manual review: ${action.justification}`,
            payload: { planId },
            source: 'automated',
          })
          break

        case 'disable_identity':
          await db.update(identities)
            .set({ status: 'disabled', updatedAt: new Date() })
            .where(eq(identities.id, action.targetIdentityId))

          await logAction({
            actionType: 'assess_identity',
            actorIdentityId: approvedBy,
            orgId,
            targetIdentityId: action.targetIdentityId,
            rationale: `Approved disable: ${action.justification}`,
            payload: { planId },
            source: 'automated',
          })
          break
      }

      results.push({ action: action.description, success: true })
      executed++
    } catch (err: any) {
      results.push({ action: action.description, success: false, error: err.message })
      failed++
      log.error('Remediation action failed', {
        planId, action: action.description, error: err.message,
      })
    }
  }

  // Update plan status
  await db.update(remediationPlans)
    .set({ status: 'completed' })
    .where(eq(remediationPlans.id, planId))

  log.info('Remediation plan executed', { planId, executed, failed })

  return { executed, failed, results }
}
