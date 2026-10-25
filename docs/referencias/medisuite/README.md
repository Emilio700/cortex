# MediSuite

> **¿Vas a implementarlo o extenderlo con Claude Code?** Lee [`CLAUDE.md`](CLAUDE.md) (reglas del proyecto) y [`docs/IMPLEMENTAR.md`](docs/IMPLEMENTAR.md) (despliegue paso a paso).

Sistema médico web para cualquier especialidad: expediente, agenda, consulta con dictado, receta con QR verificable, consentimientos con firma, caja con CFDI 4.0, calculadoras y escalas, curvas OMS, odontograma, aparatos Bluetooth, cámara (pulso, goniómetro, fotos clínicas), telemedicina, visores DICOM/3D/patología, ECG, Cardio 3D, OCR de laboratorios y asistente de IA.

Todo corre **en el navegador** (React + WebAssembly + WebGL). Los datos se guardan en el navegador (IndexedDB) para la demo; los servicios pesados (PACS, Whisper, Presidio) son opcionales y viven en [`servidor/`](servidor/README.md).

> Herramienta de apoyo. No sustituye el juicio clínico. Los datos de ejemplo son sintéticos.

## Correr en tu computadora

Requisitos: Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Producción:

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

## Publicarlo en internet

`dist/` es un sitio estático (rutas con `#`, no necesita reglas de servidor). Cualquiera de estas opciones funciona:

- **Vercel:** importa el repo → Framework "Vite" → listo.
- **Netlify:** arrastra la carpeta `dist/` a app.netlify.com/drop, o conecta el repo (build `npm run build`, publish `dist`).
- **Cloudflare Pages / GitHub Pages:** build `npm run build`, salida `dist`.

Necesita **HTTPS** (lo dan todas las anteriores) para cámara, micrófono y Bluetooth.

## Compatibilidad

| Función | Chrome / Edge PC | Chrome Android | Safari iPhone | Firefox |
|---|---|---|---|---|
| Todo el sistema, PDF, visores, IA local | ✅ | ✅ | ✅ | ✅ |
| Cámara (pulso, goniómetro, fotos) | ✅ | ✅ | ✅ | ✅ |
| Aparatos Bluetooth | ✅ | ✅ | ❌ (requiere app con Capacitor) | ❌ |
| Dictado del navegador | ✅ | ✅ | parcial | ❌ |

## Módulos

| Grupo | Módulo | Qué hace |
|---|---|---|
| Consultorio | Inicio | Citas del día, ingresos, pendientes, accesos rápidos |
| | Pacientes | Expediente: resumen, línea de tiempo, gráficas de signos y labs, documentos |
| | Agenda | Calendario (FullCalendar), sala de espera, recordatorio por WhatsApp |
| | Consulta | Nota SOAP con 7 plantillas, CIE-10 (272 códigos + sinónimos), dictado, firma y adendas (NOM-004) |
| Documentos y caja | Receta | Catálogo de medicamentos, alertas de alergia, dosis pediátrica, PDF con QR firmado (ES256) |
| | Consentimientos | 5 plantillas, firma en tablet, PDF con hash SHA-256 |
| | Caja y facturación | Cobros, corte de caja, CFDI 4.0 (XML para timbrar con tu PAC) |
| | Reportes | Ingresos, consultas, inasistencias, diagnósticos frecuentes |
| Herramientas clínicas | Calculadoras | 26 calculadoras con fórmula y referencia |
| | Escalas | PHQ-9, GAD-7, Glasgow, Apgar, Barthel, AUDIT-C, FINDRISC, Morse, Braden, Silverman |
| | Crecimiento | Curvas y percentiles OMS 0–19 años |
| | Odontograma | FDI, 5 caras, índice CPO-D, presupuesto |
| | Anatomía 3D | Cuerpo clicable para marcar dolor, visor 3D con realidad aumentada |
| Cámara y aparatos | Signos vitales | Baumanómetro, oxímetro, glucómetro, báscula, termómetro y banda de FC por Bluetooth (+ simulador) |
| | Pulso por cámara | rPPG (POS) con MediaPipe |
| | Goniómetro | Rango de movimiento con MediaPipe Pose y rangos normales AAOS |
| | Fotos clínicas | Captura sin GPS, antes/después, toma guiada, medición en mm |
| | Telemedicina | Jitsi + pizarra Excalidraw |
| Imagen y señales | Visor DICOM | W/L, mediciones, ROI en HU, cine, anonimización, estudio de demo |
| | Visor 3D | NiiVue: NIfTI, mallas, MPR y render 3D |
| | Patología | OpenSeadragon con anotaciones y escala |
| | Cardio 3D | Corazón con árbol coronario, C-arm virtual y angiografía simulada, estenosis, territorios y ECG |
| | ECG | Generador, carga CSV, papel milimétrico, Pan-Tompkins, HRV |
| IA | Laboratorios (OCR) | Foto del laboratorio → valores → gráfica (tesseract.js, sin internet) |
| | Dictado | Web Speech, Whisper en el navegador o Whisper en servidor |
| | Asistente IA | Resumen pre-consulta, nota SOAP, carta de referencia; anonimiza antes de enviar |
| Sistema | Servicios | Estado y conexión con Orthanc, OHIF, Whisper, Presidio |
| | Configuración | Perfil del médico, llaves de firma, respaldo/restauración |
| | Usuarios · Bitácora · Mensajes | Cuentas y roles, registro de accesos inalterable, recordatorios por WhatsApp/correo (modo servidor) |
| | Interoperabilidad | Exportar e importar expedientes FHIR R4 (LOINC, CIE-10) |
| Enfermería y urgencias | Triaje | Clasificación ESI, sala de espera por prioridad con tiempos meta |
| | Hoja de enfermería | Signos por hora, balance hídrico, administración de medicamentos (5 correctos), infusiones, SBAR |
| Especialidades | Control prenatal | Carnet NOM-007, datación ACOG, altura uterina, ganancia de peso IOM, peso fetal Hadlock |
| | Vacunación | Esquema Nacional, cartilla PDF, atrasados de la clínica |
| | Desarrollo infantil | Hitos CDC 2022 con edad corregida |
| | Agudeza visual | Optotipos calibrados, logMAR/Snellen, rejilla de Amsler |
| | Audiometría | Audiograma ASHA, grados OMS 2021, tamiz con tonos (no calibrado) |
| | Nutrición | Antropometría, Mifflin-St Jeor, plan por equivalentes SMAE |
| | Prevención | Tamizajes por edad y sexo (NOM, GPC, USPSTF) |
| Operación | Órdenes de estudios | Laboratorio y gabinete, PDF con QR, seguimiento de resultados |
| | Certificados | Salud, justificante, referencia/contrarreferencia (inmutables al emitirse) |
| | Inventario | Lotes, caducidades, FEFO, kárdex, costo promedio |
| | Tareas · Satisfacción | Kanban del equipo; encuestas en tablet y NPS |

