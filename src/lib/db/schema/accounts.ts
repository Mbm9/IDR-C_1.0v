import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { platformEnum, accountTypeEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  platform: platformEnum('platform').notNull(),
  accountName: text('account_name').notNull(),
  accountType: accountTypeEnum('account_type').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastAuthenticatedAt: timestamp('last_authenticated_at', { withTimezone: true }),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaMethods: text('mfa_methods').array().default([]),
  privileged: boolean('privileged').notNull().default(false),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_accounts_identity_id').on(table.identityId),
  index('idx_accounts_org_id').on(table.orgId),
])

export const accountsRelations = relations(accounts, ({ one }) => ({
  identity: one(identities, {
    fields: [accounts.identityId],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [accounts.orgId],
    references: [organizations.id],
  }),
}))
