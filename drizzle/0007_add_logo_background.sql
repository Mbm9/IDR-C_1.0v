-- Branding: optional white tile behind the logo (default transparent).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_logo_background" boolean DEFAULT false NOT NULL;
