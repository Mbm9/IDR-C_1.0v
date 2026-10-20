import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'

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
  // Draw the logo on a white tile (for logos that need a light backdrop); off = transparent
  brandLogoBackground: boolean('brand_logo_background').notNull().default(false),
  brandUpdatedAt: timestamp('brand_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
