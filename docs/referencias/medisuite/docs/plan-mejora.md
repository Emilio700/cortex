# Plan de mejora para producción

Estado actual (octubre 2026): 31 módulos funcionando en modo demo y modo servidor, backend con 97 pruebas de integración, frontend con 236 pruebas unitarias, e2e de los flujos principales, revisión de seguridad interna y despliegue con Docker + Caddy. Este plan cubre lo que falta para que **cada herramienta** se use con pacientes reales, ordenado por riesgo.

## Cómo leer este plan

| Prioridad | Significado |
|---|---|
| **P0** | Bloquea el primer paciente real. No se sale a producción sin esto. |
| **P1** | Necesario en los primeros 3 meses de operación o para vender a más de una clínica. |
| **P2** | Mejora competitiva o de escala. |

Cada tarea tiene un **criterio de salida** verificable. Las estimaciones son para 1 desarrollador full-stack con apoyo de un médico revisor.

## Definición de "listo para producción" (aplica a todas las herramientas)

Una herramienta solo se habilita en producción cuando cumple las 10:

1. Pruebas unitarias de su lógica (fórmulas, parsers, señales) y al menos un e2e de su flujo principal **dentro del repo y corriendo en CI**.
2. Permisos por rol verificados en el servidor (no solo ocultos en la interfaz).
3. Toda escritura y toda lectura de datos clínicos quedan en la bitácora.
4. Funciona en modo servidor sin guardar datos clínicos en el navegador.
5. Sin violaciones de CSP ni errores de consola en Chrome, Edge, Safari iOS y Firefox (o aviso claro si la API no existe).
6. Accesibilidad WCAG 2.1 AA sin problemas serios en axe.
7. Licencias de código, modelos y datos revisadas y anotadas en `docs/investigacion-repos.md`.
8. Revisión clínica firmada por un médico (contenido, fórmulas, textos al paciente).
9. Clasificación regulatoria decidida: apoyo administrativo, educativo/bienestar o posible dispositivo médico (COFEPRIS).
10. Manual de uso de una página y texto de ayuda dentro de la herramienta.

---

## Fase 0 · Puesta en marcha segura (semanas 1–3) · P0

| # | Tarea | Criterio de salida |
|---|---|---|
| 0.1 | **Subir el código a GitHub** y activar CI, Dependabot y protección de la rama `main`. | CI verde en un PR; nadie puede hacer push directo a `main`. |
| 0.2 | **Mover las pruebas e2e al repo.** Hoy viven en `/tmp` (servidor real + mocks de WhatsApp, Facturapi y SMTP). Pasarlas a `e2e/` con Playwright Test y correrlas en CI contra Postgres. | 60+ pruebas e2e corriendo en cada PR. |
| 0.3 | **Construir y probar las imágenes Docker** (no se pudieron construir en el entorno de desarrollo). | `docker compose up` en un VPS de staging; healthchecks verdes; restauración de respaldo probada. |
| 0.4 | **Ambiente de staging** idéntico a producción, con dominio propio y datos sintéticos (`SEED_DEMO=true`). | URL de staging accesible; despliegue automático desde `main`. |
| 0.5 | **Credenciales reales de integraciones** en staging: plantilla de WhatsApp aprobada por Meta, cuenta de Facturapi en modo prueba, SMTP transaccional. | Recordatorio real recibido en un celular; CFDI de prueba timbrado con IVA exento; correo de recuperación recibido. |
| 0.6 | **Rotación de `MASTER_KEY`** (hallazgo S-22): script que re-cifra las llaves privadas con una llave nueva. | Prueba de integración: rotar y seguir verificando recetas antiguas. |
| 0.7 | **Limpieza programada**: purgar sesiones y tokens de recuperación vencidos; guardar IDs de mensajes del webhook de WhatsApp para evitar repeticiones (hallazgos aceptados). | Tablas no crecen sin límite; webhook repetido no cambia la cita dos veces. |
| 0.8 | **Escaneo de seguridad en CI**: `npm audit`, Trivy sobre imágenes, OWASP ZAP sobre staging. | Reporte en cada PR; cero vulnerabilidades críticas abiertas. |
| 0.9 | **Pentest externo** antes del primer paciente. | Informe del proveedor con hallazgos altos y críticos corregidos. |
| 0.10 | **Paquete legal**: aviso de privacidad final, contratos de encargado con hosting, proveedor de IA, Meta y PAC; procedimiento ARCO; revisión de `docs/operacion/cumplimiento.md` por abogado. | Documentos firmados; los "(verificar)" resueltos. |
| 0.11 | **Decisión regulatoria por módulo** (ver tabla de la sección final) y **banderas de funciones por clínica** para apagar los módulos no autorizados. | Un admin puede ocultar módulos; los marcados como "no habilitar" vienen apagados por defecto. |

