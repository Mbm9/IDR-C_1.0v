import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  industry: text('industry'),
  regulatoryFrameworks: text('regulatory_frameworks').array().default([]),
  adForestName: text('ad_forest_name'),
  tenantId: text('tenant_id'),
  // Branding (Settings → Organization): display name and logo as a data: URL
  brandName: text('brand_name'),
  brandLogo: text('brand_logo'),
  brandUpdatedAt: timestamp('brand_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
