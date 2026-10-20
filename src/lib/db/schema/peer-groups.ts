import { pgTable, uuid, text, integer, real, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { adTierEnum, identitySubTypeEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const peerGroups = pgTable('peer_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  department: text('department').notNull(),
  adTier: adTierEnum('ad_tier').notNull(),
  subType: identitySubTypeEnum('sub_type').notNull(),
  memberCount: integer('member_count').notNull().default(0),
  medianEntitlementCount: real('median_entitlement_count').notNull().default(0),
  avgEntitlementCount: real('avg_entitlement_count').notNull().default(0),
  stddevEntitlementCount: real('stddev_entitlement_count').notNull().default(0),
  commonEntitlements: jsonb('common_entitlements').default([]), // [{permissionName, percentage}]
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_peer_groups_org_id').on(table.orgId),
  index('idx_peer_groups_department').on(table.department),
])

export const peerAnomalies = pgTable('peer_anomalies', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  peerGroupId: uuid('peer_group_id').notNull().references(() => peerGroups.id),
  anomalyType: text('anomaly_type').notNull(), // excess_entitlements, unique_entitlements, tier_mismatch
  entitlementCount: integer('entitlement_count').notNull(),
  peerMedian: real('peer_median').notNull(),
  deviationScore: real('deviation_score').notNull(),
  excessEntitlements: jsonb('excess_entitlements').default([]), // [{permissionName, tier, peersWithSame: 0}]
  uniqueEntitlements: jsonb('unique_entitlements').default([]),
  status: text('status').notNull().default('open'), // open, reviewed, dismissed, remediated
  aiNarrative: text('ai_narrative'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_peer_anomalies_identity_id').on(table.identityId),
  index('idx_peer_anomalies_peer_group_id').on(table.peerGroupId),
  index('idx_peer_anomalies_org_id').on(table.orgId),
  index('idx_peer_anomalies_status').on(table.status),
])

export const peerGroupsRelations = relations(peerGroups, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [peerGroups.orgId],
    references: [organizations.id],
  }),
  anomalies: many(peerAnomalies),
}))

export const peerAnomaliesRelations = relations(peerAnomalies, ({ one }) => ({
  identity: one(identities, {
    fields: [peerAnomalies.identityId],
    references: [identities.id],
  }),
  peerGroup: one(peerGroups, {
    fields: [peerAnomalies.peerGroupId],
    references: [peerGroups.id],
  }),
  organization: one(organizations, {
    fields: [peerAnomalies.orgId],
    references: [organizations.id],
  }),
}))
