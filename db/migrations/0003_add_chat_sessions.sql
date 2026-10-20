CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text DEFAULT 'New Chat' NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_chat_sessions_user_id" ON "chat_sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_org_id" ON "chat_sessions" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_updated_at" ON "chat_sessions" USING btree ("updated_at");
