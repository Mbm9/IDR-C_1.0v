import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { matchMethodEnum, aliasStatusEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const identityAliases = pgTable('identity_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  canonicalIdentityId: uuid('canonical_identity_id').notNull().references(() => identities.id),
  sourceSystem: text('source_system').notNull(),
  sourceId: text('source_id').notNull(),
  sourceDisplayName: text('source_display_name'),
  sourceEmail: text('source_email'),
  sourceUpn: text('source_upn'),
  matchConfidence: integer('match_confidence').notNull().default(0),
  matchMethod: matchMethodEnum('match_method').notNull().default('deterministic'),
  matchedFields: jsonb('matched_fields'), // { email: true, upn: false, samAccountName: true }
  status: aliasStatusEnum('status').notNull().default('pending_review'),
  reviewedBy: uuid('reviewed_by').references(() => identities.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_aliases_canonical').on(table.canonicalIdentityId),
  index('idx_aliases_org').on(table.orgId),
  index('idx_aliases_status').on(table.orgId, table.status),
])

export const identityAliasesRelations = relations(identityAliases, ({ one }) => ({
  canonicalIdentity: one(identities, {
    fields: [identityAliases.canonicalIdentityId],
    references: [identities.id],
    relationName: 'canonicalIdentity',
  }),
  reviewer: one(identities, {
    fields: [identityAliases.reviewedBy],
    references: [identities.id],
    relationName: 'aliasReviewer',
  }),
  organization: one(organizations, {
    fields: [identityAliases.orgId],
    references: [organizations.id],
  }),
}))
