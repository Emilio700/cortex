# Cumplimiento normativo (México): qué cubre MediSuite y qué falta

> **Aviso importante.** Este documento es una guía técnica preparada por el equipo de desarrollo para orientar la conversación con asesores. **No es asesoría legal ni regulatoria.** Las normas citadas cambian (la LFPDPPP se reemplazó en 2025 y su reglamento podía no estar actualizado al escribir esto) y su aplicación depende de tu caso (consultorio individual, clínica, hospital, telemedicina, uso de IA). Antes de operar con pacientes reales, pide a un **abogado especialista en salud y protección de datos** y, si usarás los módulos de IA/imagen con fines diagnósticos, a un **asesor regulatorio COFEPRIS**, que validen este mapeo. Donde indicamos *(verificar)* no tenemos certeza.

Leyenda: ✅ cubierto · 🟡 parcial / depende de la operación · ❌ brecha (no cubierto)

## 1. NOM-004-SSA3-2012, Del expediente clínico

| Requisito (resumen) | Estado | Cómo lo cubre MediSuite / qué falta |
|---|---|---|
| Expediente por paciente con datos de identificación | ✅ | Módulo Pacientes (nombre, fecha de nacimiento, sexo, CURP opcional, contacto) |
| Notas médicas con fecha, hora, nombre completo y firma de quien la elabora (autógrafa, electrónica o digital) | 🟡 | Nota SOAP; al **firmar** el servidor fija `firmadaEn` (hora del servidor) y `firmadoPor` (usuario autenticado con contraseña y, recomendado, 2FA). Es una firma electrónica simple ligada a la cuenta, **no** una firma electrónica avanzada (e.firma SAT) — ver NOM-024 |
| Sin tachaduras ni enmendaduras; correcciones trazables | ✅ | Una nota firmada no se puede editar ni borrar (`409 nota_firmada`); las correcciones son **adendas** con fecha y autor fijados por el servidor |
| Contenido mínimo de historia clínica y notas (interrogatorio, exploración, signos vitales, diagnósticos, pronóstico, plan, indicaciones) | 🟡 | 7 plantillas SOAP, signos vitales, CIE-10. El médico debe completar los apartados que exige la norma para cada tipo de nota (p. ej. *pronóstico*, nota de interconsulta, de referencia/traslado) |
| Diagnósticos codificados | 🟡 | CIE-10 local con ~390 códigos frecuentes + sinónimos; no es el catálogo completo de la DGIS |
| Cartas de consentimiento informado (con firmas de paciente, médico y, en procedimientos, testigos) | 🟡 | 5 plantillas, firma autógrafa digitalizada en tableta, PDF con hash SHA-256. Revisa el texto con tu abogado; la validez probatoria de la firma digitalizada es menor que la de una firma electrónica avanzada o la autógrafa en papel |
| Confidencialidad; acceso solo a personal autorizado | ✅ | Roles en el servidor (recepción no ve antecedentes/notas), sesiones con expiración, bitácora de lecturas del expediente (`ver_expediente`) |
| Conservación **mínima de 5 años** contados desde el último acto médico | 🟡 | La base no borra notas (los pacientes se dan de baja lógicamente). Depende de **tu** operación: mantener el servidor y los respaldos ese tiempo, migrar si cambias de proveedor, y no borrar volúmenes. Los respaldos diarios rotan (14 días): no son un archivo a 5 años (ver [respaldos.md](respaldos.md)) |
| Resumen clínico al paciente o autoridad que lo solicite | 🟡 | Exportación JSON (admin) e impresión/PDF de documentos; no hay aún un "resumen clínico" formal imprimible |
| Expediente electrónico conforme a NOM-024 | ❌/🟡 | Ver sección 2 |

## 2. NOM-024-SSA3-2012, Sistemas de información de registro electrónico para la salud (SIRES)

*(verificar vigencia y posibles actualizaciones en el DOF; la norma de 2012 seguía siendo la referencia al escribir esto).* La NOM-024 establece requisitos funcionales, de seguridad y de **intercambio** para los sistemas de expediente clínico electrónico, y la DGIS (Secretaría de Salud) opera un proceso de **certificación**.