## Estructura

```
src/
  lib/        types.ts (modelo tipo FHIR), store.ts (IndexedDB), seed.ts (datos demo), utils.ts
  components/ ui.tsx (componentes compartidos)
  modules/    un folder por módulo + registry.tsx (menú y rutas)
public/       modelos y wasm locales (MediaPipe, Tesseract, fuentes de Excalidraw)
servidor/     docker-compose opcional: Orthanc, OHIF, Whisper, Presidio, proxy CORS
docs/         investigación de repos y herramientas
```

Para agregar un módulo: crea `src/modules/<id>/index.tsx` y regístralo en `src/modules/registry.tsx`.

## Camino a producción

Esta versión guarda los datos en el navegador de cada equipo. Para uso real con varios usuarios:

1. Backend con FHIR (Medplum o HAPI) + PostgreSQL; `src/lib/store.ts` es el único punto a cambiar.
2. Autenticación y roles (Keycloak), bitácora de accesos, cifrado y respaldos.
3. Archivos a S3/Orthanc en lugar de base64.
4. Llave pública de recetas servida por el servidor; timbrado CFDI con PAC; WhatsApp Cloud API.
5. Revisión legal: NOM-004, NOM-024, LFPDPPP 2025, COFEPRIS (software como dispositivo médico).

## Licencias de terceros

Todo el código y las librerías usadas tienen licencias permisivas (MIT, Apache-2.0, BSD). Revisa `docs/investigacion-repos.md` antes de integrar modelos o datos adicionales: varios son no comerciales.

## Producción

Despliegue con servidor propio (HTTPS automático, API + PostgreSQL, respaldos cifrados) con Docker Compose en [`deploy/`](deploy/docker-compose.yml):

```bash
cd deploy && cp .env.example .env   # DOMINIO, MASTER_KEY (openssl rand -base64 32), contraseñas…
docker compose up -d --build        # caddy (TLS) + web + api + db + backup
```

Guías de operación (`docs/operacion/`):

- [Despliegue en un VPS](docs/operacion/despliegue.md) — DNS, Docker, `.env`, primer acceso, 2FA, actualizar y revertir versiones.
- [Respaldos y restauración](docs/operacion/respaldos.md) — qué se respalda, cifrado con age, copia S3, prueba mensual.
- [Seguridad](docs/operacion/seguridad.md) — lista de verificación, endurecimiento, CSP, rotación de secretos, respuesta a incidentes.
- [Cumplimiento](docs/operacion/cumplimiento.md) — NOM-004, NOM-024, LFPDPPP 2025, NOM-151, COFEPRIS, CFDI (requiere revisión legal).
- [Plantilla de aviso de privacidad](docs/operacion/aviso-privacidad-plantilla.md).

Pruebas: `npm test` (unitarias del frontend con Vitest) y `cd api && npm test`. CI en `.github/workflows/ci.yml`.

### Pruebas E2E (modo servidor)

`npm run e2e` levanta PostgreSQL embebido + la API real con `SEED_DEMO=true` + Vite con proxy y recorre en Chromium (Playwright) las 15 herramientas con los roles demo: cada acción principal se hace desde la interfaz y se verifica en la API y tras recargar; también los permisos de recepción y enfermería y la bitácora de exportaciones. Requiere `npm install` en la raíz y en `api/`, y Playwright con Chromium (`npx playwright install chromium` si no está). Detalles y opciones en [`e2e/README.md`](e2e/README.md).
