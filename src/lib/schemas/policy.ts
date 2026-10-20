import { z } from 'zod'
import { severitySchema } from './common'

const policyTypeSchema = z.enum([
  'access_policy', 'tiering_rule', 'sod_rule', 'password_policy',
  'mfa_policy', 'lifecycle_policy', 'certification_policy',
])

export const policyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: policyTypeSchema,
  definition: z.record(z.string(), z.any()),
  severity: severitySchema,
  enabled: z.boolean().default(true),
  frameworkMappings: z.record(z.string(), z.any()).default({}),
  orgId: z.string().uuid(),
})

export const policySchema = policyCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export type Policy = z.infer<typeof policySchema>
export type PolicyCreate = z.infer<typeof policyCreateSchema>
