#!/bin/sh
# MediSuite: roles de base de datos con privilegios mínimos.
#
#   - Dueño del esquema / migraciones = POSTGRES_USER (lo crea la imagen oficial de postgres).
#   - Rol de la aplicación = APP_DB_ROLE (por defecto medisuite_app): LOGIN, sin superusuario, sin CREATEDB/
#     CREATEROLE/REPLICATION/BYPASSRLS, contraseña APP_DB_PASSWORD. La API le otorga en cada arranque solo
#     SELECT/INSERT/UPDATE (DELETE en sessions y preferencias; en audit_log solo SELECT/INSERT): ver api/README.md.
#
# Se ejecuta de dos formas (es idempotente: crea el rol si falta y, si existe, re-aplica atributos y contraseña):
#   1) Volumen nuevo: la imagen de postgres lo corre desde /docker-entrypoint-initdb.d al inicializar.
#   2) Volumen ya inicializado / cambio de contraseña: el servicio "db-init" de docker-compose lo corre en cada
#      "docker compose up" (por red, con PGHOST=db). Manual:  docker compose run --rm db-init
#
# Compatible con ser "sourced" por docker-entrypoint.sh (sin set -u ni exit salvo en error).

medisuite_roles() {
  _role="${APP_DB_ROLE:-medisuite_app}"
  _user="${PGUSER:-${POSTGRES_USER:-postgres}}"
  _db="${PGDATABASE:-${POSTGRES_DB:-$_user}}"
  if [ -z "${APP_DB_PASSWORD:-}" ]; then
    echo "[medisuite-roles] ERROR: falta APP_DB_PASSWORD (contraseña del rol $_role)." >&2
    return 1
  fi
  case "$_role" in
    *[!a-z0-9_]* | [!a-z_]*) echo "[medisuite-roles] ERROR: APP_DB_ROLE inválido: $_role" >&2; return 1 ;;
  esac
  if [ "$_role" = "$_user" ]; then
    echo "[medisuite-roles] ERROR: APP_DB_ROLE no puede ser el dueño ($_user)." >&2
    return 1
  fi
  psql -X -q -v ON_ERROR_STOP=1 --username "$_user" --dbname "$_db" \
    -v app_role="$_role" -v app_pw="$APP_DB_PASSWORD" -v db="$_db" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'app_role') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD %L', :'app_role', :'app_pw') \gexec
-- Sin pertenencia a otros roles (p. ej. si alguien lo agregó al dueño por error).
SELECT format('REVOKE %I FROM %I', r.rolname, :'app_role') FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = :'app_role' \gexec
-- Solo el dueño crea objetos; la base solo admite conexiones del dueño y de la app.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', :'app_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_role') \gexec
SQL
  echo "[medisuite-roles] rol $_role listo en la base $_db (dueño: $_user)."
}

medisuite_roles || exit 1
