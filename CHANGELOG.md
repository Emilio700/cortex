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
- Generador de un estudio DICOM sintético (`python -m scripts.generar_estudio_demo`)
  para probar la carga y el visor sin usar imágenes de pacientes: cuatro series
  (T1, T1+C, T2, FLAIR) con paciente ficticio `DEMO^SINTETICO`.
- Barrera de error por pestaña y de último recurso: una pantalla que falla ya no
  deja el sitio en blanco; muestra el motivo y ofrece recargar o volver al inicio.
- Guardia de arranque en `index.html`, en HTML y JavaScript puros: si el paquete no
  carga o algo truena antes de que exista la primera barrera de React, la pantalla
  dice qué pasó y ofrece recargar. Antes ese caso se veía como una página en blanco,
  sin mensaje y sin forma de saber por qué.

### Cambiado
- Voz de la interfaz en masculino genérico: «el paciente», «el médico».
- Puertos, contenedores y nombres de producción propios para convivir con GEMS.

### Corregido
- Un CD de estudios ya no deja el estudio en «llegó incompleto» por traer su índice.
  Los discos reales incluyen `DICOMDIR` y a veces `AUTORUN.INF` o un lector; se contaban
  como archivos ilegibles y bastaba uno para marcar `partial` un estudio completo. Se
  vio con un estudio de 90 cortes parejos a 2 mm y cero huecos. Ahora se distinguen los
  archivos que no son imágenes —se informan y se ignoran— de un DICOM que sí parece
  imagen y no se puede leer, que sigue marcando el estudio como incompleto.
- El visor de estudios **ya decodifica en el navegador**. Faltaban tres piezas que
  sólo se ven al abrirlo de verdad: los códecs del cargador DICOM son CommonJS y
  Vite los servía sin `default`; `dicom-parser` perdía su `this` al servirse como
  módulo; y `events`, que necesita vtk.js detrás de Cornerstone, no estaba
  instalado. Además Cornerstone 5 usa por omisión una ruta de metadatos que aquí no
  se puebla, así que encontraba el archivo pero no los píxeles: se usa la ruta
  clásica, que es la que decodifica comprimidos con los mismos workers.
  Verificado en Chrome sobre un corte real: `DECODIFICADO 64x64 · 4096 valores`.
- La barrera de error raíz envuelve también la sesión y el enrutador: un fallo al
  armar `AuthProvider` o `HashRouter` desmontaba toda la aplicación (React 19) y se
  veía en blanco, porque la barrera de `App` vive por dentro de ellos.

### Quitado
- La pantalla **Triage** del menú de recepción. Los signos vitales se toman desde la
  cita, en la Agenda —donde también aparece el paciente que llegó sin confirmar— y
  el médico los toma al abrir la consulta si nadie lo hizo en sala. Era una segunda
  puerta al mismo formulario y la única que dejaba fuera a los agendados. El
  permiso `triage.create` y el formulario siguen igual: en Master aparecen como
  «Signos vitales (triage)».
- Lo ginecológico deja de ofrecerse (embarazo y control prenatal, historia
  gineco-obstétrica, FUR, consentimientos y plantillas de ginecología, aviso
  prenatal). Los datos y la cadena de migraciones se conservan.
- Scripts del sistema legado y de despliegue específicos de GEMS.
