import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { adTierEnum } from './enums'
import { organizations } from './organizations'

// Approved GPO security baselines used by the GPO audit (lib/itdr/gpo-audit.ts) to detect
// configuration drift. Each baseline holds expected setting key→value pairs for a scope/tier.
export const gpoBaselines = pgTable('gpo_baselines', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  scope: text('scope').notNull(), // e.g. 'Domain', 'Tier 0 OU', 'Workstations'
  adTier: adTierEnum('ad_tier').notNull().default('unclassified'),
  settings: jsonb('settings').notNull(), // { 'PasswordComplexity': 'Enabled', 'MinimumPasswordLength': '14', ... }
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_gpo_baselines_org_id').on(table.orgId),
])

export const gpoBaselinesRelations = relations(gpoBaselines, ({ one }) => ({
  organization: one(organizations, {
    fields: [gpoBaselines.orgId],
    references: [organizations.id],
  }),
}))
