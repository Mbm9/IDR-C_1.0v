import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { notificationTypeEnum, notificationSeverityEnum } from './enums'
import { organizations } from './organizations'

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull(),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  severity: notificationSeverityEnum('severity').notNull().default('info'),
  read: boolean('read').notNull().default(false),
  link: text('link'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notifications_user_id').on(table.userId),
  index('idx_notifications_org_id').on(table.orgId),
  index('idx_notifications_read').on(table.read),
  index('idx_notifications_created_at').on(table.createdAt),
])
