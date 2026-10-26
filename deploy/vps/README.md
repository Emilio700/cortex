# Cortex en el VPS de pruebas

Ambiente de **pruebas con datos ficticios** en un VPS de Hostinger
(Ubuntu 26.04, 2 vCPU, 8 GB de RAM, sin GPU) que comparte con otra app, el
congreso. URL: <https://cortex.makerdeep3d.com>.

No es producción: los pendientes para producción están al final.

## Piezas

| Archivo | Qué hace |
|---|---|
| `docker-compose.vps.yml` | Override sobre `docker-compose.prod.yml` |
| `desplegar.sh` | Se corre en tu equipo: `git archive` + scp + `servidor.sh` por ssh |
| `servidor.sh` | Se corre en el VPS: `.env`, red, atlas, build con vigía de RAM, arranque y seed |

```bash
deploy/vps/desplegar.sh            # despliega develop
deploy/vps/desplegar.sh <rama>     # u otra referencia
CON_SEGMENTADOR=0 deploy/vps/desplegar.sh   # sin el segmentador
```

Necesita la llave `~/.ssh/cortex_vps_ed25519` autorizada para `root@2.25.78.44`.
No usa GitHub: sube lo que hay en la referencia, más `deploy/vps/` del árbol de
trabajo.

En el VPS, `/opt/cortex` se vacía y se vuelve a llenar en cada despliegue, salvo
`.env` y `.atlas/`. Los datos (base, archivos subidos, pesos del segmentador)
viven en volúmenes de Docker y no se tocan.

## Cómo queda la red

```
Internet ─▶ congreso-web-1 (Caddy, 80/443, HTTPS automático)
              ├─ neurocirugiasigloxxi.makerdeep3d.com ─▶ congreso (sin cambios)
              └─ cortex.makerdeep3d.com ──red «edge»──▶ cortex-web:80 (nginx del frontend)
                                                          └─ /api/ ─▶ backend:8000
                                                             (red cortex_network_prod)
```

- El Caddy del congreso ya ocupa 80/443, así que **Cortex no publica ningún
  puerto en el host**. El frontend se une a la red externa `edge` con el alias
  `cortex-web`; el Caddy del congreso se une a la misma red y le pasa el tráfico.
- `edge` sólo la comparten el frontend de Cortex y el Caddy. Backend, base y
  segmentador quedan en `cortex_network_prod`, que el congreso no ve.
- El cambio al congreso (un bloque nuevo en su Caddyfile y la red `edge` en su
  servicio `web`) está anotado en `/opt/congreso/deploy/CAMBIO-CORTEX.md` del VPS
  para que su repo lo incorpore. Si su `web` se reconstruye sin ese cambio,
  Cortex deja de verse desde fuera, pero sigue corriendo.

## Configuración (`/opt/cortex/.env`)

`servidor.sh` lo genera **en el VPS** la primera vez, con `openssl rand`, y lo
deja con permisos 600. Nunca se versiona ni se copia fuera. Valores que importan:

| Variable | Valor | Por qué |
|---|---|---|
| `ENVIRONMENT` | `production` | Activa `validate_production_safety` |
| `FRONTEND_URL`, `CORS_ORIGINS` | `https://cortex.makerdeep3d.com` | La validación exige HTTPS público y orígenes exactos |
| `VITE_API_BASE_URL` | `/` | El bundle llama al mismo origen (`/api/v1`, `/health`); nginx pasa `/api/` al backend |
| `ANTIVIRUS_ENABLED`, `ANTIVIRUS_REQUIRED` | `false` | Ver «ClamAV» abajo. La validación rechaza `REQUIRED=true` con `ENABLED=false`, por eso van los dos |
| `STORAGE_BACKEND` | `local` | Volumen `cortex_uploads_prod`; válido con una sola réplica del backend |
| `EMAIL_ENABLED` | `false` | Los envíos sólo se registran |
| `IA_PROVEEDOR` | `ninguno` | Sin llave remota (la validación la exige si hay proveedor) |
| `SEGMENTADOR_URL` | `http://segmentador:8000` | Red interna |
| `MFA_REQUIRED_ROLES` | vacío | Pruebas. **Pendiente** para producción |

