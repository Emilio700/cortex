# Revisión de seguridad — MediSuite API v1.1 y despliegue

| | |
|---|---|
| Fecha | 24 de octubre de 2026 |
| Versión revisada | API `1.1.0` (`api/`), despliegue `deploy/`, `Dockerfile`, CI; frontend solo en lectura (`src/`) |
| Tipo | Revisión interna de código y configuración (caja blanca), estilo OWASP ASVS 4.0 nivel 2, enfocada en hallazgos reales |
| Resultado | 13 hallazgos corregidos con prueba de regresión o validación, 3 pendientes en el frontend, 1 pendiente en la API, 7 riesgos aceptados y documentados |

> Esta revisión **no sustituye** una prueba de penetración externa ni una auditoría de cumplimiento. Ver «Recomendaciones».

## 1. Alcance

- **API** (`api/src/**`, todas las rutas, incluidas las de v1.1: preferencias, mensajes, facturas, expediente, bloqueo ARCO, llaves, métricas, webhook de WhatsApp, recuperación de contraseña) y migraciones SQL.
- **Despliegue:** `deploy/docker-compose.yml`, Caddy de borde (`deploy/caddy/`), imagen web (`Dockerfile`, `deploy/web/`), respaldos (`deploy/backup/`), CI (`.github/workflows/ci.yml`).
- **Frontend (solo lectura):** `src/lib/api.ts`, `src/lib/session.ts`, `src/lib/store.ts`, `src/components/auth.tsx`, módulos que muestran contenido del usuario o del servidor (búsqueda de `dangerouslySetInnerHTML`, `innerHTML`, `srcdoc`, `window.open`, `document.write`, `href={…}` con datos, renderizador Markdown del asistente) y uso de `localStorage`.
- **Fuera de alcance:** servicios del perfil `servicios` (Orthanc, OHIF, Whisper, Presidio), proveedores externos (Meta, Facturapi, SMTP, S3), sistema operativo del servidor, equipos del consultorio.

## 2. Método

1. Lectura completa del código de la API y del despliegue, siguiendo cada ruta desde el *hook* de sesión/CSRF hasta la consulta SQL.
2. Lista de verificación por área (ASVS V2 autenticación, V3 sesiones, V4 control de acceso, V5 validación, V6 criptografía, V7 errores y bitácora, V8 protección de datos, V12 archivos, V13 API, V14 configuración), más: IDOR entre organizaciones y pacientes, asignación masiva, contaminación de prototipos, SSRF, inyección SQL/JSONB, enumeración de usuarios, repetición de TOTP, tokens de recuperación, firma JWS, AES-GCM, endurecimiento de contenedores y encabezados.
3. Verificación dinámica donde aplica: cada corrección de la API tiene una prueba de integración (PostgreSQL real) que **falla con el código anterior** y pasa con la corrección; el script de roles de BD se probó contra PostgreSQL (privilegios efectivos del rol de la app); las reglas de Caddy se validaron con `caddy validate` y con peticiones reales (variantes de ruta de `/api/metrics`, cuerpo del webhook byte por byte).
4. Pruebas finales: `npm test` (97 pruebas, antes 88), `npm run typecheck`, `npm run build`, `docker compose config` (con y sin perfil `servicios`).

## 3. Hallazgos

Severidad: **Alta** (explotable sin privilegios con impacto en datos de salud) · **Media** · **Baja** · **Info**. Estado: **corregido** / **pendiente** / **aceptado**.

