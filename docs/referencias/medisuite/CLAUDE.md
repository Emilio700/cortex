# CLAUDE.md — guía para trabajar en MediSuite

Instrucciones para Claude (Claude Code) al implementar, desplegar o extender este proyecto. Léelo completo antes de cambiar código. Para desplegar desde cero sigue `docs/IMPLEMENTAR.md` paso a paso.

## Qué es

Sistema médico web para consultorios en México (UI en español de México): expediente clínico, agenda, consulta, receta con QR firmado, caja con CFDI 4.0, 46 herramientas clínicas (triaje, enfermería, prenatal, vacunas, imagen DICOM, ECG, Cardio 3D, OCR, IA…). Datos de salud = **datos sensibles** (LFPDPPP 2025): la privacidad y la bitácora no son opcionales.

Dos modos con la misma interfaz:

| Modo | Cuándo | Datos |
|---|---|---|
| **demo** | no hay `/api/health` o `VITE_MODE=demo` | IndexedDB del navegador, pacientes sintéticos (`src/lib/seed.ts`) |
| **servidor** | `/api/health` responde `{app:'medisuite'}` o `VITE_MODE=server` | API Fastify + PostgreSQL (`api/`), login con roles, nada clínico se guarda en el navegador |

Producción **siempre** se construye con `VITE_MODE=server` (si no, una caída del API mostraría el modo demo).

## Mapa del repositorio

```
src/                      Frontend React 19 + Vite 8 + TypeScript + Tailwind v4 (HashRouter, base relativa)
  lib/types.ts            Modelo tipo FHIR: Patient, Appointment, Encounter, Observation, Prescription,
                          DocumentFile, Payment, Registro (genérico), Settings, User, Rol…
  lib/store.ts            Almacén único (demo: IndexedDB; servidor: API con escrituras optimistas)
  lib/api.ts              fetch con cookie, CSRF, timeout, detección de modo
  lib/session.ts          login, roles, permisos (useCan), expiración por inactividad
  lib/registros.ts        useRegistros / useCanRegistro (+ registros-permisos.ts = matriz por tipo)
  lib/preferencias.ts     usePreferencia(clave, scope) → /api/preferencias o localStorage en demo
  lib/seed.ts             datos demo (importa src/modules/*/demo.ts)
  components/ui.tsx       Page, Card, Button, Field, Input, Select, Modal, PatientBar, Notice, Disclaimer…
  components/dialogos.tsx confirmar() / pedirTexto()  ← usar SIEMPRE en vez de confirm()/prompt()
  components/toast.tsx    toast()
  modules/registry.tsx    ÚNICA fuente de rutas, menú, grupos y roles por módulo
  modules/<id>/           un módulo por carpeta, index.tsx con export default
api/                      Backend Node 22 + Fastify 5 + PostgreSQL (pg) + zod, vitest + embedded-postgres
  migrations/*.sql        migraciones (se aplican al iniciar)
  src/permissions.ts      matriz rol × colección y REGISTROS_PERMISOS (rol × tipo de registro)
  src/routes/*.ts         auth, collections, documents, facturas, mensajes, preferencias, users, admin…
  src/demo/seed.gen.ts    GENERADO desde src/lib/seed.ts (no editar a mano: `npm run gen:seed`)
deploy/                   Producción: docker-compose (Caddy HTTPS, web, api, db, backup), roles de BD
servidor/                 Servicios opcionales: Orthanc, OHIF, Whisper, Presidio (docker-compose)
e2e/                      Pruebas de punta a punta (node:test + Playwright global) — `npm run e2e`
docs/api.md               CONTRATO de la API (v1, v1.1, v1.2 registros, auditoría). Fuente de verdad.
docs/operacion/           despliegue, respaldos, seguridad, cumplimiento, revisión de seguridad, aviso de privacidad
docs/plan-mejora.md       plan por fases para producción (P0/P1/P2) y clasificación regulatoria
docs/investigacion-repos.md  repos y licencias evaluados
```

## Comandos

```bash
# Frontend (raíz)
npm install
npm run dev            # http://localhost:5173 (modo demo si no hay API)
npm test               # vitest (≈500 pruebas)
npx tsc -b             # typecheck
npm run build          # producción; usa VITE_MODE=server para despliegues reales
npm run build:demo     # build estático de demostración (sin API)
npm run e2e            # levanta Postgres embebido + API + Vite y corre e2e/tests/*

# Backend (api/)
cd api && npm install
cp .env.example .env   # llenar valores
npm run dev            # API en :3000 (regenera el seed antes)
npm test               # vitest + embedded-postgres (≈110 pruebas)
npm run typecheck && npm run build
npm run check:seed     # falla si api/src/demo/seed.gen.ts está desactualizado

# Producción
cd deploy && cp .env.example .env && docker compose up -d --build
```