| Tema | Estado | Detalle |
|---|---|---|
| Autenticación individual, control de acceso por roles | ✅ | Usuarios por persona, contraseñas scrypt, bloqueo, 2FA TOTP, 4 roles |
| Bitácora de auditoría inalterable | ✅ | `audit_log` de solo inserción con *trigger*; registra lectura, escritura, firma, adenda, descarga y exportación con IP |
| Integridad y no repudio de notas | 🟡 | Notas firmadas inmutables + adendas. Falta **firma electrónica avanzada** (certificado e.firma) y sello de tiempo de un tercero |
| Confidencialidad en tránsito y en reposo | 🟡 | TLS 1.2/1.3 (Caddy); respaldos cifrados con age; secretos cifrados con AES-256-GCM. La base de datos no está cifrada a nivel de columna: depende del cifrado de disco del proveedor |
| Identificación del paciente (CURP) | 🟡 | Campo CURP opcional, sin validación contra RENAPO |
| Catálogos fundamentales de la DGIS (CIE-10 completo, procedimientos CIE-9-MC, CLUES, entidades, medicamentos del Compendio, etc.) | ❌ | Solo un subconjunto local de CIE-10; no hay CLUES ni catálogos oficiales sincronizados |
| Intercambio de información (HL7 CDA R2 / guías de intercambio de la DGIS) | ❌ | Solo exportación JSON propia. No hay mensajería HL7 v2/CDA ni FHIR |
| Certificación DGIS | ❌ | No iniciada. Necesaria si una institución o convenio lo exige (frecuente en sector público y algunos aseguradores) |

**Ruta sugerida hacia certificación:** (1) obtener la guía/lista de verificación vigente de la DGIS; (2) incorporar catálogos oficiales y CLUES; (3) implementar intercambio CDA/FHIR según la guía; (4) firma electrónica avanzada para notas y recetas; (5) auditoría externa de seguridad; (6) solicitar la evaluación.

## 3. LFPDPPP 2025 (datos personales en posesión de particulares)

La nueva **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** se publicó en el DOF el 20 de marzo de 2025 y entró en vigor al día siguiente; abrogó la ley de 2010. Con la desaparición del INAI, la autoridad garante para particulares es la **Secretaría Anticorrupción y Buen Gobierno**. Los datos de salud son **datos personales sensibles**. *(Verifica el estado del nuevo reglamento y los lineamientos del aviso de privacidad.)*

