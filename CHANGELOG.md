# Changelog

Todos los cambios notables de Cortex. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con
[versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado
- Base de Cortex a partir de GEMS v1.2.0: agenda, triage, consulta SOAP, expediente,
  recetas, órdenes y resultados, consentimientos, certificados, cobros, auditoría y
  ayuda guiada.
- Identidad visual de Cortex: marca del logo, acceso con red neuronal animada y
  escáner, menú y bandas marinas, tipografías propias y movimiento que respeta
  «reducir movimiento».
- Ficha neurológica del paciente: lateralidad, antecedentes neurológicos, implantes
  y anticoagulantes (migración 0048).
- Señales de implantes y anticoagulantes en el expediente y en la consulta.
- Consentimientos de neurocirugía: craneotomía, columna, derivación de LCR, biopsia
  estereotáctica, dolor intervencionista, nervio periférico y punción lumbar.
- Episodios clínicos, plantillas de órdenes y categorías de estudio (Neuroimagen,
  Neurofisiología) de neurocirugía.
- «Cirugías programadas» de las próximas dos semanas en el inicio del médico.
- Seed de demostración `seed_cortex` con un consultorio de neurocirugía ficticio.
- Estudios de imagen DICOM dentro del expediente: carga de cortes o del ZIP del CD,
  agrupación por estudio y serie, orden de cortes por geometría, detección de la
  secuencia (T1, T2, FLAIR, DWI…) y estado que distingue «completo» de «llegó
  incompleto». Tres tablas nuevas (`imaging_studies`, `imaging_series`,
  `imaging_annotations`); no toca nada de lo guardado.
- Visor de estudios en `/pacientes/:id/estudios/:studyId`: series, contraste,
  recorrido con la rueda, medición con unidades reales, comparación en paralelo con
  el estudio previo y avisos cuando las secuencias no son comparables.
- Mediciones como dato del expediente: nacen sin aceptar, se pueden borrar mientras
  no se acepten, y una aceptada ya no se borra. Se muestra la evolución contra el
  estudio previo (`+3.3 (+18.3 %)`).
- Módulo `modules/imagen` con la separación dominio · servicios · componentes ·
  páginas, documentada en `docs/DESIGN.md`.

### Cambiado
- Voz de la interfaz en masculino genérico: «el paciente», «el médico».
- Puertos, contenedores y nombres de producción propios para convivir con GEMS.

### Quitado
- Lo ginecológico deja de ofrecerse (embarazo y control prenatal, historia
  gineco-obstétrica, FUR, consentimientos y plantillas de ginecología, aviso
  prenatal). Los datos y la cadena de migraciones se conservan.
- Scripts del sistema legado y de despliegue específicos de GEMS.
