#!/bin/sh
# =============================================================================
# ListsManager – container entrypoint
#
# Runs as root so it can:
#   1. Create / fix ownership of the /data volume directories
#   2. Back up the existing database before touching it
#   3. Run `prisma migrate deploy` to apply any pending migrations
#   4. Verify the database is healthy
#   5. Start the cron daemon for scheduled backups
#   6. Optionally start the Cloudflare tunnel
#   7. Drop privileges to the `nextjs` user and exec the Next.js server
# =============================================================================
set -e

export DATABASE_URL="${DATABASE_URL:-file:/data/listsmanager.db}"
# Strip the "file:" prefix to get the raw filesystem path
DB_PATH="${DATABASE_URL#file:}"

echo "========================================"
echo "  ListsManager Container Startup"
echo "========================================"
echo "  DATABASE_URL : $DATABASE_URL"
echo "  DB file path : $DB_PATH"
echo "  Node version : $(node --version)"
echo "  Current time : $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================"

echo ""
echo ">> Preflight checks..."
for f in server.js prisma/schema.prisma node_modules/.bin/prisma; do
  if [ ! -e "$f" ]; then
    echo "   FATAL: expected file not found: /app/$f"
    echo "   The image may not have built correctly."
    exit 1
  fi
done
echo "   ok: critical files present"

# ---------------------------------------------------------------------------
# 1. Ensure /data directory structure exists and is owned by nextjs
# ---------------------------------------------------------------------------
echo ""
echo ">> [1/6] Setting up /data directory structure..."
mkdir -p /data/attachments   # files attached to checklist items
mkdir -p /data/backups       # automated database backups

chown -R nextjs:nodejs /data 2>/dev/null || true
chmod -R 755 /data 2>/dev/null || true

# Symlink /app/data -> /data so any code using process.cwd() + '/data/...'
# resolves to the mounted volume regardless of the working directory.
ln -sfn /data /app/data 2>/dev/null || true
echo "   ok: /data structure ready"

# ---------------------------------------------------------------------------
# 2. Pre-migration database backup
# ---------------------------------------------------------------------------
echo ""
echo ">> [2/6] Pre-migration backup..."
if [ -f "$DB_PATH" ]; then
  BACKUP_FILE="/data/backups/listsmanager.db.pre-deploy.$(date +%Y%m%d_%H%M%S)"
  cp "$DB_PATH" "$BACKUP_FILE"
  echo "   ok: backed up existing database to $BACKUP_FILE"
  # Keep only the 10 most recent pre-deploy backups
  ls -t /data/backups/listsmanager.db.pre-deploy.* 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  echo "   no existing database; migrations will create a fresh one"
fi

# ---------------------------------------------------------------------------
# 3. Run Prisma migrations
#    `migrate deploy` is safe to run on every startup – already-applied
#    migrations are skipped. Never use `db push` / `migrate dev` here.
# ---------------------------------------------------------------------------
echo ""
echo ">> [3/6] Running database migrations..."

# Remove failed / in-progress migration records so migrate deploy retries them.
if [ -f "$DB_PATH" ]; then
  STALE=$(sqlite3 "$DB_PATH" \
    "SELECT count(*) FROM _prisma_migrations WHERE logs IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL);" 2>/dev/null || echo "0")
  if [ "$STALE" -gt 0 ]; then
    echo "   found $STALE stale/failed migration record(s) - removing so migrate deploy retries..."
    sqlite3 "$DB_PATH" \
      "DELETE FROM _prisma_migrations WHERE logs IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL);"
  fi
fi

if node_modules/.bin/prisma migrate deploy; then
  echo "   ok: migrations completed"
else
  echo "   ERROR: prisma migrate deploy failed"
  echo "   Check that the /data volume is mounted and writable."
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Verify the database is healthy; enable WAL
# ---------------------------------------------------------------------------
echo ""
echo ">> [4/6] Verifying database health..."
if sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type='table';" > /dev/null 2>&1; then
  TABLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type='table';")
  echo "   ok: database healthy ($TABLE_COUNT tables)"
else
  echo "   WARNING: could not query database at $DB_PATH; starting anyway"
fi

chown nextjs:nodejs "$DB_PATH" 2>/dev/null || true
chown nextjs:nodejs "${DB_PATH}-wal" 2>/dev/null || true
chown nextjs:nodejs "${DB_PATH}-shm" 2>/dev/null || true

# WAL mode: healthcheck reads don't block on writes.
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" > /dev/null 2>&1 || true
  echo "   ok: SQLite WAL mode enabled"
fi

# ---------------------------------------------------------------------------
# 5. Daily backup cron job (03:00)
# ---------------------------------------------------------------------------
echo ""
echo ">> [5/6] Configuring scheduled backups..."
echo "0 3 * * * su-exec nextjs:nodejs /app/scripts/backup-db.sh /data/backups >> /data/backups/cron.log 2>&1" \
  > /etc/crontabs/root
crond -b -l 2
echo "   ok: cron daemon started (daily backup at 03:00)"

# ---------------------------------------------------------------------------
# 6. Optional: Cloudflare tunnel
# ---------------------------------------------------------------------------
echo ""
echo ">> [6/6] Starting services..."
if [ -f /etc/cloudflared/config.yml ]; then
  echo "   Starting Cloudflare tunnel..."
  # Use public DNS – Docker's internal resolver (127.0.0.11) can't handle
  # SRV lookups needed by cloudflared and hangs after network interruptions.
  printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf

  (
    while true; do
      su-exec nextjs:nodejs cloudflared tunnel \
        --no-autoupdate \
        --metrics 127.0.0.1:20241 \
        --config /etc/cloudflared/config.yml \
        run
      echo "   Cloudflare tunnel exited - restarting in 5 seconds..."
      sleep 5
    done
  ) &
  echo "   ok: Cloudflare tunnel started"
else
  echo "   no Cloudflare config found; skipping tunnel"
fi

# ---------------------------------------------------------------------------
# Hand off to the Next.js server as the unprivileged nextjs user
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo "  ListsManager is starting on port 3000"
echo "========================================"
exec su-exec nextjs:nodejs "$@"