| ID | Sev. | Área | Hallazgo | Estado | Corrección / regresión |
|---|---|---|---|---|---|
| S-01 | Media | API · login | **Enumeración por tiempo:** con la cuenta bloqueada, el login respondía `423` *antes* de calcular scrypt (≈1 ms frente a ≈100 ms de una cuenta inexistente), lo que revelaba qué correos existen. | corregido | Se verifica la contraseña siempre antes de decidir. `test/seguridad.test.ts` («una cuenta bloqueada cuesta lo mismo…») |
| S-02 | Media | API · recuperación | **Enumeración por tiempo en `/api/auth/recuperar`:** el correo se enviaba de forma síncrona solo para cuentas existentes (la respuesta tardaba lo que el SMTP). | corregido | El envío va en segundo plano (`enSegundoPlano`). Prueba con un SMTP que nunca responde: la API contesta `204` de inmediato |
| S-03 | Baja | API · 2FA | **Repetición de TOTP por condición de carrera:** dos logins simultáneos con el mismo código pasaban ambos (el «último paso usado» se leía antes y se escribía sin condición). | corregido | Consumo atómico del paso (`UPDATE … WHERE totp_last_step < $paso`). Prueba con dos logins en paralelo → `[200, 401]` |
| S-04 | Media | API · recuperación | **Enlaces de recuperación vigentes tras cambiar la contraseña:** cambiarla uno mismo, que un admin la restableciera o desactivar la cuenta no invalidaba los enlaces pendientes (30 min). Quien tuviera el correo de la víctima podía retomar la cuenta después de que la víctima reaccionara. | corregido | `invalidarRecuperaciones()` en `/auth/password` y en `PATCH /users/:id` (contraseña o `activo:false`). Dos pruebas |
| S-05 | Baja | API · sesiones | **Fuerza bruta de la contraseña con una sesión robada:** `/api/auth/password`, `/totp/enable` y `/totp/disable` solo tenían el límite global (600/min). | corregido | Mismo límite por IP que el login (`RATE_LIMIT_LOGIN`). Prueba: 4.º intento → `429` |
| S-06 | Media | API · pagos/CFDI | **Asignación masiva e integridad fiscal:** el cliente podía fijar `facturaId`, des-marcar `facturado`, cambiar `monto`/`patientId` o borrar un pago con CFDI timbrado (pago y factura dejaban de coincidir). | corregido | `facturaId` solo lo fija el servidor; con CFDI vigente → `409 pago_facturado` (contrato actualizado en `docs/api.md`). Prueba en `test/facturas.test.ts` |
| S-07 | Baja | API · ARCO | **Facturas de un paciente bloqueado** visibles para no admin en `GET /api/facturas/:id` (nombre y RFC del receptor) y `cancelar`/`enviar` sin `409 paciente_bloqueado`; el reenvío por correo no registraba el destino en la bitácora. | corregido | `getFactura()` aplica la regla de bloqueo; la bitácora guarda `destino`. Prueba en `test/facturas.test.ts` |
| S-08 | Baja | API · configuración | **URLs de servicios sin validar** (`settings.servicios`): un admin podía guardar `javascript:`/`data:` o URLs con credenciales, que los navegadores de todo el personal usan en enlaces y `fetch`. (React 19 ya bloquea `javascript:` en `href`: defensa en profundidad.) | corregido | Solo `http(s)://` sin credenciales o rutas del mismo origen (`/orthanc`). Prueba |
| S-09 | Media | Despliegue · BD | **La API se conectaba como superusuario de PostgreSQL** (`POSTGRES_USER`): la inmutabilidad de la bitácora dependía de un *trigger* que ese rol puede desactivar, y un SQLi o RCE tendría DDL completo. | corregido | Rol `medisuite_app` (LOGIN, sin superusuario/DDL/BYPASSRLS) creado por `deploy/db/initdb/10-medisuite-roles.sh` y por el servicio `db-init` (también en volúmenes ya existentes); la API usa `DATABASE_URL` con ese rol y migra con `DATABASE_URL_MIGRATIONS`. Verificado: el rol no puede `UPDATE/TRUNCATE audit_log`, `DELETE` en tablas clínicas ni `CREATE/DROP`. Paso en CI |
| S-10 | Media | Despliegue · borde | **`/api/metrics` publicado en Internet** (solo protegido por sesión admin o token): superficie innecesaria y contadores operativos expuestos. | corregido | Caddy responde `404` (también en la imagen web). Probado con `/API/Metrics`, `%73`, `/api//metrics`, `/api/./metrics`, `/api/metrics%2F`. Prometheus lee `api:3000` por la red interna con `METRICS_TOKEN` |
| S-11 | Media | Despliegue · frontend | **Caída silenciosa a modo demo:** si `/api/health` fallaba (API caída, 502), el frontend entraba en modo demo sin login y guardaba en IndexedDB lo capturado; en producción el personal podía registrar datos reales de pacientes en el navegador, sin control de acceso ni bitácora. | corregido (despliegue) | La imagen web de `deploy/` se construye con `VITE_MODE=server` (`Dockerfile` acepta el `ARG`): si la API no responde se muestra el error en el login. Ver F-04 |
| S-12 | Baja | Despliegue · contenedores | Contenedores sin `no-new-privileges` ni `cap_drop`; la API con sistema de archivos escribible. | corregido | Todos con `no-new-privileges`; `api`, `web`, `caddy` y `db-init` con `cap_drop: ALL` (Caddy + `NET_BIND_SERVICE`); `api`, `web` y `db-init` de solo lectura (`tmpfs /tmp` en la API) |
| S-13 | Baja | Despliegue · respaldos | Si no se define `BACKUP_AGE_RECIPIENTS`, los respaldos (datos de salud) quedan en claro sin ningún aviso. | corregido (aviso) / aceptado | `backup.sh` registra «respaldo SIN cifrar» en cada ejecución y se agregó a la lista de verificación. El cifrado sigue siendo decisión del operador (requiere crear su llave `age`) |
| S-14 | Media | Frontend | Datos clínicos en `localStorage` en modo servidor (anatomía, telemedicina) que sobreviven al cierre de sesión. | pendiente (parcial) | El frontend ya usa la API de preferencias; falta borrar los datos heredados. Ver F-01 |
| S-15 | Baja | Frontend | El token de restablecimiento queda en la URL/historial tras usarse. | pendiente | Ver F-02 |
| S-16 | Baja | Frontend | Impresión del odontograma con `document.write` y `<script>` en línea. | pendiente | Ver F-03 |
| S-17 | Info | API · archivos | Un XML subido con elementos XHTML con prefijo (`<x:script>`) se sirve *inline* como `application/xml`. | aceptado | Sin impacto: toda descarga lleva `Content-Security-Policy: default-src 'none'; sandbox` y `nosniff` (sin ejecución de scripts, origen opaco); HTML/SVG se sirven como `text/plain` |
| S-18 | Baja | API · bitácora | Las lecturas masivas (`GET /api/:col` sin `patientId`, que el frontend hace al cargar y cada 60 s) no se registran por paciente; solo se registran las lecturas de un expediente concreto, descargas y exportaciones. | aceptado | Registrar cada sondeo multiplicaría la bitácora sin valor de revisión. Mitigación: roles mínimos y revisión semanal. Ver recomendaciones |
| S-19 | Baja | API · disponibilidad | Listas sin `limit` obligatorio (compatibilidad v1) y `GET /api/export` arma todo en memoria. | aceptado | Solo usuarios autenticados de una organización; `limit` máx. 1000 cuando se usa |
| S-20 | Baja | API · login | Cinco intentos fallidos bloquean una cuenta 15 min (bloqueo dirigido); el `423` confirma que la cuenta existe a quien ya hizo 5 intentos. | aceptado | Compromiso usual de usabilidad: aviso por correo a los admins, desbloqueo por admin o por recuperación, límite por IP |
| S-21 | Baja | BD · bitácora | El dueño del esquema (o un superusuario) puede desactivar el *trigger* de solo inserción; no hay encadenamiento criptográfico de registros. | aceptado | La app ya no usa ese rol (S-09). Recomendación: exportar y firmar/sellar la bitácora periódicamente |
| S-22 | Info | Criptografía | `MASTER_KEY` no se puede rotar (cifra llaves de firma y secretos TOTP). | pendiente (API) | Ya documentado en `seguridad.md` §5; requiere re-cifrado con versión de llave |
| S-23 | Baja | API · retención | Las filas vencidas de `sessions` y `password_resets` (con IP y *user agent*) nunca se purgan. | aceptado | Sin impacto de seguridad directo; agregar limpieza periódica en una versión futura (minimización de datos) |
| S-24 | Info | API · webhook | El webhook de WhatsApp no tiene protección contra repetición (Meta no firma una marca de tiempo). | aceptado | Firma HMAC obligatoria en tiempo constante sobre el cuerpo crudo; los efectos son idempotentes (confirmar/reagendar una cita y avanzar estados sin retroceder) |

