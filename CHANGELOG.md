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
- Controles del visor de estudios: herramientas de distancia, **ángulo** y **área
  (elipse)**, mover y zoom; acercar, ajustar, girar 90°, voltear, **invertir** y
  restablecer; ventana (presets de TC; en resonancia sólo «automática», porque no hay
  unidades absolutas); **cine** de cortes; deslizador de cortes; pantalla completa y
  **modo presentación** para enseñárselo al paciente; atajos de teclado documentados
  (`?`) que no roban teclas mientras se escribe.
- **Captura de la imagen**: PNG sin pérdida con las mediciones dibujadas y un sello
  (estudio, serie, fecha, corte, ventana) y la leyenda «Material de apoyo · No es un
  informe radiológico». Se descarga, se copia o se guarda en el expediente. El nombre
  del paciente sólo va en la imagen si se pide.
- **Cortes clave**: marcar un corte con nombre, nota y la vista exacta (ventana, zoom,
  giro) con la que se marcó; muescas en el deslizador, salto entre ellos y panel con
  miniaturas. Una marca por corte (marcar otra vez actualiza). Migración 0050.
- **Hoja de cortes clave en PDF** con membrete y leyenda; con opción sin nombre ni
  fecha de nacimiento.
- **Enlace temporal** para interconsulta: exige confirmar el consentimiento del
  paciente (queda registrado), dura de 1 hora a 7 días, se revoca cuando se quiera y
  sirve los cortes **sin identidad** (nombre, ID, nacimiento, médicos, institución y
  etiquetas privadas vaciados al vuelo; el original no se toca). Se abre sin sesión en
  `/#/compartido/<token>`, sólo para mirar y medir. Del token sólo se guarda su hash;
  se muestra una sola vez. Crear, abrir y revocar quedan en la bitácora.
- Barrera de error por pestaña y de último recurso: una pantalla que falla ya no
  deja el sitio en blanco; muestra el motivo y ofrece recargar o volver al inicio.
- Guardia de arranque en `index.html`, en HTML y JavaScript puros: si el paquete no
  carga o algo truena antes de que exista la primera barrera de React, la pantalla
  dice qué pasó y ofrece recargar. Antes ese caso se veía como una página en blanco,
  sin mensaje y sin forma de saber por qué.
<!-- Tramo C · Neuro 3D -->
- **Neuro 3D** (`/imagen/neuro-3d`, grupo «Imagen y señales» del menú, y
  botón en la pestaña Imágenes del expediente): encéfalo con lóbulos, ínsula,
  cerebelo y tronco; ventrículos; polígono de Willis; vértebras C1 a sacro con
  discos, médula por segmentos y raíces, generados en código. Capas con opacidad,
  pelado animado, cortes sagital/axial/coronal, columna despiezada, vías
  esquemáticas y flujo opcional en las arterias. Al tocar una raíz se encienden su
  segmento medular, el disco que cruza, las vértebras de su agujero y su dermatoma
  (con el punto clave de ASIA). Modo «Explicar al paciente» con marcas de nivel
  (hernia, estenosis foraminal) y de región; captura PNG y, con el paciente en
  contexto y su consentimiento, guardado en el expediente. Aviso fijo de modelo
  esquemático; sin WebGL lo dice. Permiso nuevo `neuro3d.read` (médico,
  administración y master). Dependencia `three` 0.186.1, en su propio paquete.
- **Escalas neurológicas** en la consulta (sección junto a «Plan clínico») y su
  evolución en la pestaña «Escalas» del expediente: Glasgow (con «no valorable»),
  NIHSS, Hunt y Hess, WFNS, Fisher modificada, Spetzler-Martin, Rankin modificada,
  ASIA (grado AIS), Karnofsky, mJOA, Oswestry, NDI, ENA de dolor y Barthel, cada una
  con su fuente. El puntaje se sugiere mientras se llena y lo calcula el servidor al
  guardar; una escala mal capturada se anula con motivo, no se borra. Permisos
  `clinical_scales.read`/`write` para el médico. Migración 0052. Lo marcado
  «(verificar)» espera revisión médica.
<!-- base-modulos-extra (tramo A) -->
- Base para los módulos extra: módulos opcionales que se encienden por consultorio
  en **Sistema → Módulos** (tabla `tenant_modulos`, migración 0051; apagar no borra
  datos y cada cambio queda en la bitácora), pantalla **Estado de servicios**
  (Orthanc, Whisper, Presidio, segmentador e IA), permisos `modulos.manage` y
  `servicios.read`, variables opcionales de esos servicios, perfiles de Docker
  `imagen` e `ia`, y la carpeta `openspec/` con su primer cambio. Todavía no hay
  ningún módulo opcional instalado.
- Material de referencia en `docs/referencias/`: MediSuite (imagen DICOM con Orthanc
  y OHIF, anonimización con Presidio, voz a texto, receta con QR), de solo lectura y
  sin binarios de terceros. No es código de Cortex.

### Cambiado
- El visor ocupa la altura de la pantalla en vez de ser un cuadrado, y su barra se
  compacta según el ancho que de verdad tiene.
- Voz de la interfaz en masculino genérico: «el paciente», «el médico».
- Puertos, contenedores y nombres de producción propios para convivir con GEMS.

### Corregido
- Las mediciones trazadas **nunca llegaban al panel**: el visor escuchaba el fin del
  trazo en el elemento de la imagen, pero Cornerstone lo avisa en su `eventTarget`
  global. Se vio al probar de verdad con una resonancia: se dibujaba «69.1 mm» y el
  panel seguía diciendo «Todavía no hay mediciones». Ahora se escucha donde corresponde
  y sólo cuenta el trazo de la pila abierta.
- Los mensajes propios del módulo de imagen ya no se reemplazan por «Ocurrió un error
  inesperado»: el helper compartido sólo entendía errores del servidor.
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
- Neuro 3D: la columna tiene sus curvas fisiológicas medibles (lordosis cervical,
  cifosis torácica, lordosis lumbar de 52° y pendiente sacra de 36°) y el sacro mide
  11 cm con un cóccix corto; antes bajaba como una cola larga por debajo de la pelvis.
  «Separar vértebras» abre cada disco a lo largo de la curva y ya no deja vértebras
  lumbares corridas a un lado del conducto. La raíz L5 baja por delante del ala del
  sacro y la vista «Columna completa» ya alcanza el cóccix.

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
