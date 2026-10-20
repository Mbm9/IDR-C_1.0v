import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { violationStatusEnum } from './enums'
import { identities } from './identities'
import { resources } from './resources'
import { organizations } from './organizations'

export const attackPaths = pgTable('attack_paths', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceIdentityId: uuid('source_identity_id').notNull().references(() => identities.id),
  targetIdentityId: uuid('target_identity_id').references(() => identities.id),
  targetResourceId: uuid('target_resource_id').references(() => resources.id),
  pathNodes: jsonb('path_nodes').notNull(), // ordered array of {id, type, name, tier}
  pathEdges: jsonb('path_edges').notNull(), // ordered array of {source, target, type, label, technique}
  pathLength: integer('path_length').notNull(),
  riskScore: integer('risk_score').notNull().default(0),
  attackTechnique: text('attack_technique').notNull(), // primary technique name
  mitreId: text('mitre_id'), // e.g. T1078.002
  aiNarrative: text('ai_narrative'),
  status: violationStatusEnum('status').notNull().default('open'),
  discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
}, (table) => [
  index('idx_attack_paths_source_identity').on(table.sourceIdentityId),
  index('idx_attack_paths_target_identity').on(table.targetIdentityId),
  index('idx_attack_paths_target_resource').on(table.targetResourceId),
  index('idx_attack_paths_org_id').on(table.orgId),
  index('idx_attack_paths_risk_score').on(table.riskScore),
  index('idx_attack_paths_status').on(table.status),
])

export const attackPathsRelations = relations(attackPaths, ({ one }) => ({
  sourceIdentity: one(identities, {
    fields: [attackPaths.sourceIdentityId],
    references: [identities.id],
    relationName: 'attackPathSource',
  }),
  targetIdentity: one(identities, {
    fields: [attackPaths.targetIdentityId],
    references: [identities.id],
    relationName: 'attackPathTarget',
  }),
  targetResource: one(resources, {
    fields: [attackPaths.targetResourceId],
    references: [resources.id],
  }),
  organization: one(organizations, {
    fields: [attackPaths.orgId],
    references: [organizations.id],
  }),
}))
