import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const subscriptionTierEnum = pgEnum('subscription_tier', ['free', 'professional', 'enterprise'])

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id).unique(),
  tier: subscriptionTierEnum('tier').notNull().default('free'),
  maxIdentities: integer('max_identities').notNull().default(500),
  maxIntegrations: integer('max_integrations').notNull().default(1),
  maxUsers: integer('max_users').notNull().default(3),
  maxAiRunsPerMonth: integer('max_ai_runs_per_month').notNull().default(5),
  retentionDays: integer('retention_days').notNull().default(30),
  apiAccess: boolean('api_access').notNull().default(false),
  ssoEnabled: boolean('sso_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  role: text('role').notNull().default('viewer'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  invitedBy: uuid('invited_by').notNull(),
  status: text('status').notNull().default('pending'), // pending, accepted, expired, revoked
  // SHA-256 of the single-use token in the invite link (lib/auth/invite-token.ts)
  tokenHash: text('token_hash').unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  keyPrefix: text('key_prefix').notNull(), // first 8 chars for display
  keyHash: text('key_hash').notNull(), // bcrypt hash of full key
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdBy: uuid('created_by').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Subscription tier limits removed — single open-source edition for now.
// Add back when monetization is ready.
