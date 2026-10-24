#!/usr/bin/env bash
# Despliegue de G.E.M.S en el servidor.
#
# Plan 32, punto 0. En la 1.1.0 este script recreó los contenedores y luego se
# detuvo porque clamav llevaba días enfermo: el backend no arrancó y el sitio
# dio 502 hasta que alguien entró a mano. Desde aquí el orden es:
#   1. revisar dependencias (clamav) ANTES de tocar lo que está sirviendo;
#   2. si up -d falla, volver solo a la versión anterior y decirlo;
#   3. registrar la versión en cuanto los contenedores nuevos quedan sanos,
#      para que rollback.sh siempre sepa a dónde volver.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
STATE_DIR="$ROOT_DIR/.deploy"
NEW_TAG="${IMAGE_TAG:-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.prod.yml")
# clamav tarda en cargar sus firmas al reiniciar; en el incidente volvió en
# segundos, pero con firmas recién descargadas puede tardar minutos.
CLAMAV_TIMEOUT="${CLAMAV_TIMEOUT:-300}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
fail() { printf '[deploy %s] ERROR: %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; exit 1; }

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

# Estado de salud de un servicio: healthy, unhealthy, starting, none (sin
# healthcheck) o missing (no hay contenedor).
health_of() {
  local id
  id="$("${COMPOSE[@]}" ps -a -q "$1" 2>/dev/null | head -n1)"
  [[ -n "$id" ]] || { echo missing; return; }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo missing
}

wait_healthy() {
  local service="$1" timeout="$2" waited=0 status
  while (( waited < timeout )); do
    status="$(health_of "$service")"
    [[ "$status" == "healthy" ]] && return 0
    sleep 5
    waited=$((waited + 5))
  done
  log "$service sigue en '$(health_of "$service")' tras ${timeout}s"
  return 1
}

# Paso 1. Sin clamav sano el backend nuevo no arranca (depends_on
# service_healthy), así que se revisa antes de recrear nada. Si no se
# recupera, se sale sin tocar backend, frontend ni scheduler: la versión
# vieja sigue atendiendo.
ensure_clamav() {
  local status
  status="$(health_of clamav)"
  log "clamav: $status"
  case "$status" in
    healthy) return 0 ;;
    missing)
      log "clamav no existe todavía (primera instalación): se crea solo"
      "${COMPOSE[@]}" up -d --no-deps clamav ;;
    *)
      log "clamav no está sano: se reinicia y se espera hasta ${CLAMAV_TIMEOUT}s"
      "${COMPOSE[@]}" restart clamav ;;
  esac
  wait_healthy clamav "$CLAMAV_TIMEOUT" && { log "clamav sano"; return 0; }
  "${COMPOSE[@]}" logs --tail 30 clamav >&2 || true
  fail "clamav no quedó sano. No se recreó ningún contenedor: la versión ${PREVIOUS_TAG:-anterior} sigue sirviendo. Revisa 'docker logs gems_clamav_prod' y vuelve a correr deploy.sh."
}

# Paso 2. Si up -d o la verificación fallan, se vuelve a la versión anterior
# con rollback.sh (que levanta con --no-deps, como se hizo a mano en la 1.1.0).
auto_rollback() {
  local motivo="$1"
  # rollback.sh vuelve a lo que diga previous_image_tag; se anuncia eso mismo.
  PREVIOUS_TAG="$(tr -d '[:space:]' 2>/dev/null < "$STATE_DIR/previous_image_tag" || true)"
  if [[ -z "${PREVIOUS_TAG:-}" ]]; then
    fail "$motivo. No hay versión anterior registrada a la cual volver (primera instalación): revisa a mano."
  fi
  log "$motivo. VOLVIENDO SOLO a la versión anterior $PREVIOUS_TAG"
  if ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/production/rollback.sh"; then
    fail "$motivo. Se volvió a $PREVIOUS_TAG y responde. La versión $NEW_TAG NO quedó desplegada; las migraciones aditivas que haya aplicado se quedan."
  fi
  fail "$motivo, y la vuelta automática a $PREVIOUS_TAG TAMBIÉN falló. El sitio puede estar caído: entra al servidor ya."
}

mkdir -p "$STATE_DIR"
[[ -f "$ENV_FILE" ]] || fail "Falta $ENV_FILE"
git -C "$ROOT_DIR" diff --quiet || fail "El árbol de trabajo debe estar limpio"
"${COMPOSE[@]}" config --quiet

PREVIOUS_TAG=""
if [[ -f "$STATE_DIR/current_image_tag" ]]; then
  PREVIOUS_TAG="$(tr -d '[:space:]' < "$STATE_DIR/current_image_tag")"
fi
[[ "$PREVIOUS_TAG" != "$NEW_TAG" ]] || log "Aviso: $NEW_TAG ya es la versión registrada; se vuelve a desplegar"

ensure_clamav

if "${COMPOSE[@]}" ps --status running postgres | grep -q postgres; then
  BACKUP_PATH="$(ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/production/backup.sh")"
  ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/production/verify_restore.sh" "$BACKUP_PATH"
else
  log "Primera instalación: no existe una base activa que respaldar"
fi

# Construir no toca lo que sirve; si falla, nada cambió.
IMAGE_TAG="$NEW_TAG" "${COMPOSE[@]}" build backend frontend || fail "Falló la construcción de $NEW_TAG. No se tocó nada."

# El build pudo tardar minutos: se confirma clamav justo antes de recrear.
ensure_clamav

# A partir de aquí ya se tocó lo que sirve. previous_image_tag se escribe
# ahora y no antes, para que un intento detenido arriba no lo pise.
if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$NEW_TAG" ]]; then
  printf '%s\n' "$PREVIOUS_TAG" > "$STATE_DIR/previous_image_tag"
fi

log "Recreando contenedores con $NEW_TAG"
IMAGE_TAG="$NEW_TAG" "${COMPOSE[@]}" up -d --remove-orphans || auto_rollback "Falló 'up -d' de $NEW_TAG"
for service in backend frontend; do
  wait_healthy "$service" "$HEALTH_TIMEOUT" || auto_rollback "$service de $NEW_TAG no quedó sano"
done

# Paso 3. Sanos: se registra ya, antes de cualquier otra verificación que
# pudiera cortar el script.
printf '%s\n' "$NEW_TAG" > "$STATE_DIR/current_image_tag"
persist_image_tag "$NEW_TAG"
log "Registrado current_image_tag=$NEW_TAG (anterior: ${PREVIOUS_TAG:-ninguna})"

IMAGE_TAG="$NEW_TAG" "${COMPOSE[@]}" exec -T backend alembic current
health_rc=0
PUBLIC_URL="${PUBLIC_URL:-}" ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/production/healthcheck.sh" || health_rc=$?
# 3 = el sitio responde y solo clamav se enfermó después de revisarlo: no es
# motivo para quitar la versión nueva, pero se dice (y el admin ya tiene aviso).
case "$health_rc" in
  0) ;;
  3) log "AVISO: $NEW_TAG responde, pero clamav dejó de estar sano durante el despliegue" ;;
  *) auto_rollback "La verificación de $NEW_TAG falló" ;;
esac
log "Despliegue $NEW_TAG verificado"
