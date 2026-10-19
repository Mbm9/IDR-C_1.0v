-- Organization branding (Settings -> Organization): display name and logo.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_name" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_logo" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_updated_at" timestamp with time zone;
ALTER TYPE "public"."action_type" ADD VALUE IF NOT EXISTS 'manage_branding';
