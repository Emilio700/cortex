# Contrato de la API de MediSuite (v1)

Fuente de verdad compartida entre el backend (`api/`) y el frontend (`src/lib/store.ts` modo remoto). Los cuerpos JSON usan **exactamente** las formas de `src/lib/types.ts` (Patient, Appointment, Encounter, Observation, Prescription, DocumentFile, Payment, Settings).

- Base: mismo origen, prefijo `/api` (el proxy envía `/api/*` al servicio `api`).
- Autenticación: cookie de sesión `ms_session` (HttpOnly, Secure en producción, SameSite=Strict, Path=/api).
- CSRF: toda petición que modifica (POST/PATCH/PUT/DELETE) debe traer el encabezado `X-Requested-With: MediSuite`; si falta → 403.
- Errores: `{ "error": "codigo_corto", "message": "texto en español" }` con status HTTP adecuado (400 validación, 401 sin sesión, 403 sin permiso, 404, 409 conflicto/regla de negocio, 429 límite).
- IDs: el cliente puede enviar `id` (string 1–64 caracteres `[A-Za-z0-9_-]`) para creación optimista; si no, el servidor lo genera. `fecha` si falta = hora del servidor.
- Multi-clínica: todo dato pertenece a la organización (`org`) del usuario; el servidor filtra siempre por ella.

## Detección de modo

`GET /api/health` → `200 { "app": "medisuite", "version": "1.x", "db": "ok" }`. Si responde así, el frontend usa **modo servidor**; si falla, **modo demo local** (IndexedDB, datos sintéticos).

## Autenticación

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password, totp? }` | `200 { user, org }` + cookie · `401 credenciales_invalidas` · `401 { error: "totp_requerido" }` si tiene 2FA y no mandó código · `423 cuenta_bloqueada` (5 intentos fallidos → 15 min) |
| POST | `/api/auth/logout` | — | `204` |
| GET | `/api/auth/me` | — | `200 { user, org }` · `401` |
| POST | `/api/auth/password` | `{ actual, nueva }` (mín. 10 caracteres) | `204` |
| POST | `/api/auth/totp/setup` | — | `{ secret, otpauthUrl }` |
| POST | `/api/auth/totp/enable` | `{ code }` | `204` |
| POST | `/api/auth/totp/disable` | `{ password }` | `204` |

Sesión: expira tras **30 min de inactividad** o **12 h** absolutas. Cada petición válida renueva la inactividad.

```ts
type Rol = 'admin' | 'medico' | 'recepcion' | 'enfermeria'
interface User {
  id: string; email: string; nombre: string; rol: Rol; activo: boolean; totp: boolean
  // perfil profesional (médicos)
  especialidad?: string; cedula?: string; cedulaEspecialidad?: string; universidad?: string
}
interface Org { id: string; nombre: string }
```

## Permisos (los aplica el servidor)

| Recurso | admin | medico | enfermeria | recepcion |
|---|---|---|---|---|
| patients (datos demográficos) | RW + borrar | RW | R | RW (sin `antecedentes`, `notas`, `medicamentosActuales`: el servidor los omite en lectura e ignora en escritura) |
| appointments | RW | RW | R | RW |
| encounters | R | RW | R | — |
| observations | R | RW | RW | — |
| prescriptions | R | RW | R | — |
| documents | RW | RW | RW (excepto tipo `factura` solo R) | solo tipo `consentimiento` y `factura` |
| payments | RW | R | — | RW |
| users | RW | — | — | — |
| settings | RW | R | R | R |
| audit | R | — | — | — |

## Recursos clínicos y administrativos

`:col` ∈ `patients | appointments | encounters | observations | prescriptions | documents | payments`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/:col` | Lista de la organización. Filtros opcionales: `?patientId=`. Respuesta: arreglo. |
| GET | `/api/:col/:id` | Uno. |
| POST | `/api/:col` | Crea. Valida la forma (zod). Devuelve el objeto guardado (con cambios del servidor). |
| PATCH | `/api/:col/:id` | Actualización parcial. Devuelve el objeto completo. |
| DELETE | `/api/:col/:id` | `204`. Los pacientes se borran lógicamente (solo admin) y desaparecen de las listas. |