Antes de dar por terminado cualquier cambio corre: `npx tsc -b && npm test && npm run build` y, si tocaste `api/` o el seed, `cd api && npm run typecheck && npm test && npm run check:seed`. Si tocaste flujos de usuario, `npm run e2e`.

## Reglas de arquitectura (no romper)

1. **Un solo almacén.** Los módulos solo usan `src/lib/store.ts`: `useCollection`, `add`, `addAsync` (cuando necesitas la respuesta del servidor, p. ej. folio/firma de receta), `update`, `remove`, `useActivePatient`, `useSettings`. Nunca llames `fetch` a colecciones directamente desde un módulo.
2. **Contrato primero.** Cualquier endpoint nuevo o cambio de forma se documenta en `docs/api.md` (agrega una sección; no reescribas decisiones anteriores), se implementa en `api/` con zod + prueba, y luego se consume en el frontend.
3. **Permisos en el servidor.** La UI solo oculta; el servidor decide. Si agregas un rol, colección o tipo de registro, actualiza `api/src/permissions.ts` **y** `src/lib/registros-permisos.ts` (una prueba verifica que coincidan) y el campo `roles` en `registry.tsx`.
4. **Registros genéricos.** Herramientas nuevas que no encajan en las colecciones FHIR usan `Registro` (`tipo`, `titulo`, `estado`, `datos`).
   - `tipo` es una lista blanca: agregarlo en `TipoRegistro`, en ambas matrices y en `REGISTRO_INFO` (ruta y etiqueta para la línea de tiempo).
   - Un PATCH **reemplaza `datos` completo**: envía siempre `{ ...r.datos, cambio }`.
   - `tipo` es inmutable. `certificado`/`referencia` emitidos solo se cancelan con exactamente `update('registros', id, { estado: 'cancelado', datos: { ...r.datos, motivoCancelacion } })`.
   - `movimiento-inventario` solo se agrega (nunca update/remove); el stock se calcula de los movimientos.
   - Órdenes abiertas: `estado: 'pendiente'`; tareas abiertas: `estado: 'abierta'` con `datos.asignadoA = userId`.
5. **Expediente (NOM-004).** Una nota firmada no se edita ni se borra: solo adendas (`addAdenda`). Los borrados son lógicos y se conservan ≥ 5 años. Nada de purgas desde la API.
6. **Bitácora.** Toda lectura de expediente y toda escritura queda en `audit_log` (insert-only, trigger que impide UPDATE/DELETE). Exportaciones hechas en el navegador se registran con `src/lib/auditoria.ts`.
7. **Preferencias vs datos.** `usePreferencia` es para configuración de la clínica o del usuario (catálogos, precios, plantillas). Las claves deben cumplir `^[a-z0-9._-]{1,64}$` (hay una prueba). Nunca guardes datos de pacientes en preferencias ni en `localStorage` en modo servidor.
8. **Seed único.** Los datos demo viven en `src/lib/seed.ts` + `src/modules/*/demo.ts`. El API usa `api/src/demo/seed.gen.ts`, generado por `api/scripts/gen-seed.mjs` (esbuild). Los `demo.ts` deben ser puros: no importar React, el store ni APIs del navegador.
9. **IA y privacidad.** Antes de enviar texto clínico a un LLM se anonimiza (`src/modules/asistente/anon.ts`, Presidio opcional) y se muestra al médico lo que se envía. Los resultados de IA siempre se marcan como borrador que el médico revisa.

## Convenciones de código

- TypeScript estricto, componentes funcionales, comentarios en español solo donde aportan.
- UI en español de México. Textos clínicos con **fuente visible** (NOM, GPC, publicación). Si un dato normativo no está confirmado, se muestra "(verificar)": **nunca inventes** dosis, esquemas, intervalos ni puntos de corte.
- Estilos solo con los tokens de Tailwind del proyecto (`bg-surface`, `bg-surface-2`, `text-ink`, `text-muted`, `border-line`, `bg-brand`, `text-brand`, `bg-brand-soft`, `text-brand-strong`, `text-danger|warn|ok`). Modo oscuro por la clase `.dark`: no uses grises o blancos fijos.
- Debe funcionar a 390 px sin scroll horizontal. Tablas anchas dentro de `<div className="relative overflow-x-auto">` (el `relative` evita que textos `sr-only` desborden la página).
- Accesibilidad WCAG 2.1 AA: labels en inputs, `aria-label` en botones de icono, `Modal` para diálogos (ya maneja foco y Escape).
- **Prohibido** `alert()`, `confirm()`, `prompt()`, `window.open` + `document.write`: usa `confirmar`/`pedirTexto` y `src/lib/imprimir.ts`.
- Sin CDNs en tiempo de ejecución: modelos y wasm están en `public/` (MediaPipe, Tesseract, fuentes de Excalidraw) y se resuelven con `asset('ruta')` de `src/lib/utils.ts`. La CSP de producción está en `deploy/web/security-headers.caddy`; si agregas un origen externo, actualízala y prueba.
- Lógica pura (fórmulas, parsers, reglas, señales) en archivos `.ts` separados con pruebas `*.test.ts` contra valores publicados.
- Resultados numéricos del paciente → `Observation` (con `fuente` y `etiqueta`) para que se grafiquen en el expediente; lo demás → `Registro` o `DocumentFile`.

