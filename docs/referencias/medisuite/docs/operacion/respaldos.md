# Respaldos y restauración

## 1. Qué se respalda

El servicio `backup` (imagen `deploy/backup/`, basada en `postgres:17-alpine` + `age` + `rclone`) corre **todos los días a las `BACKUP_TIME`** (03:15 hora de la Ciudad de México por defecto) y genera una carpeta `respaldos/AAAAMMDD-HHMMSS/` con:

| Archivo | Contenido |
|---|---|
| `db.dump[.age]` | `pg_dump` en formato *custom* (comprimido) de toda la base: pacientes, notas, adendas, recetas, cobros, usuarios, bitácora, configuración y llaves de firma **cifradas con `MASTER_KEY`** |
| `files.tar.gz[.age]` | Volumen `api-files`: documentos, fotos, PDF y estudios subidos |
| `SHA256SUMS` | Sumas para verificar integridad |

> Si configuraste la API con `STORAGE=s3` (archivos en un bucket en lugar del volumen), `files.tar.gz` saldrá vacío: protege ese bucket con **versionado** u *object lock* y replicación, porque este servicio no lo copia.

| Queda fuera (respáldalo aparte) | Cómo |
|---|---|
| `deploy/.env` (incluye `MASTER_KEY`) | Copia en gestor de contraseñas / bóveda, **nunca junto a los respaldos** |
| Llave privada `age` para descifrar | Fuera del servidor (gestor de contraseñas + copia impresa o USB en caja fuerte) |
| Certificados TLS (`caddy-data`) | No es necesario: Caddy los vuelve a emitir |
| Perfil `servicios` (`orthanc-db`, `whisper-models`) | Orthanc: ver al final. Los modelos de Whisper se vuelven a descargar |
| Datos del **modo demo** (IndexedDB del navegador) | Configuración → Exportar en cada navegador (no aplica en modo servidor) |

**Por qué este enfoque:** una imagen propia pequeña (≈ 60 líneas de shell) respalda base y archivos en el mismo instante, cifra con `age` (sin llaves privadas en el servidor) y sube con `rclone` a cualquier S3 compatible. Imágenes como `prodrigestivill/postgres-backup-local` solo cubren la base de datos y no cifran; usar `cron` del sistema operativo dejaría la configuración fuera de Docker. Cada respaldo se verifica (`pg_restore --list`), se borra si quedó incompleto y el *healthcheck* del contenedor se pone en `unhealthy` si pasan más de 26 h sin un respaldo exitoso.

**Retención:** `BACKUP_RETENTION_DAYS` (14 por defecto) en local y en el remoto. Los respaldos **no sustituyen la conservación del expediente** (NOM-004: mínimo 5 años): esa la garantiza la base de datos, que no borra notas (solo baja lógica). Si quieres una copia anual de largo plazo, copia manualmente el respaldo del 1.º de enero a un almacenamiento de archivo (p. ej. S3 Glacier / Backblaze con *object lock*).

## 2. Configurar cifrado y copia externa (recomendado)

### Cifrado con age

En **tu computadora** (no en el servidor):

```bash
age-keygen -o medisuite-respaldos.key     # macOS: brew install age · Windows: winget install FiloSottile.age
# Public key: age1qyq...   ← esta va al servidor
```

Guarda `medisuite-respaldos.key` en tu gestor de contraseñas y en un USB en caja fuerte. En `deploy/.env`:

```ini
BACKUP_AGE_RECIPIENTS=age1qyq...   # puedes poner varias separadas por espacio (p. ej. médico titular y responsable de TI)
```

Desde ese momento los respaldos se guardan **solo** cifrados (`.age`). Si pierdes la llave privada, los respaldos son irrecuperables.

### Copia fuera del servidor (S3 compatible)

Crea un *bucket* privado (AWS S3, Backblaze B2, DigitalOcean Spaces, Wasabi, Cloudflare R2) y una llave de acceso **solo para ese bucket**, sin permiso de borrar versiones si el proveedor lo permite (activa *versioning* u *object lock* contra ransomware). En `.env`:

```ini
BACKUP_RCLONE_REMOTE=s3:mi-bucket-medisuite/respaldos
BACKUP_S3_PROVIDER=Other       # AWS, DigitalOcean, Wasabi, Cloudflare, Other…
BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
BACKUP_S3_REGION=us-west-004
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
```

Aplica y prueba:

```bash
cd ~/medisuite/deploy
docker compose up -d backup
docker compose exec backup backup.sh now
docker compose exec backup rclone ls s3:mi-bucket-medisuite/respaldos | tail
```

El proveedor S3 es un **encargado** en términos de la LFPDPPP; como los respaldos van cifrados con una llave que no tiene, el riesgo es bajo, pero menciónalo en tu aviso de privacidad y contrato.

## 3. Restaurar

> Restaurar **sobrescribe** la base de datos destino. Haz antes un respaldo del estado actual (`backup.sh now`) aunque esté dañado.

### 3.1 Restaurar en el mismo servidor

```bash
cd ~/medisuite/deploy
docker compose stop api web                    # nadie escribe durante la restauración
ls respaldos/                                  # elige la carpeta, p. ej. 20261024-031500

# Si los respaldos están cifrados, copia TEMPORALMENTE la llave privada:
install -m 600 /dev/stdin respaldos/.llave <<'EOF'
AGE-SECRET-KEY-1....
EOF

docker compose run --rm \
  -e AGE_IDENTITY=/backups/.llave \
  -e RESTORE_FILES_DIR=/restaurar-archivos \
  -v medisuite_api-files:/restaurar-archivos \
  --entrypoint restore.sh backup /backups/20261024-031500

shred -u respaldos/.llave                      # borra la llave del servidor
docker compose up -d
```