---

## Fase 1 · Núcleo clínico y administrativo (semanas 3–8) · P0/P1

Estas herramientas se usan todos los días; son las primeras que verá un médico.

### Pacientes y expediente

| Pri | Mejora | Criterio de salida |
|---|---|---|
| P0 | Paginación y búsqueda en servidor (hoy se cargan todos los pacientes a memoria). | Lista fluida con 20,000 pacientes de prueba. |
| P1 | Detección de duplicados (CURP, nombre + fecha de nacimiento) y fusión de expedientes con bitácora. | Fusión probada sin perder notas ni documentos. |
| P1 | Importación desde Excel/CSV y desde otros sistemas (plantilla de columnas). | Importar 1,000 pacientes con reporte de errores fila por fila. |
| P1 | Escaneo antivirus de archivos subidos (ClamAV como servicio). | Archivo EICAR rechazado. |

### Consulta (nota clínica)

| Pri | Mejora | Criterio de salida |
|---|---|---|
| P0 | Resolver la carrera entre autoguardado y firma (el autoguardado puede chocar con una nota recién firmada). | Prueba e2e de firmar mientras se escribe sin errores 409. |
| P1 | Plantillas editables por especialidad desde la interfaz (guardadas en preferencias de la organización). | Un médico crea su plantilla sin programar. |
| P1 | Mejorar el orden del buscador CIE-10 (E11.9 antes que E11.2 para "diabetes tipo 2") y agregar CIE-11 con la herramienta de la OMS. | Pruebas de ranking con 30 búsquedas comunes. |
| P2 | Firma de la nota con e.firma (FIEL) o constancia NOM-151. | Nota con sello verificable por un tercero. |

### Agenda y recordatorios

| Pri | Mejora | Criterio de salida |
|---|---|---|
| P1 | Vista por consultorio/doctor (varios médicos), horarios de trabajo, bloqueos y citas recurrentes. | Clínica de 3 médicos agenda una semana sin choques. |
| P1 | Página pública de reservas en línea con tipos de cita y confirmación por WhatsApp. | Paciente reserva sin llamar; aparece en la agenda. |
| P1 | Reintento automático de recordatorios fallidos y reporte de entregabilidad. | Tablero con % entregado/leído/confirmado. |

### Receta

| Pri | Mejora | Criterio de salida |
|---|---|---|
| P0 | Revisión médica del catálogo local de 170 medicamentos y de las familias de alergias. | Catálogo firmado por el médico revisor. |
| P1 | Integrar una base comercial de interacciones y dosis (DrugBank, Medi-Span u otra con licencia). No usar IA para esto. | Alerta de interacción en 20 pares conocidos. |
| P2 | Envío de receta a farmacias aliadas y recetas de controlados (grupos II–III) con reglas propias. | Definido con asesoría regulatoria. |

### Caja y facturación

| Pri | Mejora | Criterio de salida |
|---|---|---|
| P0 | Validar en staging el timbrado real con IVA exento, cancelación y complemento de pago. | 10 facturas de prueba correctas en el portal del PAC. |
| P1 | Cobro en línea (Mercado Pago o Stripe) con ligas de pago y conciliación automática. | Pago con tarjeta marca la cuenta como pagada. |
| P1 | Corte de caja por usuario y por sucursal; cuentas por cobrar. | Corte cuadra con los pagos del día. |

### Consentimientos, documentos y reportes

