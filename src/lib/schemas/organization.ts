import { z } from 'zod'

export const organizationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
  industry: z.string().max(255).optional(),
  regulatoryFrameworks: z.array(z.string()).default([]),
  adForestName: z.string().max(255).optional(),
  tenantId: z.string().max(255).optional(),
})

export const organizationSchema = organizationCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export type Organization = z.infer<typeof organizationSchema>
export type OrganizationCreate = z.infer<typeof organizationCreateSchema>