Reglas de negocio:

- **Notas (NOM-004):** si `encounters.firmada === true`, cualquier PATCH → `409 nota_firmada`, DELETE → `409`. Firmar = `PATCH { firmada: true }` (solo rol `medico`); el servidor fija `firmadaEn` (hora del servidor) y `firmadoPor` (id de usuario). Adendas: `POST /api/encounters/:id/adendas { texto }` → devuelve la nota completa; el servidor pone la fecha y el autor (`{ fecha, texto, autor }`).
- **Recetas:** `POST /api/prescriptions` — el servidor asigna `folio` consecutivo por organización (`RX-000001`), firma con la llave de la organización (ES256, JWS compacto con payload `{ folio, fecha, paciente: iniciales + año de nacimiento, medicamentos: string[], cedula, medico, org }`) y devuelve la receta con `firma`. Ignora `folio`/`firma` del cliente. No se permite PATCH (`409 receta_emitida`); se puede cancelar con `POST /api/prescriptions/:id/cancelar { motivo }` → agrega `cancelada: true`, `motivoCancelacion`.
- **Documentos:** `POST /api/documents` es `multipart/form-data` con campos `file` (máx. 25 MB) y `meta` (JSON con `id?`, `patientId`, `tipo`, `nombre`, `fecha?`, `meta?`). El servidor guarda el archivo fuera de la base (disco/volumen; S3 a futuro) y devuelve el `DocumentFile` con `dataUrl = "/api/files/<id>"` y `mime` detectado. `GET /api/files/:id` sirve el archivo con la sesión (Content-Disposition inline, `Cache-Control: private`). PATCH solo cambia `nombre` y `meta`.
- **Observaciones** con `fuente` en (`bluetooth`, `ocr`, `camara`, `ecg`) se guardan tal cual; el servidor registra el `autor`.
- Todo objeto devuelto puede traer campos de servidor: `creadoPor`, `actualizadoEn`.

## Configuración

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/settings` | `Settings` de la organización **sin** `llavePrivada`, `anthropicApiKey` ni secretos. `settings.doctor` = perfil del usuario actual si es médico; si no, el del primer médico. |
| PATCH | `/api/settings` | admin. Campos: `clinica`, `servicios`, `tema` (preferencia), `doctor` (si el usuario es médico, actualiza su propio perfil; admin puede mandar `doctorUserId`). |

## Usuarios (admin)

`GET /api/users` · `POST /api/users { email, nombre, rol, password, ...perfil }` · `PATCH /api/users/:id { nombre?, rol?, activo?, password?, ...perfil }` (no puede desactivarse a sí mismo ni quitar el último admin).

## Bitácora (admin)

`GET /api/audit?patientId=&userId=&desde=&hasta=&limit=200` → `[{ id, fecha, userId, userNombre, accion, recurso, recursoId, patientId, ip, detalle }]`.

Acciones registradas: `login`, `login_fallido`, `logout`, `crear`, `actualizar`, `borrar`, `firmar`, `adenda`, `ver_expediente` (GET de un paciente o de recursos clínicos con `?patientId=`), `descargar_archivo`, `exportar`. La tabla es de solo inserción (sin UPDATE/DELETE para el usuario de la app).

## Público (sin sesión)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/public/jwks` | `{ keys: [JWK públicos de todas las organizaciones, con kid] }` |
| GET | `/api/public/verificar?t=<jws>` | `{ valida: boolean, cancelada?: boolean, payload?: {...}, emisor?: { clinica, medico, cedula } }` (verifica firma, existencia de la receta y que no esté cancelada) |

## Exportación

`GET /api/export` (admin) → JSON con todas las colecciones de la organización (para respaldo/portabilidad, se registra en bitácora).

