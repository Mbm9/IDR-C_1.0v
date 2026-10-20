import { z } from 'zod'
import { adTierSchema, sourceSystemSchema } from './common'

const groupTypeSchema = z.enum([
  'security', 'distribution', 'dynamic', 'role_based', 'privileged_access',
])
const groupScopeSchema = z.enum(['domain_local', 'global', 'universal'])
const membershipTypeSchema = z.enum(['direct', 'nested', 'dynamic'])

export const groupCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: groupTypeSchema,
  scope: groupScopeSchema,
  adTier: adTierSchema.default('unclassified'),
  sourceSystem: sourceSystemSchema,
  sourceId: z.string().max(255).optional(),
  memberCount: z.number().int().default(0),
  nestedGroupCount: z.number().int().default(0),
  isPrivileged: z.boolean().default(false),
  ownerIdentityId: z.string().uuid().optional().nullable(),
  orgId: z.string().uuid(),
})

export const groupSchema = groupCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export const groupMembershipCreateSchema = z.object({
  groupId: z.string().uuid(),
  identityId: z.string().uuid(),
  membershipType: membershipTypeSchema.default('direct'),
  addedBy: z.string().max(255).optional(),
  orgId: z.string().uuid(),
})

export const groupMembershipSchema = groupMembershipCreateSchema.extend({
  id: z.string().uuid(),
  addedAt: z.string().datetime(),
})

export type Group = z.infer<typeof groupSchema>
export type GroupCreate = z.infer<typeof groupCreateSchema>
export type GroupMembership = z.infer<typeof groupMembershipSchema>
export type GroupMembershipCreate = z.infer<typeof groupMembershipCreateSchema>
