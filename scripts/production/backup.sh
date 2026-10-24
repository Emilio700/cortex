#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_ROOT/$STAMP"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.prod.yml")

mkdir -p "$TARGET"
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$TARGET/database.dump"
# Los archivos se leen del volumen con un contenedor efímero (el de
# init-uploads: alpine, sin red), no desde el backend. El respaldo es lo que
# más se necesita justo cuando el backend está caído, y antes fallaba ahí.
# Solo depende de postgres (arriba) y del volumen.
"${COMPOSE[@]}" run --rm --no-deps -T init-uploads tar -czf - -C /uploads . > "$TARGET/uploads.tar.gz"
"${COMPOSE[@]}" exec -T postgres sh -c 'psql -At -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select version_num from alembic_version"' > "$TARGET/alembic_version.txt"
(cd "$TARGET" && sha256sum database.dump uploads.tar.gz alembic_version.txt > SHA256SUMS)
printf '%s\n' "$TARGET"
