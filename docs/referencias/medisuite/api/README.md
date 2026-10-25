# MediSuite API (backend de producción)

Servidor Node 22 + TypeScript + Fastify 5 + PostgreSQL que implementa el contrato de `../docs/api.md`. El frontend lo detecta con `GET /api/health` y pasa a **modo servidor**.

## Puesta en marcha

```bash
cd api
npm install
cp .env.example .env        # completa DATABASE_URL, MASTER_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev                 # desarrollo (tsx + --watch); lee .env si existe
npm run build && npm start  # producción (dist/server.js)
npm run migrate             # solo aplicar migraciones (tras build)
npm test                    # pruebas de integración (levanta un PostgreSQL embebido)
npm run purgar-archivos -- --antes 2031-01-01 [--confirmar]   # ver «Archivos y retención»
```

Al iniciar, el servidor:
1. aplica `migrations/*.sql` pendientes (cada una en una transacción, registradas en `schema_migrations`, con candado para varias instancias);
2. si no hay usuarios, crea la organización (`ORG_NAME`), el administrador (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) y la llave de firma ES256 de la organización; con `SEED_DEMO=true` carga en su lugar los datos sintéticos de demostración;
3. escucha en `PORT` e inicia el programador de recordatorios si hay WhatsApp o SMTP configurado. `SIGTERM`/`SIGINT` cierran ordenadamente (detiene el programador, deja de aceptar, termina solicitudes, cierra la BD).

