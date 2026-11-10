#!/usr/bin/env sh
# Create a consistent PostgreSQL custom-format dump and product uploads archive.
# Usage: ./scripts/backup/backup.sh [output_dir]
set -eu

OUT_DIR="${1:-./backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
PG_USER="${POSTGRES_USER:-inventory}"
PG_DB="${POSTGRES_DB:-inventory}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$OUT_DIR"

DB_DUMP="$OUT_DIR/db-${PG_DB}-${STAMP}.dump"
UPLOADS_ARCHIVE="$OUT_DIR/uploads-${STAMP}.tar.gz"

echo "Creating PostgreSQL backup -> $DB_DUMP"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$DB_DUMP"

echo "Archiving uploaded product images -> $UPLOADS_ARCHIVE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  tar -czf - -C /app uploads > "$UPLOADS_ARCHIVE"

sha256sum "$DB_DUMP" "$UPLOADS_ARCHIVE" > "$OUT_DIR/checksums-${STAMP}.sha256"
echo "Backup complete: $OUT_DIR (timestamp $STAMP)"
