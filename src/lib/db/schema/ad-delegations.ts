import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { adTierEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const adDelegations = pgTable('ad_delegations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceIdentityId: uuid('source_identity_id').notNull().references(() => identities.id),
  targetDn: text('target_dn').notNull(),
  targetObjectType: text('target_object_type').notNull(), // user, group, ou, computer, domain
  permission: text('permission').notNull(), // generic_all, write_dacl, write_owner, force_change_password, add_member, etc.
  inherited: boolean('inherited').notNull().default(false),
  adTierOfTarget: adTierEnum('ad_tier_of_target').notNull().default('unclassified'),
  dangerous: boolean('dangerous').notNull().default(false), // computed: allows privilege escalation
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ad_delegations_source_identity').on(table.sourceIdentityId),
  index('idx_ad_delegations_org_id').on(table.orgId),
  index('idx_ad_delegations_dangerous').on(table.dangerous),
  index('idx_ad_delegations_tier').on(table.adTierOfTarget),
])

export const adDelegationsRelations = relations(adDelegations, ({ one }) => ({
  sourceIdentity: one(identities, {
    fields: [adDelegations.sourceIdentityId],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [adDelegations.orgId],
    references: [organizations.id],
  }),
}))