## Decisiones de implementación (v1)

1. **Borrado lógico en todas las colecciones.** Los registros de un paciente borrado desaparecen de las listas y su GET devuelve 404.
2. **Recetas:** DELETE → `409 receta_emitida`. El servidor fija `fecha` (forma parte de la firma). `org` en el payload es el id de la organización. Cancelar agrega `canceladaEn` y `canceladaPor`. La verificación exige además que el token sea idéntico a la `firma` guardada; una firma inválida responde solo `{ valida: false }`.
3. **Notas:** se puede firmar al crear (`POST` con `firmada: true`, rol médico). El servidor ignora `firmadaEn`, `firmadoPor` y `adendas` del cliente. Las adendas guardan `autor` (nombre) y `autorId`.
4. **Campos del servidor:** las observaciones traen `autor`; los documentos, `tamano` (bytes). Las creaciones responden `201`.
5. **Integridad:** toda escritura distinta de pacientes valida que `patientId` exista en la organización (`400 paciente_no_encontrado`).
6. **Configuración:** los no-admin solo pueden cambiar `tema` (preferencia personal); un médico puede cambiar `doctor` (su perfil). Un admin sin `doctorUserId` actualiza al primer médico. En `servicios`, una cadena vacía borra la llave. GET incluye `llavePublica`.
7. **Códigos de error adicionales:** `401 totp_invalido`, `400 contrasena_incorrecta | contrasena_debil`, `409 ultimo_admin | no_desactivarse | email_duplicado | id_duplicado | receta_cancelada | totp_activo`, `403 csrf | origen_no_permitido`, `413 archivo_muy_grande`.
8. **Usuarios:** un admin puede reiniciar el 2FA de otro usuario (`PATCH { totp: false }`). El perfil acepta además `direccion`, `telefono` y `rfc`. El email es único en todas las organizaciones.
9. **Bitácora:** cancelar una receta se registra como `actualizar` con `detalle.operacion = 'cancelar'`. Las verificaciones públicas no se registran.
10. **Archivos:** se sirven con `Content-Security-Policy: sandbox`; HTML y SVG subidos se guardan como `text/plain`.

---

## v1.1 (adiciones)

Todo lo anterior sigue igual (compatibilidad total con v1). `GET /api/health` responde `version: "1.1.0"` y campos extra (ver «Operación»). Mismo formato de errores `{ error, message, detalles? }`, misma cookie y mismo encabezado CSRF salvo en `/api/webhooks/*`.

### PATCH con `null`

En `PATCH /api/:col/:id` un valor `null` en el **nivel superior** del cuerpo significa «quitar esta clave» (JSON no tiene `undefined`). Si el campo es obligatorio (`nombre` del paciente, `inicio` de la cita, `nombre` del documento…) → `400 validacion`. Recepción no puede quitar los campos ocultos (`antecedentes`, `notas`, `medicamentosActuales`): se ignoran. Documentos: `meta: null` quita `meta`.
`PATCH /api/users/:id`: `null` en un campo de perfil (`especialidad`, `cedula`, `cedulaEspecialidad`, `universidad`, `direccion`, `telefono`, `rfc`) lo quita (igual que `""`); `null` en `nombre`/`rol`/`activo` → `400`.
`PATCH /api/settings`: `servicios: { orthanc: null }` y `doctor: { cedula: null }` quitan el valor (igual que `""`); `doctor.nombre: null` → `400`.

### Paginación y sincronización incremental (`GET /api/:col`)

