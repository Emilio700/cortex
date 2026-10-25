# Despliegue en producción (VPS)

Guía paso a paso para instalar MediSuite en un servidor propio con HTTPS, base de datos PostgreSQL y respaldos diarios. Tiempo estimado: 45–60 minutos.

> Antes de capturar pacientes reales lee también [seguridad.md](seguridad.md), [respaldos.md](respaldos.md) y [cumplimiento.md](cumplimiento.md), y publica tu aviso de privacidad ([plantilla](aviso-privacidad-plantilla.md)).

## 1. Arquitectura

```
Internet ──443──▶ caddy (TLS Let's Encrypt)
                   ├── /api/*            ──▶ api (Node 22 + Fastify) ──▶ db (PostgreSQL 17, red interna)
                   │    (/api/metrics → 404: solo red interna)      ▲ db-init: crea/sincroniza el rol de la app
                   ├── /orthanc, /whisper… ──▶ perfil opcional "servicios" (usuario y contraseña)
                   └── todo lo demás      ──▶ web (Caddy con el build de Vite, CSP y encabezados)
                  backup ──▶ pg_dump + archivos → ./respaldos (cifrado age) → S3 opcional
```

| Servicio | Imagen | Datos persistentes |
|---|---|---|
| `caddy` | `caddy:2.11-alpine` | volumen `caddy-data` (certificados) |
| `web` | construida desde `Dockerfile` (raíz) | — (solo lectura) |
| `api` | construida desde `api/Dockerfile` | volumen `api-files` (documentos subidos) |
| `db` | `postgres:17-alpine` | volumen `db-data` |
| `db-init` | `postgres:17-alpine` (tarea de una sola vez en cada `up`) | — |
| `backup` | construida desde `deploy/backup/` | carpeta `deploy/respaldos/` |

Solo `caddy` publica puertos (80 y 443). La base de datos vive en una red interna sin salida a Internet.

**Base de datos con privilegios mínimos.** Hay dos roles de PostgreSQL:

| Rol | Variable | Uso |
|---|---|---|
| Dueño del esquema (`POSTGRES_USER`, p. ej. `medisuite`) | `POSTGRES_PASSWORD` | Migraciones (`DATABASE_URL_MIGRATIONS`), respaldos, `purgar-archivos`, consola SQL |
| Aplicación (`APP_DB_ROLE`, por defecto `medisuite_app`) | `APP_DB_PASSWORD` | Todo el tráfico normal de la API (`DATABASE_URL`). `LOGIN`, sin superusuario ni DDL; la API le otorga al arrancar solo `SELECT/INSERT/UPDATE`, `DELETE` en `sessions`/`preferencias` y en `audit_log` solo `SELECT/INSERT` |

El rol de la app lo crea `deploy/db/initdb/10-medisuite-roles.sh`: la imagen de PostgreSQL lo ejecuta al inicializar un volumen **nuevo**, y el servicio `db-init` lo vuelve a ejecutar (idempotente) en cada `docker compose up`, lo que cubre volúmenes **ya inicializados** y la rotación de `APP_DB_PASSWORD`. La API no arranca hasta que `db-init` termina bien.

**Contenedores endurecidos:** todos con `no-new-privileges`; `api`, `web`, `caddy` y `db-init` sin *capabilities* (`cap_drop: ALL`; Caddy conserva solo `NET_BIND_SERVICE`); `api`, `web` y `db-init` con sistema de archivos de solo lectura (la API escribe únicamente en el volumen `/data/files` y en un `tmpfs` `/tmp`); la API corre como usuario `node` (no root).

## 2. Elegir el servidor

| Uso | Recomendación mínima |
|---|---|
| Consultorio (1–5 usuarios), sin servicios opcionales | 2 vCPU, 4 GB RAM, 50 GB SSD |
| Con Orthanc/Whisper/Presidio (perfil `servicios`) | 4 vCPU, 8–16 GB RAM, disco según volumen de estudios DICOM |

