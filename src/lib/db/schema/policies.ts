import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { policyTypeEnum, severityEnum } from './enums'
import { organizations } from './organizations'

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: policyTypeEnum('type').notNull(),
  definition: jsonb('definition').notNull(),
  severity: severityEnum('severity').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  frameworkMappings: jsonb('framework_mappings').default({}),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_policies_org_id').on(table.orgId),
])

export const policiesRelations = relations(policies, ({ one }) => ({
  organization: one(organizations, {
    fields: [policies.orgId],
    references: [organizations.id],
  }),
}))
