#!/usr/bin/env bash
# Parte de servidor del despliegue de Cortex en el VPS de pruebas. La llama
# desplegar.sh por ssh después de subir el código; también se puede correr a
# mano en el VPS:  bash /opt/cortex/deploy/vps/servidor.sh
#
# Qué hace (cada paso se puede repetir sin efectos de más):
#   1. Genera /opt/cortex/.env con secretos nuevos si no existe (permisos 600).
#   2. Crea la red externa «edge» si falta.
#   3. Prepara el atlas BodyParts3D una vez, en /opt/cortex/.atlas, y lo copia a
#      frontend/public/atlas/ antes del build (Vite lo lleva a la imagen).
#   4. Construye las imágenes de una en una, con un vigía de RAM que corta el
#      build de Cortex si el VPS baja de MIN_DISPONIBLE_MB.
#   5. Levanta todo (migrate corre antes que backend y scheduler).
#   6. Siembra el consultorio ficticio (idempotente) con la contraseña guardada
#      en /root/cortex-credenciales-prueba.txt.
#
# Nunca imprime secretos: ni el .env ni las contraseñas del seed salen a la
# terminal ni a los logs.
set -euo pipefail

RAIZ=${RAIZ:-/opt/cortex}
PROYECTO=cortex
DOMINIO=${DOMINIO:-cortex.makerdeep3d.com}
CREDENCIALES=${CREDENCIALES:-/root/cortex-credenciales-prueba.txt}
MIN_DISPONIBLE_MB=${MIN_DISPONIBLE_MB:-500}
# 0 = no construir ni levantar el segmentador (p. ej. si la RAM no alcanza).
CON_SEGMENTADOR=${CON_SEGMENTADOR:-1}

cd "$RAIZ"
COMPOSE=(docker compose -p "$PROYECTO" -f docker-compose.prod.yml -f deploy/vps/docker-compose.vps.yml)

disponible_mb() { free -m | awk '/^Mem:/ {print $7}'; }
paso() { printf '\n== %s  (RAM disponible: %s MB)\n' "$1" "$(disponible_mb)"; }

# ── 1. .env ─────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  paso "Generando .env con secretos nuevos"
  # umask sólo en el subshell: si se quedara, el atlas y lo que se copie al
  # build saldrían con permisos 600 y nginx respondería 403.
  ( umask 077; cat > .env <<EOF
# Generado en el servidor por deploy/vps/servidor.sh el $(date -u +%F).
# Ambiente de PRUEBAS con datos ficticios. No copiar este archivo a ningún lado.
POSTGRES_USER=cortex_user
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=cortex_db
SECRET_KEY=$(openssl rand -hex 32)
ENVIRONMENT=production
FRONTEND_URL=https://${DOMINIO}
CORS_ORIGINS=https://${DOMINIO}
# El navegador llama al API en el mismo origen: nginx del frontend pasa /api/ al
# backend. Con "/" el bundle arma "/api/v1" y "/health".
VITE_API_BASE_URL=/
ACCESS_TOKEN_EXPIRE_MINUTES=30
# Pruebas: sin MFA obligatorio. PENDIENTE para producción: master,admin,doctor.
MFA_REQUIRED_ROLES=
MFA_ISSUER=Cortex
MAX_TENANTS=5
# Pruebas: ClamAV apagado por RAM (ver README). PENDIENTE para producción.
ANTIVIRUS_ENABLED=false
ANTIVIRUS_REQUIRED=false
STORAGE_BACKEND=local
EMAIL_ENABLED=false
EMAIL_FROM_NAME=Cortex
IA_PROVEEDOR=ninguno
SEGMENTADOR_URL=http://segmentador:8000
SEGMENTADOR_TIEMPO_LIMITE_SEGUNDOS=1800
SEGMENTADOR_RAPIDO=0
IMAGE_TAG=vps
EOF
  )
fi
chmod 600 .env

# ── 2. Red compartida con el Caddy del congreso ─────────────────────────────
docker network inspect edge >/dev/null 2>&1 || { paso "Creando red edge"; docker network create edge >/dev/null; }