Docker: `docker build -t medisuite-api api/` (multi-etapa, `node:22-alpine`, usuario no root, `HEALTHCHECK` a `/api/health`, volumen `/data/files`).

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | — (obligatoria) | PostgreSQL 14+ |
| `MASTER_KEY` | — (obligatoria en producción) | 32 bytes base64 (`openssl rand -base64 32`). Cifra con AES-256-GCM las llaves privadas de firma y los secretos TOTP. Fuera de producción se usa una llave fija de desarrollo con advertencia. |
| `NODE_ENV` | `development` | `production` activa las validaciones estrictas, HSTS y cookie `Secure` |
| `PORT` | `3000` | |
| `FILES_DIR` | `./data/files` | Archivos subidos (nombres aleatorios, fuera de la BD) |
| `COOKIE_SECURE` | `true` en producción | |
| `ORG_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | — | Solo primer arranque. En producción se rechaza una contraseña ausente o débil. |
| `SEED_DEMO` | `false` | `true` + BD vacía → datos sintéticos y usuarios `admin@demo.mx`, `medico@demo.mx`, `recepcion@demo.mx`, `enfermeria@demo.mx` |
| `DEMO_PASSWORD` | `MediSuite2026!` | Contraseña de los usuarios demo |
| `TRUST_PROXY` | `false` | `true` detrás de nginx (IP real en bitácora y límites); acepta número de saltos o lista de IPs |
| `CORS_ORIGIN` | vacío | Orígenes permitidos separados por coma; vacío = solo mismo origen |
| `LOG_LEVEL` | `info` | |
| `RATE_LIMIT_GLOBAL` / `RATE_LIMIT_LOGIN` | `600` / `10` | Solicitudes por minuto por IP |
| `DATABASE_URL_MIGRATIONS` | = `DATABASE_URL` | Conexión del dueño del esquema para migrar (y para `purgar-archivos`). Ver «Base de datos con privilegios mínimos». |
| `APP_DB_ROLE` | — | Rol de la app al que se otorgan permisos mínimos tras migrar (si existe) |
| `PUBLIC_URL` | — | Origen del frontend (enlaces de correo). Requerida para recuperar contraseña. |
| `TZ_CLINICA` | `America/Mexico_City` | Zona horaria de fechas en recordatorios |
| `SMTP_URL` o `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS` | — / `587` | Correo saliente (nodemailer) |
| `MAIL_FROM` | `MediSuite <no-responder@localhost>` | Remitente |
| `RATE_LIMIT_RECUPERAR` | `5` | Solicitudes por minuto por IP a `/api/auth/recuperar` y `/restablecer` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` | — | WhatsApp Cloud API (los tres activan el canal) |
| `WHATSAPP_TEMPLATE_LANG` | `es_MX` | Idioma de la plantilla |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | — | Webhook (verificación y firma HMAC). Obligatorias en producción con WhatsApp. |
| `WHATSAPP_API_BASE` | `https://graph.facebook.com/v21.0` | Solo pruebas/proxy |
| `RECORDATORIO_HORAS` | `24` | Anticipaciones en horas, p. ej. `24,2` |
| `SCHEDULER` / `SCHEDULER_INTERVAL_MS` | `true` / `60000` | Programador de recordatorios |
| `FACTURAPI_KEY` / `FACTURAPI_BASE` | — / `https://www.facturapi.io/v2` | PAC para CFDI 4.0 |
| `STORAGE` | `disk` | `disk` o `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | — / — / `us-east-1` | Almacenamiento S3 compatible (MinIO, R2, AWS) |
| `METRICS_TOKEN` | — | Bearer para `GET /api/metrics` |

Una variable definida con valor vacío (`X=""`) se trata como **no definida** (se usa el valor por defecto); un número inválido detiene el arranque.

## Roles

| Recurso | admin | medico | enfermeria | recepcion |
|---|---|---|---|---|
| patients | RW + borrar (lógico) | RW | R | RW sin `antecedentes`, `notas`, `medicamentosActuales` |
| appointments | RW | RW | R | RW |
| encounters | R | RW (firma) | R | — |
| observations | R | RW | RW | — |
| prescriptions | R | RW | R | — |
| documents | RW | RW | RW (factura solo R) | solo `consentimiento` y `factura` |
| payments | RW | R | — | RW |
| users / audit / export | admin | — | — | — |
| settings | RW | R (+ su perfil y tema) | R (+ tema) | R (+ tema) |
| preferencias `scope=org` | RW | RW | R | R |
| preferencias `scope=user` | propias | propias | propias | propias |
| facturas | RW | R | — | RW |
| mensajes (lista, recordatorio inmediato) | RW | RW | — | RW |
| mensaje de prueba, llaves, métricas, bloqueo ARCO | admin | — | — | — |
| expediente completo (ARCO) | R | R | — | — |
| registros (v1.2) | según tipo: ver «v1.2 registros» en `docs/api.md` (clínicos R; tareas RW; inventario RW; encuestas RW) | según tipo (clínicos RW) | según tipo (clínicos RW salvo certificado/referencia) | solo inventario (R), tareas (RW) y encuestas (RW) |

## Endpoints (resumen)

- `GET /api/health` · `GET /api/public/jwks` · `GET /api/public/verificar?t=<jws>`
- `POST /api/auth/login|logout|password|totp/setup|totp/enable|totp/disable` · `GET /api/auth/me`
- `GET|POST /api/:col` · `GET|PATCH|DELETE /api/:col/:id` con `:col` ∈ patients, appointments, encounters, observations, prescriptions, documents, payments (`?patientId=` filtra)
- `POST /api/encounters/:id/adendas` · `POST /api/prescriptions/:id/cancelar`
- `POST /api/documents` (multipart `file` + `meta`) · `GET /api/files/:id`
- `GET|PATCH /api/settings` · `GET|POST /api/users` · `PATCH /api/users/:id` · `GET /api/audit` · `GET /api/export`
- v1.1: `GET /api/preferencias` · `GET|PUT|DELETE /api/preferencias/:clave?scope=org|user`
- v1.1: `POST /api/auth/recuperar` · `POST /api/auth/restablecer`
- v1.1: `GET /api/mensajes` · `POST /api/mensajes/prueba` · `POST /api/appointments/:id/recordatorio` · `GET|POST /api/webhooks/whatsapp`
- v1.1: `GET|POST /api/facturas` · `GET /api/facturas/:id` · `GET /api/facturas/:id/pdf|xml` · `POST /api/facturas/:id/cancelar` · `POST /api/facturas/:id/enviar`
- v1.1: `GET /api/patients/:id/expediente` · `POST|DELETE /api/patients/:id/bloqueo`
- v1.1: `GET /api/admin/llaves` · `POST /api/admin/llaves/rotar` · `GET /api/metrics`
- v1.1: listas con `?limit=&cursor=` y `?desde=`; `PATCH` con `null` quita la clave
- v1.2: `GET|POST /api/registros` · `GET|PATCH|DELETE /api/registros/:id` (`?tipo=&patientId=&desde=`; permisos por tipo)

Detalle exacto en `../docs/api.md` (sección v1.1).

Errores: `{ "error": "codigo", "message": "texto" }` (+ `detalles` en validación).

## Notas de seguridad

- **Contraseñas:** scrypt (N=2¹⁵, r=8, p=1, sal por usuario), comparación en tiempo constante; mínimo 10 caracteres.
- **Sesiones:** token aleatorio de 32 bytes en cookie `ms_session` (HttpOnly, SameSite=Strict, Path=/api, Secure en producción); en BD solo su SHA-256. Expiran a los 30 min de inactividad o 12 h absolutas. Cambiar la contraseña cierra las demás sesiones; desactivar un usuario cierra todas. Cambiar la contraseña (propia o por un admin), restablecerla o desactivar la cuenta invalida además los enlaces de recuperación pendientes.
- **Bloqueo:** 5 intentos fallidos → cuenta bloqueada 15 min (`423`); además 10 intentos de login/min por IP (`RATE_LIMIT_LOGIN`, que aplica también a cambiar contraseña y activar/desactivar 2FA). El login siempre calcula scrypt (también para cuentas inexistentes o bloqueadas) para no revelar por tiempo qué cuentas existen; el correo de recuperación se envía en segundo plano por la misma razón.
- **2FA:** TOTP (otplib), secreto cifrado, ventana ±30 s, sin reutilizar un código (el paso usado se consume de forma atómica: dos logins simultáneos con el mismo código no pasan ambos).
- **CSRF:** toda petición POST/PATCH/PUT/DELETE exige `X-Requested-With: MediSuite`; además se rechazan peticiones que modifican con `Origin` ajeno. Excepción: `/api/webhooks/*` (llamadas servidor a servidor de Meta), que exige en cambio la firma HMAC `X-Hub-Signature-256`.
- **Firmas:** cada organización tiene un par ES256; la privada se guarda cifrada (AES-256-GCM con `MASTER_KEY`). Las recetas se firman en el servidor; la verificación pública exige firma válida, receta existente con ese mismo token y no cancelada.
- **Archivos:** máx. 25 MB, nombre aleatorio en disco, MIME detectado por bytes mágicos (HTML/SVG se sirven como `text/plain`), descarga solo con sesión y permiso, con `Content-Security-Policy: sandbox` y `nosniff`.
- **Bitácora:** tabla de solo inserción (un *trigger* impide UPDATE/DELETE/TRUNCATE). Registra inicios de sesión, lecturas de expediente, escrituras, firmas, adendas, descargas y exportaciones con IP.
- **Registros:** pino sin cuerpos, sin cadena de consulta y sin cookies; sin trazas de pila en respuestas.
- **Pagos facturados:** `facturaId` solo lo fija el servidor; con un CFDI vigente, el monto y el paciente del pago no cambian y el pago no se borra (`409 pago_facturado`) hasta cancelar la factura.
- **Base de datos:** en producción la app usa un rol sin DDL ni `UPDATE/DELETE/TRUNCATE` sobre `audit_log` (ver «Base de datos con privilegios mínimos»; `deploy/` ya lo configura).
- Revisión de seguridad completa: `../docs/operacion/revision-seguridad.md`.

## Recordatorios por WhatsApp (v1.1)

1. En Meta for Developers crea una app de tipo *Business* con el producto **WhatsApp**, registra el número y genera un **token permanente** de un *System User* con permisos `whatsapp_business_messaging` (→ `WHATSAPP_TOKEN`). El *Phone number ID* va en `WHATSAPP_PHONE_NUMBER_ID`.
2. Crea y espera la aprobación de una plantilla (categoría *Utility*, idioma `es_MX`) con **4 variables en el cuerpo** y **2 botones de respuesta rápida, en este orden**:
   ```
   Hola {{1}}, le recordamos su cita el {{2}} a las {{3}} h en {{4}}.
   [Confirmar]  [Reagendar]
   ```
   El servidor envía `{{1}}` nombre del paciente, `{{2}}` fecha («lunes, 2 de noviembre de 2026»), `{{3}}` hora (`10:00`, zona `TZ_CLINICA`), `{{4}}` clínica, y en los botones (índices `0` y `1`) los *payloads* `CONFIRMAR:<idCita>` y `REAGENDAR:<idCita>`. Si la plantilla no define exactamente esos dos botones de respuesta rápida, Meta rechaza el envío (queda como `fallido`).
3. Webhook: URL `https://<tu-dominio>/api/webhooks/whatsapp`, *Verify token* = `WHATSAPP_VERIFY_TOKEN`, suscribe el campo **messages**. El *App Secret* (Configuración → Básica) va en `WHATSAPP_APP_SECRET`: cada POST se verifica con `X-Hub-Signature-256` sobre el cuerpo crudo; sin firma válida → `401`. Estas rutas no usan sesión ni CSRF. El proxy debe reenviar `/api/webhooks/` sin modificar el cuerpo.
4. Programador: cada minuto (con `pg_try_advisory_lock`, así varias instancias no duplican envíos) busca citas `agendada`/`confirmada` de pacientes no bloqueados que empiezan dentro de la mayor anticipación de `RECORDATORIO_HORAS` y envía la de **menor** anticipación que ya aplica (con `24,2`: uno ~24 h antes y otro ~2 h antes; una cita creada con 5 h de anticipación recibe solo el de «24» al crearse y luego el de «2»). Cada envío queda en `mensajes` con índice único (cita, tipo, horas, inicio de la cita): si la cita se reprograma se vuelve a recordar. Un envío fallido **no se reintenta** automáticamente (se puede reenviar con `POST /api/appointments/:id/recordatorio`).
5. Canal: WhatsApp si está configurado y el teléfono del paciente es un número mexicano válido (se normaliza a E.164 `+52` + 10 dígitos, quitando `044/045/01` y el antiguo `1` de celulares). Si no, **correo** cuando hay SMTP y el paciente tiene `email`.
6. Respuestas: *Confirmar* → la cita pasa de `agendada` a `confirmada` con `confirmacion: { canal: 'whatsapp', fecha }`; *Reagendar* → `reagendar: true` y una línea en `notas` (recepción la ve en la agenda). Solo cuenta si el remitente es el teléfono al que se envió el recordatorio. Los estados `sent/delivered/read/failed` actualizan el mensaje (sin retroceder).

## Facturación CFDI 4.0 con Facturapi (v1.1)

- Da de alta la organización en Facturapi con su CSD (certificado de sello digital), régimen y código postal del emisor; usa su llave secreta (`sk_live_…`; `sk_test_…` para pruebas) en `FACTURAPI_KEY`.
- `POST /api/facturas` timbra un **pago** existente: valida RFC (12 = moral, 13 = física), régimen y uso del CFDI (`D01–D10` solo personas físicas; `XAXX010101000`/`XEXX010101000` con régimen 616 y uso S01), crea una fila `pendiente` (un pago solo puede tener una factura vigente) y llama a `POST /v2/invoices` con un concepto: clave `85121600` (o `claveProdServ`), unidad `E48`, precio = monto del pago, objeto de impuesto `02` con **IVA exento** (servicios médicos, LIVA art. 15 fr. XIV), método `PUE`. Si el médico cobra servicios gravados (p. ej. estética), envía la `claveProdServ` adecuada y factura desde Facturapi; esta versión siempre usa IVA exento.
- El PDF y el XML se descargan del PAC y se guardan como documentos tipo `factura` del paciente; si la descarga falla, se reintenta al pedir `GET /api/facturas/:id/pdf|xml`.
- Cancelación con los motivos del SAT `01–04` (`01` exige el UUID de la factura que sustituye). Al quedar `canceled`, el pago vuelve a `facturado: false`. Si el receptor debe aceptar la cancelación, `status` sigue `valid` con `cancellationStatus: 'pending'`.

## Correo (v1.1)

Con SMTP configurado: recuperación de contraseña (enlace `PUBLIC_URL/#/restablecer?t=…`, token aleatorio de 32 bytes, en BD solo su SHA-256, un solo uso, 30 min, un enlace nuevo invalida el anterior, máx. 3 correos por usuario por hora y `RATE_LIMIT_RECUPERAR` por IP; restablecer cierra todas las sesiones y desbloquea la cuenta, pero **no** desactiva el 2FA), recordatorios de respaldo y aviso a los administradores activos cuando una cuenta se bloquea por intentos fallidos.

## Derechos ARCO y NOM-004 (v1.1)

- **Acceso / portabilidad:** `GET /api/patients/:id/expediente` (médico, admin) devuelve en JSON todo el expediente de un paciente (colecciones, metadatos de documentos, facturas y mensajes) y se registra como `exportar`. Los archivos se descargan aparte con `GET /api/files/:id`.
- **Rectificación:** `PATCH /api/patients/:id` (auditado con los campos cambiados).
- **Cancelación / oposición:** `POST /api/patients/:id/bloqueo { motivo }` (admin). El expediente **se conserva** (la NOM-004-SSA3-2012 obliga a guardarlo al menos 5 años desde el último acto médico); queda oculto para roles no admin (listas y GET → 404, sincronización → `eliminado: true`), no recibe recordatorios y toda escritura responde `409 paciente_bloqueado`. `DELETE /api/patients/:id/bloqueo` lo revierte (queda historial en `bloqueo`).
- **Borrado:** `DELETE /api/patients/:id` es siempre lógico. La API **nunca** purga datos clínicos; una eliminación definitiva tras el plazo legal es una operación manual de BD, fuera de la aplicación, que debe documentarse.

## Archivos y retención (v1.1)

- `STORAGE=disk` (por defecto, `FILES_DIR`) o `STORAGE=s3` con `@aws-sdk/client-s3` (claves `files/<nombre-aleatorio>`; el archivo se sube completo en memoria, máx. 25 MB). La interfaz está en `src/storage.ts`.
- Borrar un documento es lógico y **conserva el archivo**. Para liberar espacio de documentos borrados antes de una fecha:
  ```bash
  npm run purgar-archivos -- --antes 2031-01-01              # simulación: cuenta archivos y MB
  npm run purgar-archivos -- --antes 2031-01-01 --confirmar  # borra el contenido y su fila en files
  ```
  Solo actúa sobre documentos con `deleted_at` anterior a la fecha; los metadatos del documento se conservan y cada purga queda en la bitácora. Usa `DATABASE_URL_MIGRATIONS` (necesita `DELETE` en `files`). Respeta el plazo de la NOM-004 al elegir la fecha.

## Llaves de firma (v1.1)

`POST /api/admin/llaves/rotar` crea una nueva llave ES256 activa (nuevo `kid`); las anteriores quedan inactivas pero siguen publicadas en `/api/public/jwks`, así que las recetas ya emitidas siguen verificando. Rota al menos anualmente o ante sospecha de compromiso de `MASTER_KEY`.

## Operación (v1.1)

- `GET /api/metrics` (admin con sesión o `Authorization: Bearer $METRICS_TOKEN`): texto Prometheus con `medisuite_http_requests_total{method,route,status}`, `medisuite_http_errors_total`, `medisuite_http_request_duration_seconds` (histograma), `medisuite_scheduler_runs_total{resultado}`, `medisuite_mensajes_total{canal,estado}`, `medisuite_webhooks_total`, `medisuite_facturas_total`, `medisuite_uptime_seconds`. Los contadores son **por proceso** (se reinician al reiniciar; Prometheus usa `rate()`). No conviene exponer `/api/metrics` a Internet: limítalo en el proxy.
- `GET /api/health` añade `storage { tipo, estado }`, `scheduler { activo, ultimaEjecucion?, ultimosEnviados?, error? }` y `servicios { whatsapp, correo, pac }` (solo banderas, sin secretos).
- **Retención de la bitácora:** `audit_log` es de solo inserción y crece indefinidamente. Consérvala al menos lo mismo que el expediente (≥ 5 años); para archivar, exporta periódicamente (p. ej. `COPY (SELECT * FROM audit_log WHERE fecha < …) TO …`) con un rol administrativo y guarda el archivo cifrado. La app nunca borra filas de la bitácora (un *trigger* lo impide).

## Base de datos con privilegios mínimos (v1.1)

Recomendado en producción: un rol dueño del esquema (migra) y un rol de la app sin DDL ni borrado de bitácora.

```sql
-- como superusuario
CREATE ROLE medisuite_owner LOGIN PASSWORD '…';
CREATE ROLE medisuite_app   LOGIN PASSWORD '…';
CREATE DATABASE medisuite OWNER medisuite_owner;
\c medisuite
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO medisuite_owner;
```

```env
DATABASE_URL=postgres://medisuite_app:…@db:5432/medisuite
DATABASE_URL_MIGRATIONS=postgres://medisuite_owner:…@db:5432/medisuite
APP_DB_ROLE=medisuite_app
```

En cada arranque (y con `npm run migrate`), tras aplicar migraciones con `DATABASE_URL_MIGRATIONS`, si `APP_DB_ROLE` existe y no es el usuario de la conexión se reaplica (idempotente): `REVOKE ALL` en las tablas, `SELECT, INSERT, UPDATE` en todas, `DELETE` solo en `sessions` y `preferencias`, `SELECT, INSERT` en `audit_log` (sin `UPDATE/DELETE/TRUNCATE`), `SELECT` en `schema_migrations` y uso de secuencias. Si `APP_DB_ROLE` no existe se omite sin error. `purgar-archivos` usa la conexión del dueño.
