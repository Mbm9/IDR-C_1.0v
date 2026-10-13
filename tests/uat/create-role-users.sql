-- Create one UAT user per role in the seeded organization (admin@acmefs.sa's org).
-- Usage:
--   psql "$DATABASE_URL" -v password='Choose-A-Password' -f tests/uat/create-role-users.sql
-- Docker:
--   docker exec -i idr-db psql -U postgres -d identity_radar -v password='...' < tests/uat/create-role-users.sql
-- Then export E2E_USER_PASSWORD / UAT_PASSWORD with the same value.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (email, name, hashed_password, org_id, app_role)
SELECT 'uat.' || r || '@acmefs.sa',
       'UAT ' || r,
       crypt(:'password', gen_salt('bf', 10)),
       (SELECT org_id FROM users WHERE email = 'admin@acmefs.sa'),
       r::app_role
FROM unnest(ARRAY['viewer', 'analyst', 'iam_admin', 'ciso']) AS r
ON CONFLICT (email) DO UPDATE
  SET hashed_password = EXCLUDED.hashed_password,
      app_role = EXCLUDED.app_role,
      org_id = EXCLUDED.org_id;

SELECT email, app_role FROM users WHERE email LIKE 'uat.%' OR email = 'admin@acmefs.sa' ORDER BY app_role;
