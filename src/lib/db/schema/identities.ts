import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import {
  identityTypeEnum,
  identitySubTypeEnum,
  identityStatusEnum,
  adTierEnum,
  sourceSystemEnum,
} from './enums'
import { organizations } from './organizations'

export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  type: identityTypeEnum('type').notNull(),
  subType: identitySubTypeEnum('sub_type').notNull(),
  status: identityStatusEnum('status').notNull().default('active'),
  adTier: adTierEnum('ad_tier').notNull().default('unclassified'),
  effectiveTier: adTierEnum('effective_tier'),
  tierViolation: boolean('tier_violation').notNull().default(false),
  riskScore: integer('risk_score').notNull().default(0),
  riskFactors: jsonb('risk_factors').default([]),
  sourceSystem: sourceSystemEnum('source_system').notNull(),
  sourceId: text('source_id'),
  upn: text('upn'),
  samAccountName: text('sam_account_name'),
  email: text('email'),
  department: text('department'),
  managerIdentityId: uuid('manager_identity_id'),
  lastLogonAt: timestamp('last_logon_at', { withTimezone: true }),
  passwordLastSetAt: timestamp('password_last_set_at', { withTimezone: true }),
  createdInSourceAt: timestamp('created_in_source_at', { withTimezone: true }),
  ownerIdentityId: uuid('owner_identity_id'),
  expiryAt: timestamp('expiry_at', { withTimezone: true }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  dataQuality: jsonb('data_quality'), // { score, completeness, freshness, accuracy, fields: { [name]: { filled, source, confidence, lastUpdated } } }
  adSecurity: jsonb('ad_security'), // { uac, spn: string[], adminCount, allowedToDelegateTo: string[], rbcd: boolean, supportedEncTypes } — raw AD security attrs for posture checks
}, (table) => [
  index('idx_identities_org_id').on(table.orgId),
  index('idx_identities_type').on(table.type),
  index('idx_identities_status').on(table.status),
  index('idx_identities_ad_tier').on(table.adTier),
  index('idx_identities_risk_score').on(table.riskScore),
  index('idx_identities_source_system').on(table.sourceSystem),
  index('idx_identities_last_logon').on(table.lastLogonAt),
])

export const identitiesRelations = relations(identities, ({ one }) => ({
  organization: one(organizations, {
    fields: [identities.orgId],
    references: [organizations.id],
  }),
  manager: one(identities, {
    fields: [identities.managerIdentityId],
    references: [identities.id],
    relationName: 'manager',
  }),
  owner: one(identities, {
    fields: [identities.ownerIdentityId],
    references: [identities.id],
    relationName: 'owner',
  }),
}))