| Parámetro | Efecto |
|---|---|
| (ninguno) | Lista completa, como en v1. |
| `limit=1..1000` | Página ordenada por `(creación, id)`. Si hay más, la respuesta trae el encabezado **`X-Next-Cursor`**; pásalo como `cursor` en la siguiente llamada. Sin encabezado = última página. |
| `cursor=<opaco>` | Continúa la paginación (`400 cursor_invalido` si no es válido). |
| `desde=<ISO 8601 con zona>` | Solo registros creados/modificados/borrados **después** de esa fecha. Incluye los borrados (o que ya no son visibles para el usuario: paciente borrado o bloqueado) como `{ id, eliminado: true, actualizadoEn }`; el cliente debe quitarlos de su copia local. La respuesta trae **`X-Sync-Desde`**: úsalo como `desde` de la siguiente sincronización (incluye 5 s de traslape: puede repetir registros, aplícalos de forma idempotente). |

Se combinan (`?desde=…&limit=200&cursor=…`) y con `patientId`. Los cuerpos siguen siendo un arreglo. Los encabezados se exponen al mismo origen (si usas CORS, léelos solo en mismo origen).

### Preferencias (sustituyen a localStorage)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/preferencias?scope=user\|org&prefijo=` | Lista `[Preferencia]` ordenada por clave. `prefijo` opcional (p. ej. `anatomia.borrador.`). |
| GET | `/api/preferencias/:clave?scope=user\|org` | `200 Preferencia`. Si no existe: `200 { clave, scope, valor: null, actualizadoEn: null }`. |
| PUT | `/api/preferencias/:clave?scope=user\|org` | Cuerpo `{ "valor": <cualquier JSON, incluido null> }` (≤ 256 KB serializado; si no → `413 valor_muy_grande`). Crea o reemplaza. Bitácora `actualizar`, `recurso: 'preferencias'`. |
| DELETE | `/api/preferencias/:clave?scope=user\|org` | `204` (también si no existía). |

- `scope` por defecto `user` (privado del usuario). `scope=org`: todos leen; escriben **admin y médico** (otros → `403`).
- `clave`: `^[a-z0-9._-]{1,64}$` (si no → `400 clave_invalida`). Claves previstas: `receta.plantillas` (org o user), `caja.precios` (org), `odontograma.precios` (org), `anatomia.borrador.<patientId>` (user), `telemedicina.notas.<sala>` (user).

```ts
interface Preferencia { clave: string; scope: 'org' | 'user'; valor: unknown; actualizadoEn: string | null; actualizadoPor?: string }
```

### Recuperación de contraseña (sin sesión; requiere `X-Requested-With`)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/recuperar` | `{ email }` | `204` siempre (exista o no el correo). `503 correo_no_configurado` si el servidor no tiene SMTP o `PUBLIC_URL` (el frontend puede ocultar el enlace «¿Olvidaste tu contraseña?»). `429` por límite. |
| POST | `/api/auth/restablecer` | `{ token, nueva }` | `204` · `400 token_invalido` (inexistente, usado, vencido o usuario inactivo) · `400 contrasena_debil` |

El correo trae `${PUBLIC_URL}/#/restablecer?t=<token>`: el frontend lee `t` de la ruta hash y llama a `/restablecer`. Token de un solo uso, 30 min; solicitar otro invalida el anterior. Restablecer cierra todas las sesiones del usuario y quita el bloqueo por intentos; el 2FA sigue activo.

### Citas: campos nuevos

`Appointment` acepta además (opcionales): `notas?: string` (≤ 5000), `reagendar?: boolean` (el paciente pidió reagendar por WhatsApp; recepción lo pone en `false` al resolverlo), `confirmacion?: { canal: 'whatsapp' | 'telefono' | 'presencial' | 'email'; fecha: string }`.
`Payment` acepta además `facturaId?: string` (lo fija el servidor al timbrar; el cliente no puede fijarlo ni cambiarlo). Mientras un pago tenga `facturaId` (CFDI vigente): `facturado`/`facturaId`/`rfc` los conserva el servidor, cambiar `monto` o `patientId` → `409 pago_facturado` y `DELETE` → `409 pago_facturado` (primero se cancela la factura).
`Patient` (respuestas) puede traer `bloqueado: true` y, solo para admin, `bloqueo: { motivo, fecha, por, porNombre }`. El cliente no puede escribir esos campos.

