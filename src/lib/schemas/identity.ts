import { z } from 'zod'
import {
  identityTypeSchema,
  identitySubTypeSchema,
  identityStatusSchema,
  adTierSchema,
  sourceSystemSchema,
  paginationSchema,
  sortSchema,
} from './common'

export const identityCreateSchema = z.object({
  displayName: z.string().min(1).max(255),
  type: identityTypeSchema,
  subType: identitySubTypeSchema,
  status: identityStatusSchema.default('active'),
  adTier: adTierSchema.default('unclassified'),
  sourceSystem: sourceSystemSchema,
  sourceId: z.string().max(255).optional(),
  upn: z.string().max(255).optional(),
  samAccountName: z.string().max(255).optional(),
  email: z.string().email().optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  managerIdentityId: z.string().uuid().optional().nullable(),
  lastLogonAt: z.string().datetime().optional().nullable(),
  passwordLastSetAt: z.string().datetime().optional().nullable(),
  createdInSourceAt: z.string().datetime().optional(),
  ownerIdentityId: z.string().uuid().optional().nullable(),
  expiryAt: z.string().datetime().optional().nullable(),
  orgId: z.string().uuid(),
})

export const identityUpdateSchema = identityCreateSchema.partial().omit({ orgId: true })

export const identitySchema = identityCreateSchema.extend({
  id: z.string().uuid(),
  effectiveTier: adTierSchema.nullable(),
  tierViolation: z.boolean(),
  riskScore: z.number().int().min(0).max(100),
  riskFactors: z.any().default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const identityFilterSchema = paginationSchema.merge(sortSchema).extend({
  type: identityTypeSchema.optional(),
  subType: identitySubTypeSchema.optional(),
  adTier: adTierSchema.optional(),
  status: identityStatusSchema.optional(),
  sourceSystem: sourceSystemSchema.optional(),
  riskScoreMin: z.coerce.number().int().min(0).max(100).optional(),
  riskScoreMax: z.coerce.number().int().min(0).max(100).optional(),
  tierViolation: z.coerce.boolean().optional(),
  search: z.string().max(255).optional(),
})

export type Identity = z.infer<typeof identitySchema>
export type IdentityCreate = z.infer<typeof identityCreateSchema>
export type IdentityUpdate = z.infer<typeof identityUpdateSchema>
export type IdentityFilter = z.infer<typeof identityFilterSchema>
