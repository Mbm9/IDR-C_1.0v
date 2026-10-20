import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { resourceTypeEnum, adTierEnum, resourceCriticalityEnum, environmentEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: resourceTypeEnum('type').notNull(),
  adTier: adTierEnum('ad_tier').notNull().default('unclassified'),
  criticality: resourceCriticalityEnum('criticality').notNull().default('medium'),
  environment: environmentEnum('environment').notNull().default('production'),
  ownerIdentityId: uuid('owner_identity_id').references(() => identities.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_resources_org_id').on(table.orgId),
  index('idx_resources_ad_tier').on(table.adTier),
])

export const resourcesRelations = relations(resources, ({ one }) => ({
  owner: one(identities, {
    fields: [resources.ownerIdentityId],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [resources.orgId],
    references: [organizations.id],
  }),
}))
