import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { adTierEnum } from './enums'
import { identities } from './identities'
import { groups } from './groups'
import { organizations } from './organizations'

// GPO status enum
export const gpoStatusEnum = pgEnum('gpo_status', ['enabled', 'disabled', 'enforced'])

// GPO permission type enum
export const gpoPermissionTypeEnum = pgEnum('gpo_permission_type', [
  'edit_settings', 'modify_security', 'link_gpo', 'read', 'apply',
  'full_control', 'create_gpo', 'delete_gpo',
])

// ── GPO Objects ──

export const gpoObjects = pgTable('gpo_objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  displayName: text('display_name'),
  gpoGuid: text('gpo_guid').unique(),
  status: gpoStatusEnum('status').notNull().default('enabled'),
  createdInSourceAt: timestamp('created_in_source_at', { withTimezone: true }),
  modifiedInSourceAt: timestamp('modified_in_source_at', { withTimezone: true }),
  ownerIdentityId: uuid('owner_identity_id').references(() => identities.id),
  adTier: adTierEnum('ad_tier').notNull().default('unclassified'),
  version: integer('version').notNull().default(0),
  description: text('description'),
  securityFiltering: jsonb('security_filtering'),
  wmiFilter: text('wmi_filter'),
  settings: jsonb('settings'), // effective security settings { key: value } — used for RSoP + baseline drift
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_gpo_objects_org_id').on(table.orgId),
  index('idx_gpo_objects_ad_tier').on(table.adTier),
  index('idx_gpo_objects_status').on(table.status),
  index('idx_gpo_objects_gpo_guid').on(table.gpoGuid),
  index('idx_gpo_objects_owner').on(table.ownerIdentityId),
])

// ── GPO Links ──

export const gpoLinks = pgTable('gpo_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  gpoId: uuid('gpo_id').notNull().references(() => gpoObjects.id),
  linkedOu: text('linked_ou').notNull(),
  linkOrder: integer('link_order').notNull().default(0),
  enforced: boolean('enforced').notNull().default(false),
  linkEnabled: boolean('link_enabled').notNull().default(true),
  adTierOfOu: adTierEnum('ad_tier_of_ou').notNull().default('unclassified'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_gpo_links_gpo_id').on(table.gpoId),
  index('idx_gpo_links_org_id').on(table.orgId),
  index('idx_gpo_links_ou_tier').on(table.adTierOfOu),
])

// ── GPO Permissions ──

export const gpoPermissions = pgTable('gpo_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gpoId: uuid('gpo_id').notNull().references(() => gpoObjects.id),
  trusteeIdentityId: uuid('trustee_identity_id').references(() => identities.id),
  trusteeGroupId: uuid('trustee_group_id').references(() => groups.id),
  trusteeName: text('trustee_name').notNull(),
  permissionType: gpoPermissionTypeEnum('permission_type').notNull(),
  dangerous: boolean('dangerous').notNull().default(false),
  adTierOfGpo: adTierEnum('ad_tier_of_gpo').notNull().default('unclassified'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_gpo_permissions_gpo_id').on(table.gpoId),
  index('idx_gpo_permissions_org_id').on(table.orgId),
  index('idx_gpo_permissions_trustee_identity').on(table.trusteeIdentityId),
  index('idx_gpo_permissions_trustee_group').on(table.trusteeGroupId),
  index('idx_gpo_permissions_dangerous').on(table.dangerous),
])

// ── Relations ──

export const gpoObjectsRelations = relations(gpoObjects, ({ one, many }) => ({
  owner: one(identities, {
    fields: [gpoObjects.ownerIdentityId],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [gpoObjects.orgId],
    references: [organizations.id],
  }),
  links: many(gpoLinks),
  permissions: many(gpoPermissions),
}))

export const gpoLinksRelations = relations(gpoLinks, ({ one }) => ({
  gpo: one(gpoObjects, {
    fields: [gpoLinks.gpoId],
    references: [gpoObjects.id],
  }),
  organization: one(organizations, {
    fields: [gpoLinks.orgId],
    references: [organizations.id],
  }),
}))

export const gpoPermissionsRelations = relations(gpoPermissions, ({ one }) => ({
  gpo: one(gpoObjects, {
    fields: [gpoPermissions.gpoId],
    references: [gpoObjects.id],
  }),
  trusteeIdentity: one(identities, {
    fields: [gpoPermissions.trusteeIdentityId],
    references: [identities.id],
  }),
  trusteeGroup: one(groups, {
    fields: [gpoPermissions.trusteeGroupId],
    references: [groups.id],
  }),
  organization: one(organizations, {
    fields: [gpoPermissions.orgId],
    references: [organizations.id],
  }),
}))
