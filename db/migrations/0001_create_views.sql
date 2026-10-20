-- Identity Risk Summary View
-- Aggregates identity data with counts of related entities
CREATE OR REPLACE VIEW v_identity_risk_summary AS
SELECT
  i.*,
  COALESCE(ac.account_count, 0) AS account_count,
  COALESCE(e.entitlement_count, 0) AS entitlement_count,
  COALESCE(pv.violation_count, 0) AS violation_count,
  COALESCE(pv.open_violation_count, 0) AS open_violation_count
FROM identities i
LEFT JOIN (
  SELECT identity_id, COUNT(*) AS account_count
  FROM accounts
  GROUP BY identity_id
) ac ON ac.identity_id = i.id
LEFT JOIN (
  SELECT identity_id, COUNT(*) AS entitlement_count
  FROM entitlements
  GROUP BY identity_id
) e ON e.identity_id = i.id
LEFT JOIN (
  SELECT
    identity_id,
    COUNT(*) AS violation_count,
    COUNT(*) FILTER (WHERE status = 'open') AS open_violation_count
  FROM policy_violations
  GROUP BY identity_id
) pv ON pv.identity_id = i.id;

-- Tier Violations View
-- Identities where tier_violation flag is set
CREATE OR REPLACE VIEW v_tier_violations AS
SELECT i.*
FROM identities i
WHERE i.tier_violation = true;

-- Dormant Identities View
-- Active identities with no logon in 90+ days
CREATE OR REPLACE VIEW v_dormant_identities AS
SELECT i.*
FROM identities i
WHERE i.status = 'active'
  AND i.last_logon_at IS NOT NULL
  AND i.last_logon_at < NOW() - INTERVAL '90 days';

-- Orphaned Non-Human Identities View
-- NHIs where owner is null or owner is disabled/inactive
CREATE OR REPLACE VIEW v_orphaned_nhi AS
SELECT i.*
FROM identities i
LEFT JOIN identities owner ON i.owner_identity_id = owner.id
WHERE i.type = 'non_human'
  AND (
    i.owner_identity_id IS NULL
    OR owner.status IN ('disabled', 'inactive', 'suspended')
  );

-- Over-Privileged Identities View
-- Identities with entitlement count exceeding 2x the org median
CREATE OR REPLACE VIEW v_over_privileged AS
WITH entitlement_counts AS (
  SELECT
    e.identity_id,
    e.org_id,
    COUNT(*) AS ent_count
  FROM entitlements e
  GROUP BY e.identity_id, e.org_id
),
org_medians AS (
  SELECT
    org_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ent_count) AS median_count
  FROM entitlement_counts
  GROUP BY org_id
)
SELECT i.*, ec.ent_count, om.median_count
FROM identities i
JOIN entitlement_counts ec ON ec.identity_id = i.id AND ec.org_id = i.org_id
JOIN org_medians om ON om.org_id = i.org_id
WHERE ec.ent_count > om.median_count * 2;

-- Certification Overdue View
-- Entitlements with expired certification or not certified in 90+ days
CREATE OR REPLACE VIEW v_certification_overdue AS
SELECT e.*
FROM entitlements e
WHERE e.certifiable = true
  AND (
    e.certification_status = 'expired'
    OR (
      e.last_certified_at IS NOT NULL
      AND e.last_certified_at < NOW() - INTERVAL '90 days'
    )
    OR (
      e.last_certified_at IS NULL
      AND e.created_at < NOW() - INTERVAL '90 days'
    )
  );

-- Integration Health View
-- All sources with staleness indicator
CREATE OR REPLACE VIEW v_integration_health AS
SELECT
  is_src.*,
  CASE
    WHEN is_src.sync_status = 'error' THEN 'error'
    WHEN is_src.sync_status = 'disconnected' THEN 'disconnected'
    WHEN is_src.last_sync_at IS NULL THEN 'never_synced'
    WHEN is_src.last_sync_at < NOW() - (is_src.sync_frequency_minutes * INTERVAL '1 minute' * 2) THEN 'stale'
    ELSE 'healthy'
  END AS health_status
FROM integration_sources is_src;
