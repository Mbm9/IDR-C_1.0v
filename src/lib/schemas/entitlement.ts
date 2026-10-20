import { z } from 'zod'
import { adTierSchema, permissionTypeSchema, certificationStatusSchema } from './common'

export const entitlementCreateSchema = z.object({
  identityId: z.string().uuid(),
  resourceId: z.string().uuid(),
  permissionType: permissionTypeSchema,
  permissionName: z.string().min(1).max(255),
  permissionScope: z.string().max(500).optional(),
  adTierOfPermission: adTierSchema,
  grantedAt: z.string().datetime().optional(),
  grantedBy: z.string().max(255).optional(),
  lastUsedAt: z.string().datetime().optional().nullable(),
  certifiable: z.boolean().default(true),
  certificationStatus: certificationStatusSchema.default('pending'),
  lastCertifiedAt: z.string().datetime().optional().nullable(),
  certifiedBy: z.string().uuid().optional().nullable(),
  riskTags: z.array(z.string()).default([]),
  orgId: z.string().uuid(),
})

export const entitlementUpdateSchema = entitlementCreateSchema.partial().omit({
  orgId: true,
  identityId: true,
  resourceId: true,
})

export const entitlementSchema = entitlementCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export type Entitlement = z.infer<typeof entitlementSchema>
export type EntitlementCreate = z.infer<typeof entitlementCreateSchema>
export type EntitlementUpdate = z.infer<typeof entitlementUpdateSchema>
