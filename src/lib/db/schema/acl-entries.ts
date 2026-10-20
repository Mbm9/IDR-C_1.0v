import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { adTierEnum } from './enums'
import { identities } from './identities'
import { groups } from './groups'
import { organizations } from './organizations'

export const aclEntries = pgTable('acl_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectDn: text('object_dn').notNull(), // the AD object this ACL is on
  objectType: text('object_type').notNull(), // user, group, ou, computer, domain, gpo
  principalIdentityId: uuid('principal_identity_id').references(() => identities.id),
  principalGroupId: uuid('principal_group_id').references(() => groups.id),
  accessType: text('access_type').notNull(), // allow, deny
  rights: text('rights').array().notNull(), // GenericAll, WriteDacl, WriteOwner, WriteProperty, ExtendedRight, AddMember, etc.
  objectTypeGuid: text('object_type_guid'), // specific property/extended right GUID
  adTierOfObject: adTierEnum('ad_tier_of_object').notNull().default('unclassified'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_acl_entries_principal_identity').on(table.principalIdentityId),
  index('idx_acl_entries_principal_group').on(table.principalGroupId),
  index('idx_acl_entries_org_id').on(table.orgId),
  index('idx_acl_entries_object_dn').on(table.objectDn),
  index('idx_acl_entries_tier').on(table.adTierOfObject),
])

export const aclEntriesRelations = relations(aclEntries, ({ one }) => ({
  principalIdentity: one(identities, {
    fields: [aclEntries.principalIdentityId],
    references: [identities.id],
  }),
  principalGroup: one(groups, {
    fields: [aclEntries.principalGroupId],
    references: [groups.id],
  }),
  organization: one(organizations, {
    fields: [aclEntries.orgId],
    references: [organizations.id],
  }),
}))