### Mensajes y recordatorios

```ts
interface Mensaje {
  id: string; appointmentId?: string; patientId?: string
  canal: 'whatsapp' | 'email'; tipo: 'recordatorio' | 'manual' | 'prueba'
  horas?: number            // anticipación del recordatorio automático
  citaInicio?: string; destino: string   // +52XXXXXXXXXX o correo
  estado: 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'respondido'
  waId?: string; error?: string; respuesta?: 'CONFIRMAR' | 'REAGENDAR'
  creadoEn: string; actualizadoEn: string; enviadoEn?: string; entregadoEn?: string; leidoEn?: string; respondidoEn?: string; creadoPor?: string
}
```

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/api/mensajes?appointmentId=&patientId=&estado=&canal=&tipo=&desde=&hasta=&limit=200` | admin, médico, recepción | Más recientes primero. |
| POST | `/api/mensajes/prueba` | admin | `{ telefono }` → `201 Mensaje` (plantilla con datos de ejemplo). `400 telefono_invalido`, `503 whatsapp_no_configurado`, `502 envio_fallido` (con `detalles.mensaje`). |
| POST | `/api/appointments/:id/recordatorio` | admin, médico, recepción | Envía ya (tipo `manual`, no impide los automáticos). Canal: WhatsApp si está configurado y el teléfono es válido; si no, correo. `201 Mensaje` · `409 sin_contacto` · `409 cita_no_vigente` (cancelada/atendida/no-asistió) · `409 paciente_bloqueado` · `503 whatsapp_no_configurado` (ni WhatsApp ni correo) · `502 envio_fallido`. |
| GET | `/api/webhooks/whatsapp` | público (Meta) | Verificación `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` → texto del challenge; `403 verificacion_invalida`. |
| POST | `/api/webhooks/whatsapp` | público (Meta) | Sin sesión ni CSRF; exige `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con el App Secret) → si no, `401 firma_invalida`. `200 { ok: true }`. |

Efecto de las respuestas del paciente (botones `CONFIRMAR:<id>` / `REAGENDAR:<id>`): cita `agendada` → `confirmada` + `confirmacion`; `reagendar: true` + línea en `notas`. Se registran en la bitácora con `userNombre: 'WhatsApp (paciente)'`, `detalle.operacion: 'confirmar_whatsapp' | 'reagendar_whatsapp'`; `actualizadoEn` cambia (la sincronización con `desde` las recoge).

### Facturas CFDI 4.0

