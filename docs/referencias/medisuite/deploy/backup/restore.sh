#!/bin/sh
# Restaura un respaldo de MediSuite.
#   restore.sh <carpeta-del-respaldo> [--db-only|--files-only]
# La carpeta es p. ej. /backups/20261024-031500 (o una descargada con rclone a /backups/restaurar/...).
# Si los archivos están cifrados (.age) define AGE_IDENTITY=/ruta/llave.txt (llave privada montada
# temporalmente, NUNCA guardada en el servidor).
# Destino: la base indicada por PGHOST/PGUSER/PGPASSWORD/PGDATABASE y el directorio RESTORE_FILES_DIR
# (por defecto FILES_DIR). ¡SOBRESCRIBE la base de datos destino! Detén la API antes.
set -eu
src="${1:?uso: restore.sh <carpeta> [--db-only|--files-only]}"
modo="${2:-}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

(cd "$src" && sha256sum -c SHA256SUMS) || { echo "¡Las sumas SHA-256 no coinciden! Abortando." >&2; exit 1; }

descifrar() { # $1 = archivo (con o sin .age) → imprime ruta en claro
  if [ -f "$1.age" ]; then
    : "${AGE_IDENTITY:?El respaldo está cifrado: define AGE_IDENTITY con la llave privada age}"
    age -d -i "$AGE_IDENTITY" -o "$tmp/$(basename "$1")" "$1.age"
    echo "$tmp/$(basename "$1")"
  elif [ -f "$1" ]; then
    echo "$1"
  fi
}

if [ "$modo" != "--files-only" ]; then
  db="$(descifrar "$src/db.dump")"
  [ -n "$db" ] || { echo "No hay db.dump en $src" >&2; exit 1; }
  echo "Restaurando base de datos en $PGHOST/$PGDATABASE ..."
  pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error -d "$PGDATABASE" "$db"
  echo "Base de datos restaurada."
fi

if [ "$modo" != "--db-only" ]; then
  dest="${RESTORE_FILES_DIR:-${FILES_DIR:-}}"
  files="$(descifrar "$src/files.tar.gz")"
  if [ -n "$files" ] && [ -n "$dest" ]; then
    echo "Restaurando archivos en $dest ..."
    mkdir -p "$dest"
    tar -C "$dest" -xzf "$files"
    echo "Archivos restaurados."
  else
    echo "Sin archivos que restaurar (o RESTORE_FILES_DIR vacío)."
  fi
fi
