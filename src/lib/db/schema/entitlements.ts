import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { permissionTypeEnum, adTierEnum, certificationStatusEnum } from './enums'
import { identities } from './identities'
import { resources } from './resources'
import { organizations } from './organizations'

export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  permissionType: permissionTypeEnum('permission_type').notNull(),
  permissionName: text('permission_name').notNull(),
  permissionScope: text('permission_scope'),
  adTierOfPermission: adTierEnum('ad_tier_of_permission').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  grantedBy: text('granted_by'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  certifiable: boolean('certifiable').notNull().default(true),
  certificationStatus: certificationStatusEnum('certification_status').notNull().default('pending'),
  lastCertifiedAt: timestamp('last_certified_at', { withTimezone: true }),
  certifiedBy: uuid('certified_by').references(() => identities.id),
  riskTags: text('risk_tags').array().default([]),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_entitlements_identity_id').on(table.identityId),
  index('idx_entitlements_resource_id').on(table.resourceId),
  index('idx_entitlements_org_id').on(table.orgId),
  index('idx_entitlements_certification_status').on(table.certificationStatus),
  index('idx_entitlements_ad_tier').on(table.adTierOfPermission),
])

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  identity: one(identities, {
    fields: [entitlements.identityId],
    references: [identities.id],
  }),
  resource: one(resources, {
    fields: [entitlements.resourceId],
    references: [resources.id],
  }),
  certifier: one(identities, {
    fields: [entitlements.certifiedBy],
    references: [identities.id],
    relationName: 'certifier',
  }),
  organization: one(organizations, {
    fields: [entitlements.orgId],
    references: [organizations.id],
  }),
}))
