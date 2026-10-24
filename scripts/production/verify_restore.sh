#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then echo "Uso: $0 <directorio-backup>" >&2; exit 2; fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
BACKUP_DIR="$(cd "$1" && pwd)"
TEST_DB="gems_restore_verify_$(date -u +%s)"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.prod.yml")

(cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)
tar -tzf "$BACKUP_DIR/uploads.tar.gz" >/dev/null
cleanup() { "${COMPOSE[@]}" exec -T postgres sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists '$TEST_DB'" >/dev/null; }
trap cleanup EXIT
"${COMPOSE[@]}" exec -T postgres sh -c "createdb -U \"\$POSTGRES_USER\" '$TEST_DB'"
cat "$BACKUP_DIR/database.dump" | "${COMPOSE[@]}" exec -T postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d '$TEST_DB' --no-owner --no-privileges"
"${COMPOSE[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" '$TEST_DB' -c 'select version_num from alembic_version' -c 'select count(*) as tenants from tenants' -c 'select count(*) as users from users'"
echo "Restauración verificada correctamente en base temporal $TEST_DB"
