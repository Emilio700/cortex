#!/usr/bin/env bash
# Verificación de salud de G.E.M.S. La usa deploy.sh y también corre periódica
# (cron, ver docs/plans/32_despliegue_v1_2_0.md).
#
# Códigos de salida:
#   0  todo responde;
#   1  falla el servicio (proxy, API o base);
#   3  el sitio responde pero clamav no está sano.
# El 3 va aparte porque no tumba el sitio (solo impide subir archivos y el
# próximo despliegue), y rollback.sh no debe confundirlo con una vuelta fallida.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.prod.yml")
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:8090}"

# Queda en el registro del servidor aunque nadie mire la salida del cron.
registrar() {
  if command -v logger >/dev/null 2>&1; then logger -t gems-healthcheck -- "$*" || true; fi
  echo "$*" >&2
}

"${COMPOSE[@]}" ps
curl --fail --silent --show-error --max-time 10 "$LOCAL_URL/health" >/dev/null
api_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "$LOCAL_URL/api/v1/auth/me")"
[[ "$api_status" == "401" ]] || { echo "API proxy inesperado: HTTP $api_status" >&2; exit 1; }
"${COMPOSE[@]}" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=5)" >/dev/null
if [[ -n "${PUBLIC_URL:-}" ]]; then
  curl --fail --silent --show-error --max-time 15 "${PUBLIC_URL%/}/health" >/dev/null
  public_api_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 "${PUBLIC_URL%/}/api/v1/auth/me")"
  [[ "$public_api_status" == "401" ]] || { echo "API pública inesperada: HTTP $public_api_status" >&2; exit 1; }
fi
echo "Servicios, base de datos y proxy responden"

# clamav: en la 1.1.0 llevaba días unhealthy y nadie lo supo, porque la
# dependencia solo se revisa al arrancar. Aquí se revisa en cada corrida y se
# avisa al admin dentro de GEMS (plan 27); el aviso no se repite mientras siga
# abierto y se cierra solo cuando clamav vuelve.
clamav_id="$("${COMPOSE[@]}" ps -a -q clamav 2>/dev/null | head -n1)"
clamav_status="missing"
if [[ -n "$clamav_id" ]]; then
  clamav_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$clamav_id" 2>/dev/null || echo missing)"
fi
if [[ "$clamav_status" == "healthy" ]]; then
  "${COMPOSE[@]}" exec -T backend python -m scripts.aviso_de_sistema sano clamav >/dev/null 2>&1 || true
  echo "clamav sano"
  exit 0
fi
registrar "clamav está '$clamav_status': no se pueden subir archivos y deploy.sh no recreará contenedores. Reinicia con: docker compose -f docker-compose.prod.yml restart clamav"
"${COMPOSE[@]}" exec -T backend python -m scripts.aviso_de_sistema caido clamav \
  || registrar "No se pudo escribir el aviso de sistema al admin"
exit 3