### Controles revisados sin hallazgos

- **Aislamiento entre organizaciones / IDOR:** toda consulta filtra por `org_id` de la sesión; el webhook resuelve la organización desde el mensaje enviado y exige que el remitente sea el destinatario; `doctorUserId` y `PATCH /users/:id` validan la organización.
- **Control de acceso por rol** en todas las rutas (incluidas preferencias, mensajes, facturas, expediente, bloqueo, llaves, métricas); recepción sin campos clínicos ni documentos fuera de `consentimiento`/`factura`; archivos de pacientes bloqueados o borrados → `404` para no admin.
- **Inyección SQL / JSONB:** solo consultas parametrizadas; los nombres de tabla/columna interpolados salen de listas fijas; rutas JSONB con literales fijos.
- **Contaminación de prototipos:** el *parser* JSON rechaza `__proto__`/`constructor` (`onProtoPoisoning: error`); zod descarta `__proto__` en los `record`; el *merge* de PATCH usa objetos propios.
- **CSRF:** `X-Requested-With` obligatorio + rechazo de `Origin` ajeno + cookie `SameSite=Strict`; el webhook queda exento pero con HMAC `timingSafeEqual` sobre el cuerpo crudo (analizador encapsulado solo en esa ruta).
- **Sesiones:** token de 256 bits, solo SHA-256 en BD, nuevo en cada login (sin fijación), `HttpOnly`/`Secure`/`SameSite=Strict`/`Path=/api`, expiración por inactividad y absoluta; cambio de contraseña, restablecimiento y desactivación cierran sesiones; los cambios de rol aplican en la siguiente petición.
- **Recuperación:** token aleatorio de 256 bits, solo hash en BD, un uso (actualización condicional), 30 min, el nuevo invalida el anterior, límites por usuario y por IP, respuesta idéntica exista o no la cuenta.
- **Criptografía:** scrypt N=2¹⁵ r=8 p=1 con sal por usuario y comparación en tiempo constante; AES-256-GCM con nonce aleatorio de 96 bits y AAD por contexto (`totp:<id>`, `orgkey:<kid>`); JWS ES256 con `alg` fijado y `kid` buscado en BD; la verificación pública exige token idéntico al emitido.
- **Archivos:** nombre en disco aleatorio (48 hex validado), tipo por bytes mágicos (HTML/SVG → `text/plain`), 25 MB, `Content-Disposition` saneado (sin CR/LF/comillas) + `filename*`, `nosniff`, CSP `sandbox`, `CORP same-origin`, descarga solo con sesión y permiso.
- **SSRF:** la API solo llama a URLs de configuración del servidor (Graph API, Facturapi, SMTP, S3); `settings.servicios` nunca se usa del lado del servidor.
- **Errores y registros:** sin trazas en respuestas; pino sin cuerpos, sin cadena de consulta, con `cookie`/`authorization` redactados; Caddy borra el parámetro `t` de la bitácora de acceso.
- **Encabezados:** HSTS, CSP estricta del frontend (sin `unsafe-eval` ni scripts en línea), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP; la API agrega CSP `default-src 'none'`.
- **IP real:** Caddy reemplaza `X-Forwarded-For` de clientes no confiables y la API confía en un salto (`TRUST_PROXY=1`), así que los límites por IP no se pueden evadir falsificando el encabezado.
- **Frontend:** el Markdown del asistente se arma con nodos de texto de React (sin HTML); no hay `dangerouslySetInnerHTML`/`innerHTML`/`srcdoc`; los `href` con datos usan `tel:`, `mailto:`, `wa.me` codificado o URLs de configuración (React 19 bloquea `javascript:`); el frontend no guarda datos clínicos en IndexedDB en modo servidor (`persist()` lo omite).

