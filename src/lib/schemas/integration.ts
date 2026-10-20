import { z } from 'zod'

const integrationTypeSchema = z.enum([
  'active_directory', 'azure_ad', 'okta', 'sailpoint', 'cyberark',
  'azure_logs', 'sso_provider',
])
const syncStatusSchema = z.enum(['connected', 'syncing', 'error', 'disconnected'])

export const integrationSourceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: integrationTypeSchema,
  config: z.record(z.string(), z.any()).default({}),
  syncStatus: syncStatusSchema.default('disconnected'),
  syncFrequencyMinutes: z.number().int().positive().default(360),
  orgId: z.string().uuid(),
})

export const integrationSourceUpdateSchema = integrationSourceCreateSchema.partial().omit({
  orgId: true,
})

export const integrationSourceSchema = integrationSourceCreateSchema.extend({
  id: z.string().uuid(),
  lastSyncAt: z.string().datetime().nullable(),
  lastSyncRecordCount: z.number().int().default(0),
  createdAt: z.string().datetime(),
})

export type IntegrationSource = z.infer<typeof integrationSourceSchema>
export type IntegrationSourceCreate = z.infer<typeof integrationSourceCreateSchema>
export type IntegrationSourceUpdate = z.infer<typeof integrationSourceUpdateSchema>