`validate_production_safety` no exige S3: con `STORAGE_BACKEND=local` pasa.

Lo que el override cambia del compose de producción:

- `clamav` pasa al perfil `antivirus` (no arranca) y `backend`/`scheduler` dejan
  de depender de él.
- `backend`: 2 workers de Gunicorn en lugar de 4 (`WEB_CONCURRENCY=2`, que debe
  coincidir), `APP_NAME=Cortex`, y las variables del segmentador y de la IA, que
  `docker-compose.prod.yml` no le pasaba.
- `frontend`: sin `ports`, en `cortex_network` y en `edge` (alias `cortex-web`).
- `segmentador` (CPU, imagen `cortex-segmentador:0.1.0`), sin puertos, con
  `mem_limit: 6g` (`SEGMENTADOR_MEMORIA`), `shm_size: 1gb`, resolución normal
  (`SEGMENTADOR_RAPIDO=0`) con respaldo a rápida, y pesos en el volumen
  `cortex_segmentador_pesos_prod`.

`!override` y `!reset` son etiquetas de Docker Compose (≥ 2.24). Algunos
linters de YAML las marcan como «Unresolved tag»; Compose las entiende.

### ClamAV

ClamAV carga sus firmas en memoria: ~1.2–1.5 GB fijos. El VPS tiene ~6.8 GB
disponibles con el congreso arriba; Cortex en reposo usa ~0.4 GB (backend con 2
workers ~250 MB), y una segmentación en CPU sube a 5–5.6 GB (ver «Segmentador»). Con ClamAV encendido no
queda margen y el kernel podría matar procesos del congreso. **En pruebas está
apagado.** Las subidas no se escanean (el servicio de antivirus lo permite
cuando `ANTIVIRUS_ENABLED=false`).

Para encenderlo: `ANTIVIRUS_ENABLED=true`, `ANTIVIRUS_REQUIRED=true` en `.env`,
quitar el bloque `clamav:` del override y devolver la dependencia; y no levantar
el segmentador en la misma máquina.

## Atlas detallado (BodyParts3D)

`servidor.sh` lo genera **una vez** con `scripts/atlas/preparar_atlas.py` en un
contenedor efímero `python:3.12-slim` (instala `trimesh numpy scipy
fast-simplification`, baja el zip de ~140 MB, verifica su SHA-256 y lo borra al
terminar). Lo deja en `/opt/cortex/.atlas/bodyparts3d/`, fuera del código, y en
cada despliegue lo copia a `frontend/public/atlas/bodyparts3d/` **antes** del
build: Vite lo copia a la salida y queda dentro de la imagen del frontend.

Se eligió el build y no el contenedor en marcha porque nginx sirve archivos
estáticos de la imagen: sin volumen extra, el atlas sobrevive a recrear el
contenedor. Para regenerarlo: borra `/opt/cortex/.atlas` y vuelve a desplegar.
Si la preparación falla, el despliegue sigue y Neuro 3D muestra «Atlas
detallado» deshabilitado con su motivo.

## Datos de prueba

`servidor.sh` corre `python -m scripts.seed_cortex` dentro del backend (es
idempotente). La contraseña común de los usuarios sembrados se genera en el VPS
y queda en `/root/cortex-credenciales-prueba.txt` (permisos 600). La salida del
seed se filtra para no mostrarla.

## Segmentador en CPU

```bash
docker compose -p cortex -f docker-compose.prod.yml -f deploy/vps/docker-compose.vps.yml stop segmentador   # liberar RAM
docker compose -p cortex -f docker-compose.prod.yml -f deploy/vps/docker-compose.vps.yml up -d segmentador
```

En reposo ocupa ~0.3 GB; durante una segmentación sube a 5–5.6 GB. El tope
`mem_limit` hace que, si no alcanza, el kernel mate al motor **dentro** del
contenedor (el servicio responde 503 `sin_ram` y sigue vivo) y no a un proceso
del congreso.

