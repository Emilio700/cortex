#!/bin/sh
# Uso: backup.sh loop | now | check
#   loop   espera a BACKUP_TIME (hora local TZ) cada día y respalda (modo del contenedor)
#   now    respalda una vez y termina
#   check  healthcheck: falla si el último respaldo exitoso tiene más de 26 h
#
# Variables:
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE   conexión a PostgreSQL (las usa pg_dump)
#   FILES_DIR             directorio de archivos subidos (montado solo lectura), p. ej. /data/files
#   BACKUP_DIR            destino local (volumen), por defecto /backups
#   BACKUP_TIME           HH:MM diario, por defecto 03:15
#   BACKUP_RETENTION_DAYS días a conservar (local y remoto), por defecto 14
#   BACKUP_AGE_RECIPIENTS llaves públicas age (age1...) separadas por espacio. Si se define, los
#                         respaldos se guardan SOLO cifrados (.age). La llave privada NO va en el servidor.
#   BACKUP_RCLONE_REMOTE  destino rclone, p. ej. "s3:mi-bucket/medisuite" (configurado con RCLONE_CONFIG_S3_*)
#   BACKUP_ON_START       "true" para respaldar también al iniciar el contenedor
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_TIME="${BACKUP_TIME:-03:15}"
RET="${BACKUP_RETENTION_DAYS:-14}"
STAMP_FILE="$BACKUP_DIR/.ultimo-exito"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') [backup] $*"; }

cifrar() { # $1 = archivo; si hay destinatarios age, cifra y borra el original
  if [ -n "${BACKUP_AGE_RECIPIENTS:-}" ]; then
    args=""
    for r in $BACKUP_AGE_RECIPIENTS; do args="$args -r $r"; done
    # shellcheck disable=SC2086
    age $args -o "$1.age" "$1"
    rm -f "$1"
    echo "$1.age"
  else
    echo "$1"
  fi
}

respaldar() {
  ts="$(date +%Y%m%d-%H%M%S)"
  dest="$BACKUP_DIR/$ts"
  mkdir -p "$dest"
  chmod 700 "$BACKUP_DIR" "$dest"
  umask 077
  # Si algo falla, no dejar un respaldo incompleto que parezca válido.
  trap 'rm -rf "$dest"; log "ERROR: respaldo incompleto eliminado"' EXIT
  log "inicio → $dest"
  [ -n "${BACKUP_AGE_RECIPIENTS:-}" ] || log "AVISO: respaldo SIN cifrar (datos de salud en claro). Define BACKUP_AGE_RECIPIENTS con una llave pública age."

  # 1) Base de datos (formato custom: comprimido, restaurable con pg_restore)
  pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$dest/db.dump"
  pg_restore --list "$dest/db.dump" > /dev/null   # verificación básica de integridad
  f_db="$(cifrar "$dest/db.dump")"

  # 2) Archivos subidos (documentos, fotos, PDF)
  if [ -n "${FILES_DIR:-}" ] && [ -d "$FILES_DIR" ]; then
    tar -C "$FILES_DIR" -czf "$dest/files.tar.gz" .
    f_files="$(cifrar "$dest/files.tar.gz")"
  else
    log "aviso: FILES_DIR no existe, se omite la copia de archivos"
    f_files=""
  fi

  (cd "$dest" && sha256sum ./* > ../.sums.tmp && mv ../.sums.tmp SHA256SUMS)
  log "listo: $(du -sh "$dest" | cut -f1) $(basename "$f_db") ${f_files:+$(basename "$f_files")}"

  # 3) Copia fuera del servidor (opcional)
  if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
    rclone copy --no-traverse "$dest" "$BACKUP_RCLONE_REMOTE/$ts"
    rclone delete --min-age "${RET}d" "$BACKUP_RCLONE_REMOTE" || log "aviso: no se pudo aplicar retención remota"
    rclone rmdirs --leave-root "$BACKUP_RCLONE_REMOTE" 2>/dev/null || true
    log "copiado a $BACKUP_RCLONE_REMOTE/$ts"
  fi

  # 4) Retención local
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+$RET" -exec rm -rf {} +
  date +%s > "$STAMP_FILE"
  trap - EXIT
  log "fin"
}

case "${1:-loop}" in
  now)
    respaldar
    ;;
  check)
    # Sano si el último respaldo exitoso (o el arranque, si aún no hay) fue hace menos de 26 h.
    ref="$STAMP_FILE"; [ -f "$ref" ] || ref="$BACKUP_DIR/.inicio"
    [ -f "$ref" ] || exit 1
    edad=$(( $(date +%s) - $(cat "$ref") ))
    [ "$edad" -lt 93600 ] || { echo "último respaldo hace $((edad / 3600)) h"; exit 1; }
    echo "ok ($((edad / 3600)) h)"
    ;;
  loop)
    log "programado diario a las $BACKUP_TIME ($TZ), retención $RET días${BACKUP_AGE_RECIPIENTS:+, cifrado age}${BACKUP_RCLONE_REMOTE:+, remoto $BACKUP_RCLONE_REMOTE}"
    mkdir -p "$BACKUP_DIR" && date +%s > "$BACKUP_DIR/.inicio"
    # Cada respaldo corre en un proceso aparte para que "set -e" aborte ante cualquier error.
    [ "${BACKUP_ON_START:-false}" = "true" ] && { "$0" now || log "ERROR en respaldo inicial"; }
    ultimo=""
    while true; do
      hoy="$(date +%F)"
      if [ "$(date +%H:%M)" = "$BACKUP_TIME" ] && [ "$ultimo" != "$hoy" ]; then
        ultimo="$hoy"
        "$0" now || log "ERROR: el respaldo falló (revisa los mensajes anteriores)"
      fi
      sleep 30
    done
    ;;
  *)
    echo "uso: backup.sh loop|now|check" >&2
    exit 2
    ;;
esac
