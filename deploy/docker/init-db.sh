#!/bin/sh
set -e

echo "[init] Waiting for PostgreSQL to be ready..."
until pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" >/dev/null 2>&1; do
  sleep 1
done
echo "[init] PostgreSQL is ready."

echo "[init] Pushing database schema via drizzle-kit..."
npx drizzle-kit push
echo "[init] Schema push complete."

# drizzle-kit push can stop at an interactive prompt on a database that already
# has data (it re-proposes the existing uq_issue_status_org_fsid constraint) and
# then applies nothing. The incremental migrations below are idempotent
# (IF NOT EXISTS), so upgrades get their schema changes either way. Migrations
# from 0006 on must stay re-runnable.
for f in /app/db/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  n="$(basename "$f" | cut -c1-4)"
  [ "$n" -ge 6 ] 2>/dev/null || continue
  echo "[init] Applying $(basename "$f")..."
  psql "$(echo "$DATABASE_URL")" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "[init] Creating database views..."
psql "$(echo "$DATABASE_URL")" -f /app/db/migrations/0001_create_views.sql
echo "[init] Views created."

# Check if data already exists to avoid duplicate seeding
ROW_COUNT=$(psql "$(echo "$DATABASE_URL")" -t -A -c "SELECT COUNT(*) FROM organizations;" 2>/dev/null || echo "0")

if [ "${SEED_DEMO:-true}" = "false" ]; then
  echo "[init] SEED_DEMO=false: no demo data loaded. Create the first account at /signup."
elif [ "$ROW_COUNT" -gt 0 ]; then
  echo "[init] Data already exists ($ROW_COUNT organizations). Skipping seed."
else
  echo "[init] Seeding sample data..."
  npx tsx db/seed/index.ts
  echo "[init] Seed complete."
fi

echo "[init] Database initialisation finished."