### Medido en el VPS (2026-10-26)

Mismo estudio que en la G15: `s0923` del conjunto de TotalSegmentator v2.0.1
(CC BY 4.0), TC de cuello a pelvis, 500 cortes DICOM en ZIP (45 MB).
`POST /segmentar?region=columna&modalidad=CT` desde la red interna. Pesos bajados
antes (no cuentan): `total_fast` 317 MB en 7 s; `total` 1.2 GB más en 23 s.
Dice: malla voxelizada contra las máscaras de referencia, 26 estructuras.

| | CPU VPS rápida (3 mm) | CPU VPS normal (1.5 mm) | G15 rápida | G15 normal |
|---|---|---|---|---|
| Total de pared | **92.7 s** | **267.4 s** | 51.8 s | 54.1 s |
| dcm2niix | 2.0 s | 2.0 s | 15.6 s | 14.3 s |
| Segmentación | 72.0 s | 248.7 s | 22.9 s | 27.5 s |
| Lectura de máscaras | 4.3 s | 4.2 s | 2.3 s | 2.3 s |
| Mallas + GLB | 12.9 s | 11.2 s | 10.2 s | 9.4 s |
| RAM pico del contenedor | 5.6 GB | 5.0 GB | 3.7 GB (+VRAM 3.9 GB) | 3.9 GB (+VRAM 2.7 GB) |
| RAM mínima disponible del VPS | 1.2 GB | 2.0 GB | — | — |
| Dice mediano | **0.864** | **0.985** | 0.863 | 0.985 |
| Peores | C1 0.777 · C6 0.787 · C4 0.796 | C4 0.949 · médula 0.953 · C1 0.962 | C1 0.777 · C6 0.787 · C4 0.797 | C4 0.949 · médula 0.953 · C1 0.962 |

- La calidad es la misma que en GPU: el modelo es el mismo, sólo cambia dónde
  corre.
- Con `mem_limit: 5g`, la rápida **no cupo** (503 `sin_ram` a los 56 s, servicio
  vivo, VPS con 1.3 GB disponibles). Por eso el tope es de 6 GB.
- La normal pide **menos** RAM que la rápida: recorta a la columna con el
  modelo de 6 mm antes de correr sus subtareas, mientras que la rápida corre las
  117 clases sobre todo el volumen. Como además es mucho mejor, queda por omisión.
- 4.5 min está muy por debajo del límite del backend (1800 s). Dos
  segmentaciones a la vez comparten los 6 GB y la segunda puede responder
  `sin_ram`.

## Operación

```bash
cd /opt/cortex
C="docker compose -p cortex -f docker-compose.prod.yml -f deploy/vps/docker-compose.vps.yml"
$C ps
$C logs -f backend
free -m                     # el VPS es compartido: vigila la RAM
```

**Nunca** `docker system prune`, `docker volume prune` ni nada global: hay
volúmenes del congreso en la misma máquina.

## Pendientes para producción real

- `MFA_REQUIRED_ROLES=master,admin,doctor`.
- Antivirus encendido (`ANTIVIRUS_ENABLED=true`, `ANTIVIRUS_REQUIRED=true`) en
  una máquina con RAM para ClamAV.
- Correo real (`EMAIL_ENABLED=true` y SMTP).
- Respaldos de `cortex_postgres_data_prod` y `cortex_uploads_prod` (el compose
  de producción no trae servicio de respaldo).
- Un proxy propio o el cambio del Caddy integrado al repo del congreso; hoy
  Cortex depende de ese Caddy para salir a internet.
- Segmentador en una máquina aparte (o con GPU): en CPU compite por RAM con la
  consulta.
- `frontend/nginx.conf` limita el cuerpo a 16 MB (`client_max_body_size 16m`),
  pero la carga de estudios DICOM manda todos los archivos en una petición y el
  backend acepta hasta 400 MB: un estudio de más de 16 MB subido desde el
  navegador recibiría 413. No se cambió aquí porque es configuración compartida
  con producción.
- Despliegue desde una etiqueta `vX.Y.Z` de `main`, no desde `develop`.