| Pri | Mejora | Criterio de salida |
|---|---|---|
| P1 | Constancias NOM-151 para consentimientos firmados (proveedor acreditado). | PDF con constancia verificable. |
| P1 | Reportes epidemiológicos (casos de notificación obligatoria) y exportación a Excel. | Reporte semanal generado con datos de prueba. |

---

## Fase 2 · Herramientas clínicas de apoyo (semanas 6–12) · P1

| Herramienta | Mejoras | Criterio de salida |
|---|---|---|
| **Calculadoras** | Revisión clínica de las 26 fórmulas; versión de cada fórmula guardada con el resultado; casos de prueba contra MDCalc o publicaciones. | Cada calculadora con ≥3 casos validados y firma del revisor. |
| **Escalas** | Validar traducciones; confirmar licencias (MoCA requiere certificación; Beck y Wong-Baker tienen dueño); alertas de riesgo enviadas al médico tratante. | Solo escalas con licencia clara habilitadas. |
| **Crecimiento** | Edad corregida para prematuros; confirmar licencia de las tablas 5–19 años (vienen del paquete R anthroplus); exportar gráfica a PDF. | Prematuro de 32 semanas graficado con edad corregida. |
| **Odontograma** | Periodontograma; historial comparativo; plan de tratamiento ligado a caja. | Presupuesto aceptado genera cargos en caja. |
| **Anatomía 3D** | Sustituir el maniquí estilizado por modelos anatómicos con licencia (BodyParts3D / Z-Anatomy, CC BY-SA, con atribución). | Modelo de cuerpo completo cargando en menos de 3 s en celular. |
| **Signos vitales** | Lista de aparatos certificados (marca y modelo probados); guardar todos los registros del glucómetro; app Capacitor para Bluetooth en iPhone. | 5 aparatos comerciales probados y documentados. |

---

## Fase 3 · Cámara, imagen y señales (semanas 10–20) · P1/P2

| Herramienta | Mejoras | Criterio de salida |
|---|---|---|
| **Visor DICOM** | Decodificar JPEG 2000, JPEG-LS y JPEG lossless (códecs WASM de Cornerstone/OpenJPEG); guardar mediciones; anonimizar secuencias y tags privados; flujo completo con Orthanc y OHIF integrado. | CD real de 3 proveedores distintos abierto sin errores. |
| **Visor 3D** | Conversión DICOM→NIfTI en servidor con dcm2niix. | Tomografía de 300 cortes en 3D en menos de 20 s. |
| **Patología** | Servicio de teselado (libvips) y soporte de laminillas .svs (OpenSlide). | Laminilla de 2 GB navegable. |
| **ECG** | Importar DICOM waveform y XML de Philips (dcmjs-ecg y sierra-ecg-tools, MIT); reportes en PDF. | ECG real de 2 marcas importado. |
| **Fotos clínicas** | Consentimiento por foto (expediente vs publicidad); almacenamiento en S3 con miniaturas. | Foto sin consentimiento de publicidad no se puede exportar. |
| **Telemedicina** | Jitsi propio o LiveKit (sin moderador público); sala por cita con liga firmada y caducidad; consentimiento de videoconsulta. | Consulta de 30 min estable con 2 participantes y pizarra. |
| **Goniómetro** | Estudio de validación contra goniómetro manual (n ≥ 30); considerar OpenCap para 3D. | Error medio documentado; texto de limitaciones. |
| **Pulso por cámara** | Estudio de validación contra oxímetro; mantener como "estimación de bienestar". | Error medio documentado; no se usa para decisiones clínicas. |
| **Cardio 3D** | Mantener como herramienta educativa. Modelo específico del paciente desde angiotomografía solo con licencia comercial de TotalSegmentator. | Decisión de producto documentada. |

---

## Fase 4 · Inteligencia artificial (semanas 12–24) · P1/P2

