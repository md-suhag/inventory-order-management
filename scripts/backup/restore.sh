#!/usr/bin/env sh
# Restore a PostgreSQL custom-format dump and optional uploads archive into the target compose stack.
# Usage: CONFIRM_RESTORE=yes ./scripts/backup/restore.sh <db.dump> [uploads.tar.gz]
set -eu

if [ "${CONFIRM_RESTORE:-no}" != "yes" ]; then
  echo "Refusing to overwrite database without CONFIRM_RESTORE=yes" >&2
  exit 1
fi

DB_DUMP="${1:?Path to .dump file is required}"
UPLOADS_ARCHIVE="${2:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
PG_USER="${POSTGRES_USER:-inventory}"
PG_DB="${POSTGRES_DB:-inventory}"

if [ ! -f "$DB_DUMP" ]; then
  echo "Dump file not found: $DB_DUMP" >&2
  exit 1
fi

echo "Stopping application containers before database restore..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop frontend backend || true

echo "Restoring PostgreSQL database '$PG_DB' from $DB_DUMP..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner --single-transaction < "$DB_DUMP"

if [ -n "$UPLOADS_ARCHIVE" ]; then
  if [ ! -f "$UPLOADS_ARCHIVE" ]; then
    echo "Uploads archive not found: $UPLOADS_ARCHIVE" >&2
    exit 1
  fi
  echo "Restoring uploaded files from $UPLOADS_ARCHIVE..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps -T backend \
    sh -c "rm -rf /app/uploads/* && tar -xzf - -C /app" < "$UPLOADS_ARCHIVE"
fi

echo "Starting application containers..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d backend frontend
echo "Restore complete. Verify health at /api/v1/health/ready."
