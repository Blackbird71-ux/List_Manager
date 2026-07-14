#!/bin/sh
# Nightly SQLite backup. Usage: backup-db.sh <backup-dir>
# Uses sqlite3 .backup (safe with WAL) and keeps the 14 most recent copies.
set -e

BACKUP_DIR="${1:-/data/backups}"
DB_PATH="${DATABASE_URL#file:}"
DB_PATH="${DB_PATH:-/data/listsmanager.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') no database at $DB_PATH; skipping backup"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
TARGET="$BACKUP_DIR/listsmanager.db.daily.$STAMP"

sqlite3 "$DB_PATH" ".backup '$TARGET'"
echo "$(date '+%Y-%m-%d %H:%M:%S') backed up to $TARGET"

# Prune: keep the 14 most recent daily backups
ls -t "$BACKUP_DIR"/listsmanager.db.daily.* 2>/dev/null | tail -n +15 | xargs -r rm -f
