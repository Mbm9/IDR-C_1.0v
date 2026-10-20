#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Database Backup Script
#
# Usage:
#   ./deploy/scripts/backup.sh                 # Backup with default settings
#   ./deploy/scripts/backup.sh --keep 14       # Keep last 14 backups
#   ./deploy/scripts/backup.sh --dir /mnt/bak  # Custom backup directory
#
# Crontab example (daily at 2am):
#   0 2 * * * /opt/identity-radar/scripts/backup.sh >> /var/log/idr-backup.log 2>&1
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
KEEP=7
BACKUP_DIR="backups"
CONTAINER="idr-db"
DB_NAME="identity_radar"
DB_USER="postgres"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $(date +"%Y-%m-%d %H:%M:%S") $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $(date +"%Y-%m-%d %H:%M:%S") $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $(date +"%Y-%m-%d %H:%M:%S") $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $(date +"%Y-%m-%d %H:%M:%S") $*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --keep) KEEP="$2"; shift 2 ;;
    --dir)  BACKUP_DIR="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./deploy/scripts/backup.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --keep <n>    Number of backups to retain (default: 7)"
      echo "  --dir <path>  Backup directory (default: ./backups)"
      echo "  --help        Show this help"
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------
info "Starting database backup..."

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  fail "Database container '${CONTAINER}' is not running"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
BACKUP_FILE="${BACKUP_DIR}/identity-radar-${TIMESTAMP}.sql.gz"

info "Dumping database '${DB_NAME}' from container '${CONTAINER}'..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
  | gzip > "$BACKUP_FILE"

# Verify the backup
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
if [ ! -s "$BACKUP_FILE" ]; then
  rm -f "$BACKUP_FILE"
  fail "Backup file is empty — dump may have failed"
fi

success "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# Rotate old backups
# ---------------------------------------------------------------------------
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "identity-radar-*.sql.gz" -type f | wc -l)

if [ "$BACKUP_COUNT" -gt "$KEEP" ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - KEEP))
  info "Rotating backups: keeping ${KEEP}, removing ${REMOVE_COUNT} oldest..."

  find "$BACKUP_DIR" -name "identity-radar-*.sql.gz" -type f \
    | sort \
    | head -n "$REMOVE_COUNT" \
    | while read -r OLD_BACKUP; do
        rm -f "$OLD_BACKUP"
        info "Removed: $(basename "$OLD_BACKUP")"
      done

  success "Rotation complete"
else
  info "Backups on disk: ${BACKUP_COUNT}/${KEEP} (no rotation needed)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
success "Backup complete!"
info "File: ${BACKUP_FILE}"
info "Size: ${BACKUP_SIZE}"
info "Restore with: ./deploy/scripts/restore.sh ${BACKUP_FILE}"
