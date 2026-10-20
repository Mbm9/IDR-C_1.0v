import { z } from 'zod'
import { platformSchema, accountTypeSchema } from './common'

export const accountCreateSchema = z.object({
  identityId: z.string().uuid(),
  platform: platformSchema,
  accountName: z.string().min(1).max(255),
  accountType: accountTypeSchema,
  enabled: z.boolean().default(true),
  lastAuthenticatedAt: z.string().datetime().optional().nullable(),
  mfaEnabled: z.boolean().default(false),
  mfaMethods: z.array(z.string()).default([]),
  privileged: z.boolean().default(false),
  orgId: z.string().uuid(),
})

export const accountSchema = accountCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export type Account = z.infer<typeof accountSchema>
export type AccountCreate = z.infer<typeof accountCreateSchema>