# ── 3. Atlas BodyParts3D ────────────────────────────────────────────────────
# Se genera una vez fuera del árbol del código (que se reemplaza en cada
# despliegue) y se copia antes del build. Si falla, Cortex funciona igual: la
# opción «Atlas detallado» sale deshabilitada con su motivo.
ATLAS=$RAIZ/.atlas/bodyparts3d
if [ ! -f "$ATLAS/manifiesto.json" ]; then
  paso "Preparando el atlas BodyParts3D (descarga ~140 MB, una sola vez)"
  mkdir -p "$ATLAS"
  if ! docker run --rm --name cortex-atlas-prep --memory 2g \
      -v "$RAIZ/scripts/atlas:/repo/scripts/atlas:ro" -v "$ATLAS:/salida" python:3.12-slim \
      sh -c 'pip install --quiet --no-cache-dir --root-user-action=ignore trimesh numpy scipy fast-simplification \
             && python /repo/scripts/atlas/preparar_atlas.py --cache /tmp/atlas-cache --borrar-cache --salida /salida'; then
    echo "AVISO: no se pudo preparar el atlas; Neuro 3D seguirá sin «Atlas detallado»." >&2
    rm -f "$ATLAS/manifiesto.json"
  fi
fi
if [ -f "$ATLAS/manifiesto.json" ]; then
  mkdir -p frontend/public/atlas
  rm -rf frontend/public/atlas/bodyparts3d
  cp -r "$ATLAS" frontend/public/atlas/bodyparts3d
  # nginx corre sin privilegios: los archivos estáticos deben ser legibles.
  chmod -R a+rX frontend/public/atlas
fi

# ── 4. Build, de una imagen a la vez, con vigía de RAM ──────────────────────
construir() {
  local servicio=$1
  paso "Construyendo $servicio"
  "${COMPOSE[@]}" build "$servicio" &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(disponible_mb)" -lt "$MIN_DISPONIBLE_MB" ]; then
      echo "ALTO: RAM disponible bajo ${MIN_DISPONIBLE_MB} MB; detengo el build de Cortex ($servicio)." >&2
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      exit 1
    fi
    sleep 2
  done
  wait "$pid"
}
construir backend
construir frontend
[ "$CON_SEGMENTADOR" = "1" ] && construir segmentador

# ── 5. Arranque ─────────────────────────────────────────────────────────────
paso "Levantando Cortex"
if [ "$CON_SEGMENTADOR" = "1" ]; then
  "${COMPOSE[@]}" up -d
else
  "${COMPOSE[@]}" up -d --scale segmentador=0
fi

# ── 6. Seed del consultorio ficticio ────────────────────────────────────────
if [ ! -f "$CREDENCIALES" ]; then
  ( umask 077
  {
    echo "# Cortex · ambiente de PRUEBAS (${DOMINIO}) · datos ficticios"
    echo "# Generado el $(date -u +%F). Misma contraseña para los usuarios sembrados."
    echo "CORTEX_SEED_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
    echo "# Usuarios: master@cortexneuro.mx, admin@cortexneuro.mx, recepcion@cortexneuro.mx, doctor@cortexneuro.mx"
  } > "$CREDENCIALES" )
fi
chmod 600 "$CREDENCIALES"
paso "Sembrando el consultorio ficticio"
CORTEX_SEED_PASSWORD=$(sed -n 's/^CORTEX_SEED_PASSWORD=//p' "$CREDENCIALES")
export CORTEX_SEED_PASSWORD
# El seed imprime «correo / contraseña» de lo que crea: se oculta la contraseña.
"${COMPOSE[@]}" exec -T -e CORTEX_SEED_PASSWORD backend python -m scripts.seed_cortex \
  | sed -E 's#^( +[^ ]+@[^ ]+) / .*#\1 / (ver '"$CREDENCIALES"')#'
unset CORTEX_SEED_PASSWORD

paso "Listo"
"${COMPOSE[@]}" ps --format 'table {{.Name}}\t{{.Status}}'
