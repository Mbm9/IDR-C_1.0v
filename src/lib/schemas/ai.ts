import { z } from 'zod'

export const aiAnalysisRequestSchema = z.object({
  budget: z.number().positive().optional(),
  timelineDays: z.number().int().positive().optional(),
  riskAppetite: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  focusAreas: z.array(z.string()).optional(),
})

const aiRecommendedActionSchema = z.object({
  priority: z.number().int().positive(),
  actionType: z.string(),
  targetIdentityId: z.string().uuid().optional(),
  targetEntitlementId: z.string().uuid().optional(),
  description: z.string(),
  justification: z.string(),
  effort: z.enum(['low', 'medium', 'high']),
  impact: z.enum(['low', 'medium', 'high']),
  estimatedRiskReduction: z.number().min(0).max(100),
})

export const aiAnalysisResponseSchema = z.object({
  rankedActions: z.array(aiRecommendedActionSchema),
  executiveSummary: z.string(),
  projectedRiskReduction: z.number().int().min(0).max(100),
  quickWins: z.array(aiRecommendedActionSchema),
  toxicCombinations: z.array(z.object({
    identityId: z.string().uuid(),
    entitlementIds: z.array(z.string().uuid()),
    description: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
  })).optional(),
  anomalies: z.array(z.object({
    identityId: z.string().uuid(),
    narrative: z.string(),
    riskContribution: z.number(),
  })).optional(),
})

export const remediationPlanSchema = z.object({
  id: z.string().uuid(),
  generatedAt: z.string().datetime(),
  generatedBy: z.enum(['ai', 'manual']),
  inputParams: aiAnalysisRequestSchema,
  rankedActions: z.array(aiRecommendedActionSchema),
  executiveSummary: z.string(),
  projectedRiskReduction: z.number().int().min(0).max(100),
  quickWins: z.array(aiRecommendedActionSchema),
  status: z.enum(['draft', 'approved', 'in_progress', 'completed', 'rejected']),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  orgId: z.string().uuid(),
})

export type AIAnalysisRequest = z.infer<typeof aiAnalysisRequestSchema>
export type AIAnalysisResponse = z.infer<typeof aiAnalysisResponseSchema>
export type RemediationPlan = z.infer<typeof remediationPlanSchema>