## Cómo agregar una herramienta nueva

1. Carpeta `src/modules/<id>/index.tsx` (export default) usando `Page`, `PatientBar` si es por paciente y `Disclaimer` si interpreta datos.
2. Registrar en `src/modules/registry.tsx`: `id`, `path`, `label`, `icon` (lucide-react), `group`, `description`, `roles`.
3. Si guarda registros: tipo nuevo en `TipoRegistro`, `api/src/permissions.ts` (`REGISTROS_PERMISOS`), `src/lib/registros-permisos.ts`, `REGISTRO_INFO`; sección en `docs/api.md`.
4. Lógica pura + pruebas vitest. Datos demo opcionales en `demo.ts` e importarlos en `src/lib/seed.ts`; luego `cd api && npm run gen:seed`.
5. Prueba e2e en `e2e/tests/` (ver `e2e/README.md`) que haga la acción principal y verifique persistencia y permisos.
6. Verificar en navegador (Playwright) a 1366 y 390 px, claro y oscuro, sin errores de consola.

## Despliegue (resumen; detalle en `docs/IMPLEMENTAR.md` y `docs/operacion/despliegue.md`)

- VPS con Docker, dominio apuntando al servidor, `deploy/.env` con `DOMINIO`, contraseñas de Postgres y del rol `medisuite_app`, `MASTER_KEY` (`openssl rand -base64 32`), `ADMIN_EMAIL/ADMIN_PASSWORD`.
- `docker compose up -d --build` en `deploy/`: Caddy obtiene HTTPS solo; `db-init` crea el rol de mínimos privilegios; la API migra y crea el admin.
- Integraciones opcionales por variables: WhatsApp Cloud API (plantilla aprobada con 4 variables y 2 botones), Facturapi (PAC), SMTP, S3. Sin ellas, la app degrada con avisos claros (503 controlados).
- Respaldos diarios cifrados con `age` (servicio `backup`); probar restauración mensual (`docs/operacion/respaldos.md`).

## Trampas conocidas

- Vite 8 no tiene la opción `--cacheDir` en CLI: usa un config con `cacheDir` si corres varios servidores a la vez.
- El proxy de Vite hacia la API necesita `changeOrigin: false` o la API rechaza el origen (403).
- La API sirve archivos con `CSP: sandbox`; los documentos en modo servidor tienen `dataUrl = /api/files/<id>` (usa `fetchDocBlob`/`docToDataUrl` de utils, no `atob`).
- `jsPDF` con fuentes estándar no imprime `≥ ± ≤`: usa los helpers de `src/modules/prenatal/pdfbase.ts`.
- Dentro de un iframe con sandbox (p. ej. claude.ai) no hay cámara, Bluetooth, descargas ni impresión; la app debe degradar sin romperse.
- `@fullcalendar/react` v7 trae su propio core: importa plugins y `locales/es` desde `@fullcalendar/react/*`.

## Pendientes conocidos (no los "resuelvas" inventando datos)

- Contenido clínico marcado "(verificar)": esquema de vacunación, intervalos de tamizaje, tiempos meta de triaje, SMAE leche con azúcar, requisitos prenupciales, OID de CURP. Requieren revisión médica con la fuente oficial.
- Rotación de `MASTER_KEY`, limpieza de sesiones y tokens vencidos, protección contra repetición del webhook de WhatsApp, paginación en la UI de pacientes, base comercial de interacciones de medicamentos. Ver `docs/plan-mejora.md` (fase 0 y 1) y `docs/operacion/revision-seguridad.md`.
- Facturapi y WhatsApp solo se probaron contra simuladores: validar en staging con credenciales reales antes de producción.
- Antes de atender pacientes reales: pentest externo, revisión legal (LFPDPPP, NOM-004/024, COFEPRIS para módulos de IA e imagen).
