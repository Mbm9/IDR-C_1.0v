-- Add match_method and alias_status enums
DO $$ BEGIN
  CREATE TYPE match_method AS ENUM ('deterministic', 'fuzzy', 'ai', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alias_status AS ENUM ('pending_review', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create identity_aliases table
CREATE TABLE IF NOT EXISTS identity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_identity_id UUID NOT NULL REFERENCES identities(id),
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_display_name TEXT,
  source_email TEXT,
  source_upn TEXT,
  match_confidence INTEGER NOT NULL DEFAULT 0,
  match_method match_method NOT NULL DEFAULT 'deterministic',
  matched_fields JSONB,
  status alias_status NOT NULL DEFAULT 'pending_review',
  reviewed_by UUID REFERENCES identities(id),
  reviewed_at TIMESTAMPTZ,
  org_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aliases_canonical ON identity_aliases(canonical_identity_id);
CREATE INDEX idx_aliases_org ON identity_aliases(org_id);
CREATE INDEX idx_aliases_status ON identity_aliases(org_id, status);

-- Add data_quality column to identities
ALTER TABLE identities ADD COLUMN IF NOT EXISTS data_quality JSONB;