```ts
interface Factura {
  id: string; paymentId: string; patientId?: string; pacId?: string
  uuid?: string; serie?: string; folio?: string
  status: 'pendiente' | 'error' | 'valid' | 'canceled' | string   // valid/canceled: estado del PAC
  cancellationStatus?: string; total?: number
  receptor: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string; usoCfdi: string; email?: string }
  formaPago: string; usoCfdi: string; error?: string
  cancelacion?: { motivo: '01' | '02' | '03' | '04'; sustitucion?: string; solicitadaEn: string; solicitadaPor: string }
  pdfUrl?: string; xmlUrl?: string   // /api/facturas/:id/pdf|xml
  creadoEn: string; actualizadoEn: string; creadoPor?: string
}
```

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/api/facturas?patientId=&paymentId=&status=&limit=500` | admin, recepción, médico | Más recientes primero. |
| GET | `/api/facturas/:id` | ídem | |
| POST | `/api/facturas` | admin, recepción | `{ paymentId, receptor: { rfc, nombre, regimenFiscal, codigoPostal, usoCfdi, email? }, formaPago, claveProdServ?, descripcion? }` → `201 Factura`. `formaPago`: catálogo SAT c_FormaPago (`01` efectivo, `03` transferencia, `04` tarjeta de crédito, `28` tarjeta de débito, `99` por definir…). `nombre`: razón social exacta de la constancia, en mayúsculas, sin régimen societario. `descripcion` por defecto = `concepto` del pago; `claveProdServ` por defecto `85121600`. Errores: `400 validacion` (RFC/CP/uso/forma de pago), `400 receptor_invalido` (régimen o uso incoherente con persona física/moral), `404` pago, `409 ya_facturado`, `409 paciente_bloqueado`, `422 pac_rechazo` (mensaje del PAC; la factura queda en `status: 'error'` y el pago se puede volver a intentar), `502 pac_error`, `503 pac_no_configurado`. Efecto: el pago queda `facturado: true`, `rfc`, `facturaId`; el PDF y el XML se guardan como documentos `tipo: 'factura'` del paciente (ids `fac-<facturaId>-pdf` / `-xml`). |
| GET | `/api/facturas/:id/pdf` · `/api/facturas/:id/xml` | admin, recepción, médico | Descarga (`Content-Disposition: attachment`), auditada como `descargar_archivo`. |
| POST | `/api/facturas/:id/cancelar` | admin, recepción | `{ motivo: '01'\|'02'\|'03'\|'04', sustitucion?: uuid }` (`01` exige `sustitucion`). → `200 Factura`. `409 factura_no_vigente`. Si queda `canceled`, el pago vuelve a `facturado: false`. Motivos SAT: 01 con errores con relación, 02 con errores sin relación, 03 no se llevó a cabo la operación, 04 operación nominativa en factura global. |
| POST | `/api/facturas/:id/enviar` | admin, recepción | `{ email? }` → `204` (envía el CFDI por correo desde el PAC; sin `email` usa el del receptor; si no hay → `400 sin_correo`). |

### Derechos ARCO

| Método | Ruta | Quién | Notas |
|---|---|---|---|
| GET | `/api/patients/:id/expediente` | médico, admin | `{ formato: 'medisuite-expediente', version: 1, exportadoEn, org, paciente, appointments, encounters, observations, prescriptions, documents, payments, facturas, mensajes }` (documentos: solo metadatos; archivos con `GET /api/files/:id`). Bitácora `exportar`. |
| POST | `/api/patients/:id/bloqueo` | admin | `{ motivo }` → paciente con `bloqueado: true`. `409 paciente_bloqueado` si ya lo estaba. |
| DELETE | `/api/patients/:id/bloqueo` | admin | Desbloquea → paciente. `409 paciente_no_bloqueado`. |

Paciente bloqueado: para roles no admin desaparece de listas y `GET` (`404`), igual que sus registros; con `desde` llega como `eliminado: true`. **Toda** escritura que lo involucre (incluido admin) → `409 paciente_bloqueado`. No recibe recordatorios. El expediente nunca se purga por API (NOM-004: ≥ 5 años); `DELETE /api/patients/:id` sigue siendo lógico.

### Llaves de firma

`GET /api/admin/llaves` (admin) → `[{ kid, activa, creadaEn, llavePublica }]`. `POST /api/admin/llaves/rotar` (admin) → `201 { kid, activa: true, creadaEn, llavePublica }`: las recetas nuevas se firman con la nueva llave; las anteriores siguen en `/api/public/jwks` y verificando. `settings.llavePublica` pasa a ser la nueva.

### Operación

- `GET /api/health` → `{ app, version, db, storage: { tipo: 'disk'|'s3', estado: 'ok'|'error' }, scheduler: { activo, ultimaEjecucion?, ultimosEnviados?, error? }, servicios: { whatsapp, correo, pac } }` (booleanos, sin secretos).
- `GET /api/metrics` (admin con sesión o `Authorization: Bearer <METRICS_TOKEN>`) → texto Prometheus (`text/plain; version=0.0.4`). `401` sin credenciales o token inválido, `403` sesión no admin.

### Decisiones de implementación (v1.1)

1. Preferencia inexistente → `200` con `valor: null` (no `404`).
2. `/api/auth/recuperar` responde `503 correo_no_configurado` cuando el servidor no puede enviar correos (decisión de configuración, no revela usuarios); en cualquier otro caso `204`.
3. Recordatorios: idempotencia por (cita, tipo, horas, **inicio de la cita**): una cita reprogramada se vuelve a recordar. Sin reintento automático de fallidos.
4. `GET /api/mensajes` lo usan también médico y recepción (no solo admin); el mensaje de prueba es solo admin.
5. Sin WhatsApp pero con SMTP, el envío inmediato usa correo; `503 whatsapp_no_configurado` solo si no hay ningún canal.
6. Facturas: IVA exento siempre (servicios médicos); `status` conserva los valores del PAC (`valid`, `canceled`) más `pendiente`/`error` locales.
7. Bitácora nueva: `recurso` `preferencias`, `mensajes`, `facturas`, `org_keys`, `files` (purga); bloqueo/desbloqueo como `actualizar` con `detalle.operacion`.

## v1.2 registros

Colección genérica para las herramientas que no encajan en Patient/Appointment/Encounter/Observation/Prescription/DocumentFile/Payment (control prenatal, vacunas, inventario, órdenes, certificados, tareas, encuestas…). Mismo contrato que las demás colecciones (`GET|POST /api/registros`, `GET|PATCH|DELETE /api/registros/:id`, `?patientId=`, `?desde=`, `?limit=&cursor=`, `PATCH` con `null` quita la clave, borrado lógico) más `?tipo=`.

```ts
interface Registro {
  id: string
  patientId?: string        // opcional: inventario, tareas, etc. pueden no tener paciente
  fecha: string             // ISO; por defecto la del servidor al crear
  tipo: string              // /^[a-z0-9-]{2,40}$/ y en la lista blanca; inmutable
  estado?: string           // ≤ 40 (cada herramienta define sus valores)
  titulo?: string           // ≤ 200; texto corto para listas y línea de tiempo
  datos: Record<string, unknown>   // obligatorio, ≤ 256 KB serializado
  creadoPor?: string; actualizadoEn: string   // del servidor
}
```

### Permisos por tipo

La colección no abre un hueco: cada operación se valida contra esta matriz (`api/src/permissions.ts` → `REGISTROS_PERMISOS`; el frontend la refleja en `src/lib/registros.ts`). Un tipo fuera de la lista → `400 tipo_no_permitido` (al crear y en `?tipo=`).

| tipo | lectura | escritura |
|---|---|---|
| `prenatal`, `vacuna`, `desarrollo`, `agudeza-visual`, `audiometria`, `tamizaje`, `triaje`, `enfermeria`, `nutricion`, `orden` | admin, médico, enfermería | médico, enfermería |
| `certificado`, `referencia` | admin, médico, enfermería | médico |
| `inventario`, `movimiento-inventario` | todos | admin, médico, enfermería |
| `tarea` | todos | todos |
| `encuesta` | admin, médico, recepción | admin, médico, recepción |

- **Listas y sincronización** (`GET /api/registros`, con o sin `desde`): solo devuelven los tipos que el rol puede leer (los demás no aparecen, ni como `eliminado`). `?tipo=` de un tipo no legible → `403`.
- `GET /api/registros/:id` de un tipo no legible → `403`; `POST`/`PATCH`/`DELETE` de un tipo no escribible → `403`.
- Admin solo lee los registros clínicos (no los crea ni modifica).
- **Tareas**: las ven todos los roles aunque tengan `patientId`, por lo que **no deben contener detalle clínico** (solo la acción: «Llamar para resultados», «Agendar control»).
- `patientId` presente: el paciente debe existir en la organización (`400 paciente_no_encontrado`) y respeta el bloqueo ARCO como las demás colecciones (oculto/`404` para no-admin, toda escritura `409 paciente_bloqueado`, en `desde` llega como `eliminado: true`). Se puede asignar o quitar (`null`) el paciente con `PATCH`.

### Reglas de negocio

| Regla | Error |
|---|---|
| `tipo` no se puede cambiar con `PATCH` (enviar el mismo valor se acepta) | `400 tipo_inmutable` |
| `certificado`/`referencia` con `estado: 'emitido'` (o ya `'cancelado'`): no admiten `PATCH` ni `DELETE`. Única excepción: un **médico** envía exactamente `PATCH { estado: 'cancelado', datos: { motivoCancelacion } }`; el servidor conserva el resto de `datos` y agrega `canceladoEn`, `canceladoPor`. Sin motivo → `400 validacion`. | `409 documento_emitido` |
| `movimiento-inventario` solo se agrega (sin `PATCH`/`DELETE`): la existencia se calcula sumando movimientos; un error se corrige con un movimiento de ajuste. | `409 movimiento_inmutable` |

`PATCH` hace mezcla superficial: `datos` se reemplaza completo (envía el objeto entero).

### Bitácora, respaldo y ARCO

- Bitácora con `recurso: 'registros'` y `detalle.tipo` (en `crear`, `actualizar`, `borrar`; `detalle.estado` si cambia). Listar con `?patientId=` registra `ver_expediente` (con `detalle.tipo` si se filtró).
- `GET /api/export` incluye `registros` (también los que no tienen paciente). `GET /api/patients/:id/expediente` incluye `registros` del paciente (todos los tipos: lo piden médico o admin).
- `GET /api/health` → `version: '1.2.0'`. Un servidor v1.1 responde `404` a `/api/registros`: el frontend lo trata como colección vacía.
- Migración `003_registros.sql`: tabla `registros` (misma estructura que las demás; `patient_id` nulo permitido) con índices `(org_id, patient_id)`, `(org_id, (data->>'tipo'))`, `(org_id, created_at, id)` y `(org_id, updated_at)`.

## v1.2.1 asignables, eventos de bitácora y seed demo generado

### `GET /api/users/asignables`

Cualquier rol autenticado. Devuelve `[{ id, nombre, rol }]` de los usuarios **activos** de su organización, ordenados por nombre (sin correo, perfil ni otros campos). Lo usa el selector de responsable de Tareas; `GET /api/users` completo sigue siendo solo de admin.

### `POST /api/auditoria/evento`

Registra en la bitácora una exportación hecha en el navegador (FHIR en Interoperabilidad; CSV de Caja, Inventario y Encuestas), que de otro modo no pasaría por el servidor.

```ts
{ accion: 'exportar', recurso: 'fhir' | 'caja' | 'inventario' | 'encuestas', patientId?: string, detalle?: { formato: string /* ^[a-z0-9+.-]{1,30}$, p. ej. 'fhir+json', 'fhir+ndjson', 'csv' */, recursos: number } }
```

- Autenticado (cualquier rol), con CSRF como toda escritura; `204` sin cuerpo. Límite: 60 por minuto por IP (`429 limite`).
- Lista blanca estricta: otra `accion`/`recurso`, campos adicionales o `formato` inválido → `400 validacion`. `patientId` de otro paciente/organización → `404`.
- Fila de bitácora: `accion: 'exportar'`, `recurso`, `patientId`, `detalle: { origen: 'navegador', formato, recursos }`, usuario e IP de la sesión.
- El frontend lo llama sin bloquear la descarga (fire-and-forget) y muestra un aviso si no se pudo registrar.

### Datos demo (`SEED_DEMO=true`)

`api/src/demo/seed.gen.ts` se **genera** desde `src/lib/seed.ts` y los `demo.ts` de los módulos (`npm run gen:seed`, con esbuild; corre antes de `dev`, `build` y `test`). Se versiona para que la imagen Docker no necesite el frontend (sin frontend el generador no hace nada). `npm run check:seed` falla si el archivo versionado no coincide (para CI). Incluye los registros de todos los módulos (con `patient_id` nulo en los de la clínica), las observaciones de enfermería y visión y las recetas `rx1`/`rx2` firmadas.
