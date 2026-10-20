import { pgTable, uuid, text, integer, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { groupTypeEnum, groupScopeEnum, adTierEnum, sourceSystemEnum, membershipTypeEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: groupTypeEnum('type').notNull(),
  scope: groupScopeEnum('scope').notNull(),
  adTier: adTierEnum('ad_tier').notNull().default('unclassified'),
  sourceSystem: sourceSystemEnum('source_system').notNull(),
  sourceId: text('source_id'),
  memberCount: integer('member_count').notNull().default(0),
  nestedGroupCount: integer('nested_group_count').notNull().default(0),
  isPrivileged: boolean('is_privileged').notNull().default(false),
  ownerIdentityId: uuid('owner_identity_id').references(() => identities.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_groups_org_id').on(table.orgId),
  index('idx_groups_ad_tier').on(table.adTier),
])

export const groupMemberships = pgTable('group_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => groups.id),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  membershipType: membershipTypeEnum('membership_type').notNull().default('direct'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  addedBy: text('added_by'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
}, (table) => [
  index('idx_group_memberships_group_id').on(table.groupId),
  index('idx_group_memberships_identity_id').on(table.identityId),
  unique('uq_group_membership').on(table.groupId, table.identityId),
])

export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(identities, {
    fields: [groups.ownerIdentityId],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [groups.orgId],
    references: [organizations.id],
  }),
  memberships: many(groupMemberships),
}))

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, {
    fields: [groupMemberships.groupId],
    references: [groups.id],
  }),
  identity: one(identities, {
    fields: [groupMemberships.identityId],
    references: [identities.id],
  }),
}))
