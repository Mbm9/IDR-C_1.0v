import { z } from 'zod'
import { severitySchema, violationTypeSchema, violationStatusSchema } from './common'

export const policyViolationCreateSchema = z.object({
  policyId: z.string().uuid(),
  identityId: z.string().uuid(),
  entitlementId: z.string().uuid().optional().nullable(),
  violationType: violationTypeSchema,
  severity: severitySchema,
  status: violationStatusSchema.default('open'),
  orgId: z.string().uuid(),
})

export const policyViolationUpdateSchema = z.object({
  status: violationStatusSchema.optional(),
  remediatedBy: z.string().uuid().optional().nullable(),
  exceptionReason: z.string().max(1000).optional().nullable(),
  exceptionApprovedBy: z.string().uuid().optional().nullable(),
  exceptionExpiresAt: z.string().datetime().optional().nullable(),
})

export const policyViolationSchema = policyViolationCreateSchema.extend({
  id: z.string().uuid(),
  detectedAt: z.string().datetime(),
  remediatedAt: z.string().datetime().nullable(),
  remediatedBy: z.string().uuid().nullable(),
  exceptionReason: z.string().nullable(),
  exceptionApprovedBy: z.string().uuid().nullable(),
  exceptionExpiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export type PolicyViolation = z.infer<typeof policyViolationSchema>
export type PolicyViolationCreate = z.infer<typeof policyViolationCreateSchema>
export type PolicyViolationUpdate = z.infer<typeof policyViolationUpdateSchema>
