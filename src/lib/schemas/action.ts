import { z } from 'zod'
import { adTierSchema } from './common'

// Certify Entitlement
export const certifyEntitlementInputSchema = z.object({
  entitlementId: z.string().uuid(),
  rationale: z.string().max(1000).optional(),
})
export const certifyEntitlementOutputSchema = z.object({
  entitlementId: z.string().uuid(),
  certifiedAt: z.string().datetime(),
  certifiedBy: z.string().uuid(),
})

// Revoke Access
export const revokeAccessInputSchema = z.object({
  entitlementId: z.string().uuid(),
  rationale: z.string().min(1).max(1000),
})
export const revokeAccessOutputSchema = z.object({
  entitlementId: z.string().uuid(),
  revokedAt: z.string().datetime(),
})

// Approve Exception
export const approveExceptionInputSchema = z.object({
  violationId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  expiresAt: z.string().datetime(),
})
export const approveExceptionOutputSchema = z.object({
  violationId: z.string().uuid(),
  approvedAt: z.string().datetime(),
  approvedBy: z.string().uuid(),
  expiresAt: z.string().datetime(),
})

// Escalate Risk
export const escalateRiskInputSchema = z.object({
  identityId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  newRiskScore: z.number().int().min(0).max(100).optional(),
})
export const escalateRiskOutputSchema = z.object({
  identityId: z.string().uuid(),
  previousScore: z.number(),
  newScore: z.number(),
  escalatedAt: z.string().datetime(),
})

// Trigger Review
export const triggerReviewInputSchema = z.object({
  identityIds: z.array(z.string().uuid()).min(1),
  reviewType: z.enum(['access', 'certification', 'full']).default('access'),
  dueDate: z.string().datetime().optional(),
})
export const triggerReviewOutputSchema = z.object({
  reviewId: z.string().uuid(),
  identityCount: z.number(),
  triggeredAt: z.string().datetime(),
})

// Update Tier
export const updateTierInputSchema = z.object({
  identityId: z.string().uuid(),
  newTier: adTierSchema,
  rationale: z.string().min(1).max(1000),
})
export const updateTierOutputSchema = z.object({
  identityId: z.string().uuid(),
  previousTier: adTierSchema,
  newTier: adTierSchema,
  updatedAt: z.string().datetime(),
})

// Sync Source
export const syncSourceInputSchema = z.object({
  integrationId: z.string().uuid(),
})
export const syncSourceOutputSchema = z.object({
  integrationId: z.string().uuid(),
  recordCount: z.number().int(),
  syncedAt: z.string().datetime(),
  status: z.enum(['success', 'partial', 'error']),
})

// Acknowledge Violation
export const acknowledgeViolationInputSchema = z.object({
  violationId: z.string().uuid(),
  rationale: z.string().max(1000).optional(),
})
export const acknowledgeViolationOutputSchema = z.object({
  violationId: z.string().uuid(),
  acknowledgedAt: z.string().datetime(),
  acknowledgedBy: z.string().uuid(),
})

// Generate Recommendation
export const generateRecommendationInputSchema = z.object({
  budget: z.number().positive().optional(),
  timelineDays: z.number().int().positive().optional(),
  riskAppetite: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  focusAreas: z.array(z.string()).optional(),
})
export const generateRecommendationOutputSchema = z.object({
  planId: z.string().uuid(),
  generatedAt: z.string().datetime(),
})