## 4. Hallazgos del frontend (para el equipo de `src/`)

| ID | Archivo | Problema | Sugerencia |
|---|---|---|---|
| F-01 (S-14, Media) | `src/modules/anatomia/Cuerpo.tsx` y `src/modules/telemedicina/index.tsx` (versión revisada inicialmente) | En modo servidor se guardaban en `localStorage` borradores por paciente (marcadores con `nota` y EVA, clave `medisuite.anatomia.<patientId>`) y notas de teleconsulta («motivo, hallazgos referidos», `medisuite.telemed.notas.<sala>`). Persisten tras cerrar sesión (`clearServer()` en `src/lib/store.ts:458` solo limpia memoria) y los ve el siguiente usuario del mismo equipo. **Durante la revisión** el frontend pasó ambos módulos a `usePreferencia` (API en modo servidor, `localStorage` solo en demo), lo que corrige lo nuevo. | Falta limpiar lo **ya guardado** por versiones anteriores: al iniciar/cerrar sesión en modo servidor (`endSession` en `src/lib/session.ts:161`) borrar las claves `medisuite.anatomia.*` y `medisuite.telemed.*` (y cualquier otra con datos de pacientes). |
| F-02 (S-15, Baja) | `src/modules/restablecer/index.tsx:10-11` | El token de un solo uso queda en la URL (`#/restablecer?t=…`) y en el historial del navegador después de usarse o de fallar. | Leer el token una vez y quitarlo con `navigate('/restablecer', { replace: true })` (o `history.replaceState`) conservándolo en estado. |
| F-03 (S-16, Baja) | `src/modules/odontograma/index.tsx:177-197` | Arma la impresión con `window.open('')` + `document.write` de HTML concatenado con un `<script>` en línea. La ventana hereda la CSP, así que el script no corre (la impresión automática no funciona) y el escapado `esc()` no cubre comillas (hoy solo se usa en texto). Es frágil ante cambios. | Generar el documento con `textContent`/DOM o reutilizar el flujo de PDF + `imprimirPDF` de la receta; llamar `w.print()` desde la ventana principal en lugar del script en línea. |
| F-04 (S-11, informativo) | `src/lib/api.ts:124-136` | La detección automática cae a modo demo ante cualquier error de `/api/health`. El despliegue ya fuerza `VITE_MODE=server`. | Con `VITE_MODE=server`, mostrar en el login un mensaje claro de «servidor no disponible» con reintento (hoy `boot()` pasa el mensaje de red). Considerar que una imagen de producción no incluya el modo demo. |

