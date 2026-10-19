#!/bin/sh
# Daily PostgreSQL backup, run by the `backup` container (postgres image).
#
# Writes /backups/identity-radar-YYYYMMDD-HHMMSS.sql.gz (the same format as
# scripts/backup.sh, so scripts/restore.sh restores it), once a day at
# BACKUP_HOUR (UTC), plus one on first start when the folder has none.
# Keeps the newest BACKUP_KEEP files.
#
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_HOUR (0-23, default 2),
#      BACKUP_KEEP (default 14), BACKUP_DIR (default /backups)
set -u

HOUR="${BACKUP_HOUR:-2}"
KEEP="${BACKUP_KEEP:-14}"
DIR="${BACKUP_DIR:-/backups}"
DB="${PGDATABASE:-identity_radar}"

mkdir -p "$DIR"
log() { echo "[backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

backup() {
  file="$DIR/identity-radar-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump -d "$DB" --no-owner --no-acl | gzip > "$file.tmp" && [ -s "$file.tmp" ]; then
    mv "$file.tmp" "$file"
    log "saved $(basename "$file") ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    log "FAILED: pg_dump of $DB did not complete"
    return 1
  fi
  # Rotate: keep the newest $KEEP backups.
  ls -1t "$DIR"/identity-radar-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" && log "removed $(basename "$old")"
  done
}

log "daily at ${HOUR}:00 UTC, keeping ${KEEP}, writing to ${DIR}"

until pg_isready -q -d "$DB"; do sleep 5; done

if ! ls "$DIR"/identity-radar-*.sql.gz >/dev/null 2>&1; then
  backup
fi

while true; do
  today="$(date -u +%Y%m%d)"
  hour="$(date -u +%H)"; hour="${hour#0}"
  if [ "$hour" -ge "$HOUR" ] && ! ls "$DIR"/identity-radar-"$today"-*.sql.gz >/dev/null 2>&1; then
    backup
  fi
  sleep 300
done
