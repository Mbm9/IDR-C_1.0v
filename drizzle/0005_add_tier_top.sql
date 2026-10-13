-- Top Tier: Tier 0 adjacent systems (ADFS, Entra Connect, PKI/CA, PAM vaults, DC backup).
-- Sits between tier_0 and tier_1 so enum ordering matches privilege.
ALTER TYPE "public"."ad_tier" ADD VALUE IF NOT EXISTS 'tier_top' BEFORE 'tier_1';