## 5. Riesgos residuales

- **Compromiso del servidor o de `.env`:** quien obtenga `MASTER_KEY` y acceso a la BD descifra secretos 2FA y llaves de firma; los datos clínicos en PostgreSQL no tienen cifrado a nivel de campo (dependen del cifrado de disco del proveedor). `MASTER_KEY` aún no se puede rotar (S-22).
- **Integridad de la bitácora frente al administrador de BD** (S-21) y lecturas masivas no registradas por paciente (S-18).
- **Proveedores externos como encargados:** Meta (WhatsApp: teléfono, nombre y fecha de cita), Facturapi (datos fiscales), SMTP, S3, IA. Su seguridad y contratos están fuera de esta revisión.
- **Navegadores del consultorio:** sesión de 12 h máx. en equipos compartidos, descargas de expedientes/recetas y los datos locales de F-01 mientras no se corrijan.
- **Perfil `servicios`** (Orthanc, Whisper, Presidio): protegido solo con HTTP Basic en Caddy; no revisado en profundidad.
- **Sin WAF ni detección de intrusos**; la detección depende de la revisión semanal de la bitácora y de los avisos de bloqueo.
- **Dependencias:** sin escaneo automático de vulnerabilidades (SCA) ni de imágenes en CI.

## 6. Recomendaciones

1. **Prueba de penetración externa antes de producción** con datos reales (aplicación web y API autenticada por rol, webhook, borde TLS), por un tercero independiente; repetir anualmente y tras cambios mayores.
2. Cerrar F-01 a F-03 en el frontend antes de la salida a producción (F-01 primero: limpieza de datos locales heredados).
3. Activar **cifrado de respaldos** (`BACKUP_AGE_RECIPIENTS`) y copia fuera del servidor, y ensayar la restauración mensual ([respaldos.md](respaldos.md)).
4. Agregar a CI: `npm audit --omit=dev` (o Dependabot/Renovate), escaneo de imágenes (Trivy/Grype) y fijar imágenes base por *digest*.
5. Implementar la **rotación de `MASTER_KEY`** (versión de llave en los blobs cifrados + re-cifrado) y la purga periódica de `sessions`/`password_resets` vencidos.
6. Bitácora: exportación periódica firmada o con hash encadenado a almacenamiento WORM (p. ej. S3 con *Object Lock*); considerar un registro agregado de «listados» por usuario y día.
7. Exigir 2FA a roles `admin` y `medico` desde la API (hoy es política organizacional).
8. Cifrado del lado del servidor en S3 (`STORAGE=s3`) y política de bucket privada con versionado.
9. Revisar con asesoría legal el aviso de privacidad respecto de los encargados de v1.1 (Meta, PAC, SMTP) y el procedimiento de notificación de vulneraciones ([seguridad.md](seguridad.md) §7).

## 7. Cambios realizados en esta revisión

- **API:** `src/routes/auth.ts` (S-01–S-05), `src/mail.ts` (tareas en segundo plano), `src/routes/users.ts` (S-04), `src/routes/collections.ts` (S-06), `src/routes/facturas.ts` (S-07), `src/schemas.ts` (S-08). Pruebas: `test/seguridad.test.ts` (nuevo), `test/facturas.test.ts`, `test/correo.test.ts`. Total: **97 pruebas** (88 + 9 regresiones), `typecheck` y `build` sin errores.
- **Despliegue:** `deploy/db/initdb/10-medisuite-roles.sh` (nuevo) y servicio `db-init`; `deploy/docker-compose.yml` (roles, variables v1.1, endurecimiento, `VITE_MODE=server`); `deploy/caddy/Caddyfile` y `deploy/web/Caddyfile` (bloqueo de métricas, nota del webhook); `deploy/.env.example`; `deploy/backup/backup.sh` (aviso sin cifrar); `Dockerfile` (`ARG VITE_MODE`).
- **CI:** prueba del script de roles contra PostgreSQL (crea, rota contraseña, sin privilegios, sin `CREATE`), verificación de `DATABASE_URL` del rol de la app en `docker compose config` y sintaxis de los scripts de shell.
- **Documentación:** `docs/api.md` (`409 pago_facturado`), `api/README.md`, `docs/operacion/despliegue.md` (roles de BD, paso de instalaciones existentes, integraciones v1.1, Prometheus), `seguridad.md`, `respaldos.md`.
