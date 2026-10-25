# Base para los módulos extra

## Por qué

Cortex va a incorporar módulos tomados de la propuesta MediSuite (recepción desde
equipos con Orthanc, dictado, asistente de IA, laboratorios con OCR, Neuro 3D,
inventario de implantes, tareas…). No todos los consultorios los usan, y varios
dependen de un servicio externo que puede no estar instalado. Hoy Cortex solo
tiene permisos por usuario: no hay forma de encender una función para un
consultorio y dejarla apagada para otro, ni de saber desde la pantalla si un
servicio auxiliar responde.

## Qué cambia

- **Módulos opcionales por consultorio.**
  - Catálogo `MODULOS_OPCIONALES` en `backend/app/core/modulos.py` (id, nombre,
    descripción, servicio requerido, activo por defecto y `disponible`).
  - Tabla `tenant_modulos` (migración 0051, solo agrega).
  - Dependencia `require_modulo(id)`: con el módulo apagado, sus rutas responden
    404, así la información no se filtra por otro camino.
  - `GET /api/v1/modulos` y `PUT /api/v1/modulos/{id}` (permiso
    `modulos.manage`, solo admin y master). Cada cambio va a la bitácora.
  - **Apagar no borra datos**: solo oculta. Al volver a encender, todo sigue ahí.
- **Frontend.** `AuthContext` carga los módulos activos; `NavItem` y las rutas
  aceptan `modulo?` y se ocultan si el módulo está apagado.
- **Pantallas del grupo «Sistema».**
  - «Servicios»: estado de Orthanc, Whisper, Presidio, el segmentador y la IA.
  - «Configuración → Módulos»: un interruptor por módulo.
    - Solo muestra los módulos con `disponible=True`, es decir, los ya
      construidos. No se deja un hueco que prometa algo que no existe.
    - Hoy ninguno lo está, así que la pantalla muestra «Aún no hay módulos
      opcionales instalados».
- **Configuración.** Variables opcionales para Orthanc, Whisper, Presidio, IA y el
  segmentador. En producción, `IA_API_KEY` es obligatoria si el proveedor no es
  «ninguno» ni «ollama».
- **Docker.** Perfil `imagen` (Orthanc con autenticación, AET `CORTEX`, DICOMweb) y
  perfil `ia` (speaches/Whisper en CPU y Presidio). `docker compose up -d postgres`
  no cambia.
- **OpenSpec.** Se crea `openspec/` con este primer cambio.

## Evaluación resumida de los módulos

| Módulo | Para neuro | Decisión |
|---|---|---|
| Escalas neurológicas | Lenguaje diario de la neurocirugía | Núcleo, siempre activo (rama `feat/escalas-neuro`) |
| Fotos clínicas | Herida quirúrgica, fístula de LCR | Núcleo, en la pestaña Imágenes |
| Recepción desde equipos (Orthanc) | Estudios que llegan solos del gabinete | Requiere servicio: `pacs_orthanc` |
| Dictado (Whisper) | Nota SOAP y operatoria sin teclear | Requiere servicio: `dictado` |
| Asistente IA | Resumen preconsulta, borradores sin firmar | Requiere servicio: `asistente_ia` |
| Laboratorios OCR | Na, coagulación, antiepilépticos, LCR | Sin servicio (Tesseract en el navegador): `laboratorios_ocr` |
| Neuro 3D del paciente | Modelo desde sus estudios | Requiere servicio: `neuro3d_paciente` |
| Inventario de implantes | Lote y serie por procedimiento | Opcional: `inventario` |
| Tareas | Seguimiento posoperatorio y resultados | Opcional: `tareas` |
| Satisfacción (NPS) | Encuesta al salir | Opcional: `encuestas` |
| Interoperabilidad FHIR | Referir a un hospital | Opcional: `interoperabilidad` |
| Patología, ECG/EEG | Neuropatología, EEG en EDF | Opcionales: `patologia`, `ecg` |
| Goniómetro | Rango de movimiento de columna | Opcional: `goniometro` |
| Telemedicina, WhatsApp | Foráneos, recordatorios | Opcionales: `telemedicina`, `whatsapp` |
| Prenatal, vacunación, odontograma, visión… | Ajenos a la especialidad | No se portan |

**Prioridad de construcción:** primero `tareas`; luego los que requieren servicio
(`pacs_orthanc`, `dictado`, `asistente_ia`) y `laboratorios_ocr`; el resto después.
Un módulo pasa a `disponible=True` en la misma rama que lo construye.

## Impacto

- **Datos:** una tabla nueva (`tenant_modulos`). No toca tablas existentes.
- **Permisos:** `modulos.manage` y `servicios.read`, ambos de admin y master.
- **Riesgo clínico:** un módulo apagado oculta información, no la borra. Si al
  cambiar el interruptor falla el guardado, la pantalla lo dice y deja el estado
  que confirma el servidor.
- **Fuera de alcance:** construir cualquiera de los módulos del catálogo.
