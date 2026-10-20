#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Database Restore Script
#
# Usage:
#   ./deploy/scripts/restore.sh backups/identity-radar-20260328-020000.sql.gz
#   ./deploy/scripts/restore.sh --force backups/identity-radar-20260328-020000.sql.gz
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
CONTAINER="idr-db"
APP_CONTAINER="idr-app"
DB_NAME="identity_radar"
DB_USER="postgres"
FORCE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="deploy/docker/docker-compose.prod.yml"
ENV_FILE=".env.production"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --force|-f) FORCE=true; shift ;;
    --help|-h)
      echo "Usage: ./deploy/scripts/restore.sh [OPTIONS] <backup-file>"
      echo ""
      echo "Arguments:"
      echo "  <backup-file>  Path to .sql.gz backup file"
      echo ""
      echo "Options:"
      echo "  --force, -f    Skip confirmation prompt"
      echo "  --help         Show this help"
      exit 0
      ;;
    -*) fail "Unknown option: $1" ;;
    *)  BACKUP_FILE="$1"; shift ;;
  esac
done

cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------
[ -z "$BACKUP_FILE" ] && fail "Usage: ./deploy/scripts/restore.sh <backup-file>"
[ -f "$BACKUP_FILE" ] || fail "Backup file not found: ${BACKUP_FILE}"

# Check it's a gzip file
if ! file "$BACKUP_FILE" | grep -qi gzip; then
  fail "File does not appear to be gzip-compressed: ${BACKUP_FILE}"
fi

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
info "Backup file: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  fail "Database container '${CONTAINER}' is not running"
fi

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------
if [ "$FORCE" = false ]; then
  echo ""
  warn "This will REPLACE ALL DATA in the '${DB_NAME}' database."
  warn "All current data will be permanently lost."
  echo ""
  read -rp "Continue? [y/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Restore cancelled."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Create a safety backup first
# ---------------------------------------------------------------------------
info "Creating safety backup of current data..."
SAFETY_BACKUP="backups/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
mkdir -p backups
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
  | gzip > "$SAFETY_BACKUP" 2>/dev/null || true

if [ -s "$SAFETY_BACKUP" ]; then
  success "Safety backup: ${SAFETY_BACKUP}"
else
  warn "Could not create safety backup (database may be empty)"
  rm -f "$SAFETY_BACKUP"
fi

# ---------------------------------------------------------------------------
# Stop the app container
# ---------------------------------------------------------------------------
info "Stopping application..."
if [ -f "$ENV_FILE" ]; then
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop app 2>/dev/null || \
    docker stop "$APP_CONTAINER" 2>/dev/null || true
else
  docker stop "$APP_CONTAINER" 2>/dev/null || true
fi
success "Application stopped"

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
info "Dropping existing database..."
docker exec "$CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true
docker exec "$CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null

info "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" --quiet 2>/dev/null

success "Database restored"

# ---------------------------------------------------------------------------
# Restart the app
# ---------------------------------------------------------------------------
info "Restarting application..."
if [ -f "$ENV_FILE" ]; then
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start app
else
  docker start "$APP_CONTAINER" 2>/dev/null || true
fi

# Wait for app health
info "Waiting for application to be healthy..."
MAX_WAIT=60
ELAPSED=0
until curl -sf http://localhost:3000/api/health >/dev/null 2>&1; do
  ELAPSED=$((ELAPSED + 3))
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    warn "Application not healthy after ${MAX_WAIT}s. Check: docker logs ${APP_CONTAINER}"
    break
  fi
  sleep 3
done

if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
  success "Application is healthy"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
success "Restore complete!"
info "Restored from: ${BACKUP_FILE}"
if [ -s "$SAFETY_BACKUP" 2>/dev/null ]; then
  info "Previous data saved to: ${SAFETY_BACKUP}"
fi