Proveedores probados con Docker: **DigitalOcean** (Droplet), **Hetzner Cloud** (CX/CPX), **AWS Lightsail**. Elige **Ubuntu 24.04 LTS** y, si te importa la latencia o la residencia de datos, la región más cercana (p. ej. EUA-centro/oeste; ninguno de estos proveedores tiene región en México al momento de escribir esto — si necesitas residencia en México, considera un proveedor nacional y documenta la transferencia en tu aviso de privacidad).

Al crear el servidor:

- Agrega tu **llave SSH** (no uses contraseña para root).
- Activa los **respaldos/snapshots** del proveedor (complementan, no sustituyen, los respaldos de MediSuite).
- En Lightsail/AWS abre en el firewall de la consola los puertos 22, 80 y 443 (TCP) y 443 (UDP, opcional para HTTP/3).

## 3. Dominio y DNS

1. Compra o usa un dominio (p. ej. `miclinica.mx`).
2. Crea un registro **A** (y **AAAA** si tu servidor tiene IPv6) para el subdominio que usarás, p. ej. `expediente.miclinica.mx` → IP pública del servidor.
3. Opcional pero recomendado: registro **CAA** `0 issue "letsencrypt.org"`.
4. Espera a que resuelva: `dig +short expediente.miclinica.mx` debe devolver la IP del servidor **antes** de arrancar (si no, Let's Encrypt fallará y Caddy reintentará).

## 4. Preparar el servidor

Conéctate por SSH y ejecuta (como usuario con sudo):

```bash
# Actualizaciones y utilidades
sudo apt update && sudo apt -y upgrade
sudo apt -y install git ufw fail2ban unattended-upgrades

# Usuario de operación (evita trabajar como root)
sudo adduser --disabled-password --gecos "" medisuite
sudo usermod -aG sudo medisuite
sudo rsync -a ~/.ssh/ /home/medisuite/.ssh/ && sudo chown -R medisuite: /home/medisuite/.ssh

# Docker Engine + Compose v2 (repositorio oficial de Docker)
curl -fsSL https://get.docker.com -o get-docker.sh
less get-docker.sh            # revísalo antes de ejecutarlo
sudo sh get-docker.sh
sudo usermod -aG docker medisuite
docker --version && docker compose version
```

Endurecimiento básico (detalles en [seguridad.md](seguridad.md#2-servidor)):

```bash
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo dpkg-reconfigure -plow unattended-upgrades   # responde "Sí"
```

> **Importante:** los puertos que publica Docker **no pasan por ufw**. Por eso el `docker-compose.yml` solo publica 80/443 y el puerto DICOM 4242 únicamente en `127.0.0.1`. No agregues `ports:` a `db` ni a `api`.

Desactiva el acceso SSH con contraseña y el login de root en `/etc/ssh/sshd_config` (`PasswordAuthentication no`, `PermitRootLogin no`) y reinicia con `sudo systemctl restart ssh` — **comprueba antes** que puedes entrar con tu llave como `medisuite`.

## 5. Obtener MediSuite y configurar

```bash
sudo -iu medisuite
git clone https://github.com/<tu-organizacion>/medisuite.git
cd medisuite/deploy
cp .env.example .env
chmod 600 .env
```

Genera los secretos y pégalos en `.env`:

```bash
openssl rand -base64 32                 # → MASTER_KEY  (32 bytes en base64)
openssl rand -base64 24 | tr -d '/+='   # → POSTGRES_PASSWORD
openssl rand -hex 24                    # → APP_DB_PASSWORD (distinta; va dentro de una URL: sin / + = @)
openssl rand -base64 18                 # → ADMIN_PASSWORD (mínimo 10 caracteres)
```

Edita `.env` (`nano .env`) y define como mínimo:

| Variable | Ejemplo | Notas |
|---|---|---|
| `DOMINIO` | `expediente.miclinica.mx` | Debe resolver a este servidor |
| `ACME_EMAIL` | `sistemas@miclinica.mx` | Avisos de Let's Encrypt |
| `POSTGRES_PASSWORD` | (generada) | Dueño del esquema (migraciones, respaldos) |
| `APP_DB_PASSWORD` | (generada) | Rol restringido `medisuite_app` con el que trabaja la API |
| `MASTER_KEY` | (generada) | **Guárdala también en tu gestor de contraseñas.** Sin ella no se pueden descifrar los secretos de 2FA ni las llaves de firma, ni siquiera desde un respaldo. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | | Administrador inicial; solo se usa si la base está vacía |
| `ORG_NAME` | `Consultorio Dra. Pérez` | |
| `SEED_DEMO` | `false` | `true` solo para un servidor de demostración |
| `BACKUP_AGE_RECIPIENTS` | `age1...` | Llave pública para cifrar respaldos (ver [respaldos.md](respaldos.md)) |

Guarda una copia del archivo `.env` completo **fuera del servidor** (gestor de contraseñas o bóveda cifrada).

## 6. Arrancar

```bash
cd ~/medisuite/deploy
docker compose up -d --build        # la primera vez compila web, api y backup (5–10 min)
docker compose ps -a                # todos "running"/"healthy"; db-init "exited (0)"
docker compose logs db-init         # "[medisuite-roles] rol medisuite_app listo…"
docker compose logs -f caddy        # verás "certificate obtained successfully"
docker compose logs api | tail -50  # migraciones aplicadas, administrador creado
```

Comprueba:

```bash
curl -s https://expediente.miclinica.mx/api/health      # {"app":"medisuite","version":"1.x","db":"ok"}
curl -sI https://expediente.miclinica.mx/ | grep -iE 'strict-transport|content-security'
```

Prueba externa opcional: <https://www.ssllabs.com/ssltest/> (esperado A/A+) y <https://securityheaders.com/>.

## 7. Primer inicio de sesión

1. Abre `https://TU-DOMINIO` en Chrome o Edge. La app detecta el servidor (`/api/health`) y muestra la pantalla de **inicio de sesión** (si ves datos de demostración sin pedir contraseña, la API no está respondiendo: revisa `docker compose logs api`).
2. Entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Menú del usuario → **Cambiar contraseña** (usa una nueva, distinta de la del `.env`).
4. Menú del usuario → **Activar verificación en dos pasos**: escanea el código QR con Google Authenticator, Microsoft Authenticator, 1Password, Aegis, etc., e ingresa el código de 6 dígitos. La hora del servidor y del teléfono deben estar sincronizadas.
5. Borra `ADMIN_PASSWORD` del `.env` (ya no se usa después del primer arranque) y ejecuta `docker compose up -d` para recrear la API sin esa variable.
6. **Sistema → Usuarios**: crea una cuenta por persona (nunca cuentas compartidas) con el rol mínimo necesario (`medico`, `enfermeria`, `recepcion`, `admin`). Pide a cada usuario que active la verificación en dos pasos; como administrador puedes ver quién la tiene activa.
7. **Configuración**: datos de la clínica y perfil del médico (cédula profesional, especialidad).
8. **Sistema → Bitácora**: verifica que aparezcan tus inicios de sesión.

## 8. Perfil opcional "servicios" (Orthanc, OHIF, Whisper, Presidio)

```bash
# Hash de la contraseña para /orthanc, /whisper, /presidio-*
docker run --rm caddy:2.11-alpine caddy hash-password --plaintext 'una-contraseña-larga'
# Pega el resultado en .env ENTRE COMILLAS SIMPLES:  SERVICIOS_HASH='$2a$14$...'
docker compose --profile servicios up -d --build
# Descarga el modelo de Whisper (queda en el volumen whisper-models; tarda unos minutos)
docker compose exec caddy wget -qO- --post-data='' http://whisper:8000/v1/models/Systran/faster-whisper-small
```

En MediSuite → **Servicios** usa URL del mismo origen: `https://TU-DOMINIO/orthanc`, `https://TU-DOMINIO/whisper`, `https://TU-DOMINIO/presidio-analyzer`. El navegador pedirá el usuario y contraseña de servicios la primera vez.

- **OHIF** necesita su propio subdominio: crea el DNS `ohif.miclinica.mx`, define `OHIF_DOMINIO` en `.env`, renombra `caddy/extra/ohif.caddy.example` a `ohif.caddy` y `docker compose up -d caddy`.
- **DICOM desde equipos** (C-STORE al puerto 4242): no lo expongas a Internet. Usa una VPN (WireGuard/Tailscale) y pon `ORTHANC_DICOM_BIND` en la IP de la VPN.
- Fija las etiquetas `latest` de `servidor/docker-compose.yml` a versiones probadas antes de usarlo con pacientes.

## 8 bis. Integraciones de la API v1.1 (opcionales)

Todas se activan con variables en `.env` (ver comentarios en `deploy/.env.example` y `api/README.md`) y `docker compose up -d`. `GET /api/health` muestra cuáles están activas (`servicios: { whatsapp, correo, pac }`), sin secretos.

- **Correo (SMTP):** `SMTP_URL` o `SMTP_HOST/PORT/USER/PASS` y `MAIL_FROM`. Habilita «¿Olvidaste tu contraseña?» (los enlaces usan `PUBLIC_URL = https://DOMINIO`, que compose fija solo), recordatorios por correo y avisos de cuentas bloqueadas.
- **WhatsApp Cloud API:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` y, obligatorias, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`. En Meta configura el webhook `https://TU-DOMINIO/api/webhooks/whatsapp` con el *verify token*. Caddy reenvía esa ruta tal cual (sin sesión ni CSRF, sin modificar el cuerpo) y la API rechaza con `401` todo POST cuya firma `X-Hub-Signature-256` no coincida. Prueba: `curl "https://TU-DOMINIO/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=ok"` → `ok`.
- **Facturación CFDI (Facturapi):** `FACTURAPI_KEY` (`sk_test_…` para pruebas).
- **Archivos en S3:** `STORAGE=s3` y `S3_*`. Ojo: el servicio `backup` ya no los respalda; activa versionado y cifrado del bucket.
- **Zona horaria:** `TZ` (también fija `TZ_CLINICA` de los recordatorios).

### Métricas (Prometheus)

`/api/metrics` **no** es accesible desde Internet: Caddy responde `404` a esa ruta (y a cualquier variante de mayúsculas o codificación). Para monitorear, define `METRICS_TOKEN` y haz que Prometheus lea la API por la red interna de Docker:

```yaml
# prometheus.yml (Prometheus como servicio adicional en la red "medisuite_frontal")
scrape_configs:
  - job_name: medisuite
    metrics_path: /api/metrics
    authorization: { type: Bearer, credentials_file: /etc/prometheus/medisuite-token }
    static_configs: [{ targets: ['api:3000'] }]
```

Comprobación manual: `docker compose exec api node -e "fetch('http://127.0.0.1:3000/api/metrics',{headers:{authorization:'Bearer '+process.env.METRICS_TOKEN}}).then(r=>r.text()).then(console.log)"`. Desde fuera, `curl -i https://TU-DOMINIO/api/metrics` debe dar `404`.

## 9. Actualizar a una nueva versión

```bash
cd ~/medisuite
git fetch --tags
git log --oneline HEAD..origin/main      # qué cambia
docker compose -f deploy/docker-compose.yml exec backup backup.sh now   # respaldo previo
git checkout v2026.11.0                   # o: git pull (rama main)
cd deploy
sed -i 's/^VERSION=.*/VERSION=v2026.11.0/' .env   # etiqueta de las imágenes nuevas
docker compose build --pull
docker compose up -d
docker compose ps && docker compose logs --since 5m api
```

- La API aplica las migraciones de base de datos al arrancar. Lee las notas de la versión por si alguna migración no es reversible.
- Actualiza también las imágenes base: `docker compose pull` (caddy, postgres) — **no** cambies la versión mayor de PostgreSQL (17 → 18) sin un procedimiento de `pg_dump`/restauración.
- Limpia imágenes viejas cada tanto: `docker image prune` (conserva al menos la versión anterior para rollback).

### 9.1 Instalaciones existentes: paso a la API v1.1 (rol de BD de la app)

Las instalaciones creadas antes de la v1.1 tienen un solo rol (`POSTGRES_USER`) y su volumen `db-data` ya está inicializado, así que el script de `/docker-entrypoint-initdb.d` **no** se vuelve a ejecutar. Una sola vez:

```bash
cd ~/medisuite/deploy
docker compose exec backup backup.sh now                       # respaldo previo
echo "APP_DB_ROLE=medisuite_app" >> .env
echo "APP_DB_PASSWORD=$(openssl rand -hex 24)" >> .env          # guárdala también en tu gestor de contraseñas
git pull                                                        # o git checkout <etiqueta>
docker compose build --pull
docker compose run --rm db-init                                 # crea el rol en el volumen existente
docker compose up -d                                            # la API migra y otorga permisos mínimos
docker compose logs --since 5m api | grep -iE "migraci|error"
```

`docker compose up -d` ya ejecuta `db-init` por sí solo; el `run` explícito sirve para ver el resultado antes de recrear la API. Alternativa equivalente, dentro del contenedor de la base (tras `docker compose up -d db` para que reciba `APP_DB_PASSWORD`):

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/10-medisuite-roles.sh
```

Verifica: `docker compose exec db psql -U medisuite -d medisuite -c '\du medisuite_app'` (sin `Superuser`) y `docker compose exec db psql -U medisuite -d medisuite -c "SELECT has_table_privilege('medisuite_app','audit_log','UPDATE')"` → `f`.

## 10. Volver a la versión anterior (rollback)

Si la nueva versión falla **y no tocó la base de datos** (sin migraciones nuevas):

```bash
cd ~/medisuite && git checkout v2026.10.0
cd deploy && sed -i 's/^VERSION=.*/VERSION=v2026.10.0/' .env
docker compose up -d          # usa las imágenes ya construidas con esa etiqueta (o --build)
```

Si la nueva versión **aplicó migraciones**, el código anterior puede no funcionar con el esquema nuevo. Entonces:

1. `docker compose stop api web`
2. Restaura el respaldo tomado justo antes de actualizar ([respaldos.md](respaldos.md#3-restaurar)).
3. Vuelve a la etiqueta anterior como arriba y `docker compose up -d`.
4. Todo lo capturado entre el respaldo y el rollback se pierde: anótalo y recapitúralo, y registra el incidente.

## 11. Operación diaria

| Tarea | Comando |
|---|---|
| Estado | `docker compose ps` |
| Bitácora de un servicio | `docker compose logs --since 1h api` |
| Reiniciar un servicio | `docker compose restart api` |
| Respaldo inmediato | `docker compose exec backup backup.sh now` |
| Espacio en disco | `df -h && docker system df` |
| Consola SQL (dueño; con cuidado) | `docker compose exec db psql -U medisuite medisuite` |
| Re-sincronizar el rol de la app / rotar `APP_DB_PASSWORD` | edita `.env` y `docker compose up -d` (o `docker compose run --rm db-init`) |

Los registros de los contenedores rotan automáticamente (5 × 10 MB por servicio).

## 12. Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Caddy no obtiene certificado | DNS aún no apunta al servidor, o puertos 80/443 cerrados en el firewall del proveedor |
| La app muestra datos demo sin pedir login | La API no responde: `docker compose logs api` (¿falta `MASTER_KEY` o `ADMIN_PASSWORD` débil en el primer arranque?) |
| `api` reinicia en bucle con "Falta MASTER_KEY" | `.env` sin `MASTER_KEY` o con un valor que no es base64 de 32 bytes |
| `api` no arranca: `dependency failed to start: container … db-init … exited (1)` | `docker compose logs db-init`: falta `APP_DB_PASSWORD` o `POSTGRES_PASSWORD` no coincide con la del volumen |
| `api`: `password authentication failed for user "medisuite_app"` | Cambiaste `APP_DB_PASSWORD` sin recrear: `docker compose up -d` (db-init la re-aplica) |
| `api`: `permission denied for table …` | Se restauró un respaldo o se creó una tabla a mano: reinicia la API (`docker compose restart api`) para que vuelva a otorgar permisos |
| Código de 2FA siempre inválido | Hora desincronizada: `timedatectl` en el servidor; hora automática en el teléfono |
| Cámara/micrófono no funcionan | Debe ser HTTPS; revisa permisos del navegador. La CSP permite cámara solo al mismo origen y a Jitsi |
| Un servicio externo no conecta desde la app | Agrega su origen a `CSP_CONNECT_EXTRA` en `.env` y `docker compose up -d web` |
