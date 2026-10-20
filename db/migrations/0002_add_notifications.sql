-- Migration: Add notifications table
-- Created: 2026-03-26

DO $$ BEGIN
  CREATE TYPE "notification_type" AS ENUM (
    'violation_detected', 'certification_due', 'sync_failed',
    'exception_expiring', 'ai_analysis_complete', 'system'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "notification_severity" AS ENUM (
    'critical', 'high', 'medium', 'low', 'info'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" text NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "severity" "notification_severity" NOT NULL DEFAULT 'info',
  "read" boolean NOT NULL DEFAULT false,
  "link" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_org_id" ON "notifications" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_read" ON "notifications" ("read");
CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "notifications" ("created_at");
