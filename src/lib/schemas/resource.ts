import { z } from 'zod'
import { adTierSchema } from './common'

const resourceTypeSchema = z.enum([
  'server', 'application', 'database', 'file_share', 'cloud_resource',
  'domain_controller', 'workstation', 'network_device', 'saas_app',
])
const resourceCriticalitySchema = z.enum(['critical', 'high', 'medium', 'low'])
const environmentSchema = z.enum(['production', 'staging', 'development', 'dr'])

export const resourceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: resourceTypeSchema,
  adTier: adTierSchema.default('unclassified'),
  criticality: resourceCriticalitySchema.default('medium'),
  environment: environmentSchema.default('production'),
  ownerIdentityId: z.string().uuid().optional().nullable(),
  orgId: z.string().uuid(),
})

export const resourceSchema = resourceCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export type Resource = z.infer<typeof resourceSchema>
export type ResourceCreate = z.infer<typeof resourceCreateSchema>
