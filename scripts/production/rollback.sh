#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
TAG_FILE="$ROOT_DIR/.deploy/previous_image_tag"
[[ -f "$TAG_FILE" ]] || { echo "No hay una imagen anterior registrada" >&2; exit 1; }
PREVIOUS_TAG="$(tr -d '[:space:]' < "$TAG_FILE")"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.prod.yml")

persist_image_tag() {
  local tag="$1"
  local temp_file
  umask 077
  temp_file="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -v tag="$tag" '
    BEGIN { updated = 0 }
    /^IMAGE_TAG=/ {
      if (!updated) print "IMAGE_TAG=" tag
      updated = 1
      next
    }
    { print }
    END { if (!updated) print "IMAGE_TAG=" tag }
  ' "$ENV_FILE" > "$temp_file"
  chmod --reference="$ENV_FILE" "$temp_file"
  mv -f "$temp_file" "$ENV_FILE"
}

# Migrations in this release are additive. The database intentionally remains
# at the newest schema; destructive downgrades require a restore decision.
"${COMPOSE[@]}" stop scheduler >/dev/null 2>&1 || true
# The previous image may predate the dedicated migration/scheduler services.
# --no-deps prevents the new Compose graph from trying to run commands that do
# not exist in that older image; database migrations in this release are additive.
IMAGE_TAG="$PREVIOUS_TAG" "${COMPOSE[@]}" up -d --no-build --no-deps backend frontend
# Se registra en cuanto la versión anterior responde, igual que deploy.sh:
# si algo de abajo corta el script, el estado ya dice qué está corriendo.
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 10 \
  "${LOCAL_URL:-http://127.0.0.1:8090}/health" >/dev/null
printf '%s\n' "$PREVIOUS_TAG" > "$ROOT_DIR/.deploy/current_image_tag"
persist_image_tag "$PREVIOUS_TAG"
# El scheduler se detuvo arriba; si la imagen anterior lo trae, vuelve. Si no
# (imágenes anteriores a la 1.1.0), se dice en vez de callarlo.
IMAGE_TAG="$PREVIOUS_TAG" "${COMPOSE[@]}" up -d --no-build --no-deps scheduler \
  || echo "AVISO: el scheduler quedó detenido; la imagen $PREVIOUS_TAG puede no traerlo" >&2
health_rc=0
ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/production/healthcheck.sh" || health_rc=$?
# 3 = el sitio responde y solo clamav sigue mal (healthcheck.sh): la vuelta sí
# funcionó, y clamav ya quedó avisado al admin.
if [[ "$health_rc" == "3" ]]; then
  echo "AVISO: la versión $PREVIOUS_TAG responde, pero clamav sigue sin estar sano" >&2
elif [[ "$health_rc" != "0" ]]; then
  exit "$health_rc"
fi
echo "Rollback de aplicación completado a $PREVIOUS_TAG"