`restore.sh` verifica las sumas SHA-256, descifra en un directorio temporal, ejecuta `pg_restore --clean --if-exists --single-transaction` (todo o nada) como dueño del esquema y extrae los archivos. El respaldo no lleva permisos (`--no-privileges`): al arrancar, la API vuelve a otorgar al rol `medisuite_app` sus permisos mínimos, por eso el `docker compose up -d` final es necesario. Opciones: `--db-only` o `--files-only` como segundo argumento. La extracción de archivos no borra los que se hayan subido después del respaldo (quedan huérfanos, sin registro en la base); son inofensivos.

Al terminar: inicia sesión, abre 2–3 expedientes con documentos, verifica una receta en `/#/verificar` y revisa **Sistema → Bitácora**.

### 3.2 Restaurar en un servidor nuevo (desastre)

1. Prepara el servidor como en [despliegue.md](despliegue.md) (pasos 2–5) con **el mismo `MASTER_KEY`** que el original (sin él, 2FA y llaves de firma no se pueden descifrar: los usuarios tendrían que reconfigurar 2FA y las recetas firmadas antes no verificarían con llaves nuevas).
2. `docker compose up -d db backup` (sin api para que no cree un administrador nuevo).
3. Descarga el respaldo: `docker compose exec backup rclone copy s3:mi-bucket-medisuite/respaldos/20261024-031500 /backups/20261024-031500`.
4. Restaura como en 3.1 y luego `docker compose up -d`.
5. Cambia el DNS a la IP nueva.

### 3.3 Restauración manual (sin el contenedor)

```bash
age -d -i medisuite-respaldos.key -o db.dump db.dump.age
pg_restore --clean --if-exists --no-owner -d "postgres://dueño:clave@host:5432/medisuite" db.dump
# Luego arranca la API (o `npm run migrate` con DATABASE_URL_MIGRATIONS y APP_DB_ROLE) para re-otorgar permisos al rol de la app.
age -d -i medisuite-respaldos.key files.tar.gz.age | tar -xz -C /ruta/archivos
```

## 4. Prueba de restauración mensual (obligatoria)

Un respaldo que nunca se ha restaurado no es un respaldo. Una vez al mes (p. ej. el primer lunes), el responsable de TI:

1. Elige el respaldo **más reciente del almacenamiento remoto** (no el local).
2. Restaura en un entorno aislado — nunca sobre producción. En tu computadora con Docker:

   ```bash
   mkdir prueba && cd prueba
   rclone copy s3:mi-bucket-medisuite/respaldos/AAAAMMDD-HHMMSS ./r   # o descárgalo desde la consola del proveedor
   docker run -d --name pg-prueba -e POSTGRES_PASSWORD=prueba postgres:17-alpine
   sleep 5
   age -d -i ~/medisuite-respaldos.key -o r/db.dump r/db.dump.age
   docker cp r/db.dump pg-prueba:/tmp/db.dump
   docker exec pg-prueba pg_restore -U postgres -d postgres --no-owner /tmp/db.dump
   docker exec pg-prueba psql -U postgres -c "select count(*) from patients where deleted_at is null" \
     -c "select max(fecha) from audit_log"
   age -d -i ~/medisuite-respaldos.key r/files.tar.gz.age | tar -tz | wc -l
   docker rm -f pg-prueba && cd .. && rm -rf prueba   # borra los datos de prueba
   ```

3. Comprueba: el conteo de pacientes es similar al de producción, la fecha más reciente de la bitácora corresponde a la del respaldo, y el número de archivos es coherente.
4. Registra en la bitácora de operación: fecha, respaldo probado, tiempo que tomó, resultado y responsable. Si falla, trátalo como incidente ([seguridad.md](seguridad.md#7-respuesta-a-incidentes)).

Una vez al año haz la prueba completa de **desastre** (3.2) en un servidor temporal, incluyendo login con 2FA y verificación de una receta.

## 5. Vigilancia

- `docker compose ps backup` → debe decir `healthy`.
- `docker compose logs --since 48h backup` → líneas `[backup] fin` diarias.
- Espacio: los respaldos locales ocupan ≈ (tamaño de la base comprimida + archivos) × días de retención. Revisa `du -sh deploy/respaldos`.
- Opcional: monitor externo (Uptime Kuma, Healthchecks.io) que avise si no hay respaldo; puedes agregar un `curl` al final de `backup.sh` en tu copia.

## 6. Orthanc (perfil `servicios`)

Los estudios DICOM viven en el volumen `medisuite_orthanc-db`. Respaldo en frío sencillo (detiene Orthanc unos minutos):

```bash
docker compose stop orthanc
docker run --rm -v medisuite_orthanc-db:/data:ro -v "$PWD/respaldos:/out" alpine \
  tar czf /out/orthanc-$(date +%F).tgz -C /data .
docker compose start orthanc
```

Cífralo con `age -r age1...` antes de sacarlo del servidor. Para volúmenes grandes considera el plugin de almacenamiento S3 de Orthanc o replicar a un segundo PACS.