| Obligación | Estado | Qué hacer |
|---|---|---|
| **Aviso de privacidad** (identidad y domicilio del responsable, datos tratados — señalando los sensibles —, finalidades, transferencias, medios para ejercer derechos ARCO y revocar consentimiento, cambios al aviso) | 🟡 | Plantilla en [aviso-privacidad-plantilla.md](aviso-privacidad-plantilla.md) y como consentimiento en el módulo Consentimientos. Debes completarla, publicarla (recepción + sitio web) y ponerla a disposición **antes** de recabar datos |
| **Consentimiento expreso y por escrito** para datos sensibles (firma autógrafa, firma electrónica o mecanismo de autenticación) | 🟡 | El módulo Consentimientos permite firmar el aviso en tableta y guarda PDF con hash. Hay excepciones legales al consentimiento (p. ej. atención médica de urgencia o cuando el titular no puede otorgarlo) — confírmalas con tu abogado |
| **Derechos ARCO** (acceso, rectificación, cancelación, oposición) y revocación | 🟡 | Acceso: exportación/impresión del expediente. Rectificación: edición de datos de identificación; las notas firmadas se corrigen por adenda. **Cancelación** choca con la obligación de conservar el expediente 5 años (NOM-004): procede el *bloqueo* y supresión al vencer el plazo. Falta un flujo formal de solicitudes con plazos (registro, acuse, respuesta en el plazo legal — *verificar* plazo vigente) |
| **Medidas de seguridad** administrativas, técnicas y físicas | 🟡 | Técnicas: ver [seguridad.md](seguridad.md). Administrativas (te tocan): inventario de datos, análisis de riesgos, responsable designado, capacitación, acuerdos de confidencialidad con el personal. Físicas: equipos, archiveros, acceso al consultorio |
| **Vulneraciones de seguridad**: informar de inmediato a los titulares afectados | 🟡 | Procedimiento en [seguridad.md §7](seguridad.md#7-respuesta-a-incidentes). Notificación a la autoridad: *verificar* |
| **Encargados** (quien trata datos por cuenta del responsable) y **transferencias** | 🟡 | Ver tabla siguiente. Formaliza contratos/cláusulas y menciónalos en el aviso |
| Bitácora y principio de responsabilidad (demostrar cumplimiento) | ✅/🟡 | La bitácora técnica ayuda; falta tu documentación de políticas |

### Encargados y terceros típicos

| Tercero | Qué datos recibe | Figura probable *(verificar)* | Notas |
|---|---|---|---|
| Hosting (DigitalOcean, Hetzner, AWS) | Todo (base y archivos en sus discos) | Encargado; servidores fuera de México → transferencia/remisión internacional | Firma su DPA; elige región; activa cifrado de disco |
| Almacenamiento S3 de respaldos | Respaldos **cifrados** con llave que no poseen | Encargado | Riesgo bajo por el cifrado; menciónalo |
| Proveedor de IA (Anthropic, vía Asistente IA) | Texto clínico **desidentificado** (Presidio + reglas); en EUA | Encargado / remisión internacional | La desidentificación automática no es perfecta: informa en el aviso, obtén consentimiento para esta finalidad o desactiva el módulo; revisa términos de retención de datos de la API |
| WhatsApp (Meta) — recordatorios y enlaces | Nombre, teléfono, fecha de cita, enlace de videoconsulta. Dos modos: enlace `wa.me` que el personal envía desde **su** WhatsApp, o envío automático desde la API con **WhatsApp Cloud API** (`WHATSAPP_*`) | Con Cloud API, Meta actúa como encargado/proveedor *(verificar)*; servidores fuera de México | No envíes diagnósticos ni resultados por WhatsApp; usa plantillas neutras ("Tiene cita el …"); obtén autorización del paciente (casilla en el aviso) |
| Jitsi (meet.jit.si) — telemedicina | Audio/video de la consulta (cifrado en tránsito; servidor público de 8x8) | Encargado / tercero | Para uso clínico es preferible un Jitsi propio; agrega su dominio con `CSP_FRAME_EXTRA` y `PP_JITSI` |
| Hugging Face / jsDelivr | Solo descargas de modelos/código; **no** reciben datos de pacientes | No aplica | Exponen la IP del usuario al proveedor |
| PAC (timbrado CFDI) | Datos fiscales del paciente/receptor | Encargado (o tercero por obligación fiscal) | Ver sección 6 |

## 4. NOM-151-SCFI-2016, Conservación de mensajes de datos y digitalización de documentos

| Requisito | Estado | Detalle |
|---|---|---|
| Constancia de conservación emitida por un **Prestador de Servicios de Certificación (PSC)** acreditado por la Secretaría de Economía (sello digital de tiempo sobre el hash del documento) | ❌ | MediSuite calcula hashes SHA-256 de consentimientos y firma recetas con ES256 con la llave de la organización, lo que permite detectar alteraciones, pero **no** genera constancias NOM-151. Para dar mayor valor probatorio a consentimientos, notas firmadas y documentos digitalizados habría que integrar un PSC (API de constancias) y guardar la constancia junto al documento |
| Digitalización de documentos en papel con valor probatorio | ❌ | La carga de documentos escaneados no sigue el procedimiento de digitalización certificada de la norma |

## 5. COFEPRIS: software como dispositivo médico (SaMD)

En México, el software con **finalidad médica** (diagnóstico, prevención, monitoreo, tratamiento) puede considerarse dispositivo médico conforme a la Ley General de Salud y el Reglamento de Insumos para la Salud, y requerir **registro sanitario** según su clase de riesgo; COFEPRIS ha emitido guías sobre SaMD *(verificar la guía vigente y la clasificación aplicable)*. La línea entre "herramienta de apoyo administrativo/educativo" y "dispositivo médico" depende de **la finalidad declarada** y de cómo se usa el resultado.

| Módulo | Riesgo regulatorio | Recomendación |
|---|---|---|
| Expediente, agenda, receta, caja, reportes | Bajo (software administrativo/registro) | — |
| Calculadoras y escalas | Bajo–medio (fórmulas publicadas, el médico interpreta) | Mantener fórmula y referencia visibles (ya se muestran) |
| Visor DICOM (mediciones, HU, W/L), Visor 3D, Patología | **Medio–alto** si se usa para diagnóstico primario | Etiquetar "no para diagnóstico primario"; usar visores con registro para interpretación formal |
| Pulso por cámara (rPPG), goniómetro, ECG (detección y alertas de FA/extrasístoles), signos vitales Bluetooth | **Medio–alto** (mediciones fisiológicas y alertas) | Mostrar como "estimación, no sustituye equipo médico" (ya hay avisos); no usar para decisiones clínicas sin confirmación con un dispositivo con registro; no anunciarlos como dispositivos de medición |
| OCR de laboratorios | Medio (transcripción que puede alterar valores) | Revisión obligatoria por el usuario (ya existe); conservar la imagen original |
| Asistente IA (resúmenes, nota SOAP, cartas) | Medio–alto según uso | Mantener como borrador que el médico revisa y firma; no generar diagnósticos ni dosis automáticos; registrar el uso |
| Dictado (Whisper) | Bajo (transcripción revisada por el médico) | — |

Si comercializas MediSuite o lo ofreces a terceros con alguna de estas finalidades, obtén una **opinión regulatoria** antes de su lanzamiento; un consultorio que lo usa como herramienta interna de apoyo también debe documentar que el juicio clínico prevalece (los avisos "Herramienta de apoyo. No sustituye el juicio clínico" ya aparecen en la interfaz).

## 6. CFDI 4.0 (facturación)

| Requisito | Estado | Detalle |
|---|---|---|
| Generar XML CFDI 4.0 con datos del emisor/receptor, conceptos y claves SAT | 🟡 | Caja genera el XML (prellenado) |
| **Sellado con CSD** (Certificado de Sello Digital del emisor) y **timbrado por un PAC** autorizado por el SAT | 🟡 | La API incluye una integración opcional con **Facturapi** (`FACTURAPI_KEY`) para timbrar; sin ella, el XML generado en Caja debe timbrarse en tu PAC o en el portal del SAT. Sin timbre no es un comprobante fiscal válido. Verifica con tu contador la configuración (CSD cargado en el PAC, régimen, claves de producto) antes de emitir |
| Cancelación, complementos de pago, envío al receptor | ❌ | Fuera del alcance actual |
| Reglas fiscales de servicios médicos | 🟡 | Configúralo con tu contador: p. ej. el tratamiento de IVA de servicios profesionales de medicina y el requisito de pago por medios electrónicos (transferencia, tarjeta, cheque nominativo) para que el paciente pueda deducir honorarios médicos *(verificar con tu contador)* |

## 7. Otras consideraciones

- **Telemedicina:** obtén consentimiento informado específico (plantilla incluida), identifica al paciente al inicio, registra la nota de la teleconsulta como cualquier otra y considera las disposiciones de la Secretaría de Salud sobre telesalud que apliquen a tu entidad *(verificar)*.
- **Receta:** la receta impresa debe cumplir los requisitos del Reglamento de Insumos para la Salud (datos del médico, cédula, institución que expidió el título, domicilio, fecha, firma autógrafa). La firma ES256 y el QR **complementan** pero no sustituyen la firma autógrafa; medicamentos controlados (grupos I–III) requieren recetarios especiales con código de barras de COFEPRIS — **no** emitas esas recetas con MediSuite.
- **Menores de edad:** consentimiento de padre/madre/tutor y asentimiento del menor según la edad.
- **Personal:** acuerdos de confidencialidad firmados; capacitación anual en protección de datos y seguridad.

## 8. Resumen de brechas priorizadas

| Prioridad | Brecha | Esfuerzo estimado |
|---|---|---|
| Alta | Aviso de privacidad + consentimiento expreso firmado por cada paciente | Operativo (plantilla lista) |
| Alta | Contratos/cláusulas con hosting, IA, almacenamiento | Legal |
| Alta | Procedimiento ARCO con registro y plazos | Desarrollo pequeño + operativo |
| Media | Firma electrónica avanzada (e.firma) en notas y recetas; sello de tiempo / constancia NOM-151 | Desarrollo medio + costo de PSC |
| Media | Rotación de `MASTER_KEY` en la API | Desarrollo pequeño |
| Media | Timbrado CFDI: validar la integración con Facturapi o integrar otro PAC | Configuración + contrato PAC |
| Baja–media | Catálogos DGIS, CLUES, intercambio CDA/FHIR, certificación NOM-024 | Desarrollo grande |
| Según uso | Opinión regulatoria COFEPRIS para módulos de IA, imagen y señales | Asesoría externa |