| Herramienta | Mejoras | Criterio de salida |
|---|---|---|
| **Dictado** | Desplegar Whisper en servidor (speaches) con GPU opcional; separar hablantes (WhisperX); vocabulario médico en español; servir los archivos de ONNX desde el propio dominio. | Error de palabras < 10 % en 20 audios de consulta reales anonimizados. |
| **Asistente IA** | Contrato de tratamiento de datos con el proveedor del modelo; Presidio en español afinado para nombres de terceros; suite de evaluación (50 casos) para resumen y SOAP; registrar en bitácora cada uso de IA; límites por usuario. | Evaluación ≥ 90 % aceptable según el médico revisor; cero datos personales en los envíos de prueba. |
| **OCR de laboratorios** | PDFs con Docling en servidor; plantillas por laboratorio (Chopo, Salud Digna, Olab); revisión obligatoria antes de guardar. | 95 % de valores correctos en 50 reportes reales anonimizados. |

---

## Fase 5 · Producto y escala (meses 4–9) · P2

| Mejora | Criterio de salida |
|---|---|
| Portal del paciente: citas, recetas, resultados, pagos y facturas. | Paciente descarga su receta y su factura sin llamar. |
| App móvil con Capacitor (Bluetooth en iPhone, notificaciones). | Publicada en App Store y Google Play. |
| Multi-sucursal y planes de precio con banderas de funciones. | Una organización con 2 sucursales y permisos por sucursal. |
| Asistente de alta de clínica (onboarding) con datos de ejemplo. | Clínica nueva operando en menos de 30 minutos. |
| Límites de velocidad y sesiones compartidos en Valkey para varias instancias de la API. | 2 réplicas de la API detrás del balanceador sin errores. |
| Bitácora replicada a almacenamiento inmutable (S3 Object Lock) para que ni el dueño de la base la pueda alterar. | Prueba: borrar la tabla no borra la copia. |
| Observabilidad: logs centralizados, métricas en Grafana, alertas de error y de respaldo fallido. | Alerta recibida al detener la base de datos en staging. |
| Ruta de certificación NOM-024 (catálogos DGIS, intercambio HL7/FHIR). | Plan con brecha cerrada y fecha de auditoría. |

---

## Clasificación regulatoria propuesta por módulo

Validar con un asesor regulatorio; es la base para las banderas de la tarea 0.11.

| Categoría | Módulos | Habilitar en producción |
|---|---|---|
| Administrativo / expediente | Pacientes, agenda, consulta, receta, consentimientos, caja, reportes, documentos, mensajes, usuarios, bitácora | Sí, tras la fase 0 |
| Cálculo con fórmula publicada | Calculadoras, escalas, crecimiento, odontograma | Sí, tras revisión clínica |
| Visualización sin interpretación | Visor DICOM, visor 3D, patología, ECG (trazo y frecuencia), fotos, telemedicina | Sí, como "herramienta visual" |
| Bienestar / educativo | Pulso por cámara, goniómetro, anatomía 3D, Cardio 3D | Sí, con aviso visible de que no es diagnóstico |
| Posible dispositivo médico (SaMD) | Asistente IA con sugerencias clínicas, alertas de ritmo en ECG, segmentación o IA de imagen futura | **No** hasta tener dictamen de COFEPRIS |

---

## Calendario resumido

| Semanas | Entregable |
|---|---|
| 1–3 | Fase 0 completa: staging, e2e en CI, integraciones reales, pentest contratado. |
| 3–8 | Fase 1: núcleo listo para 1 clínica piloto. **Primer paciente real al cierre.** |
| 6–12 | Fase 2: herramientas clínicas revisadas y habilitadas. |
| 10–20 | Fase 3: imagen y señales con estudios reales. |
| 12–24 | Fase 4: IA con evaluación y contratos. |
| Meses 4–9 | Fase 5: portal, app, multi-sucursal, NOM-024. |

## Métricas de seguimiento

- Minutos por nota clínica (meta: −40 % con dictado y plantillas).
- Tasa de inasistencia (meta: −30 % con recordatorios).
- Facturas timbradas sin error (meta: > 99 %).
- Errores 5xx por cada 1,000 peticiones (meta: < 1).
- Tiempo de restauración de respaldo probado (meta: < 1 h).
- Hallazgos de seguridad críticos abiertos (meta: 0).
