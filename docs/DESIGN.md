# Guía de diseño de CORTEX

Escrito para quien desarrolle en este repositorio, incluidos los agentes que
trabajan por lotes. El objetivo es que dos personas distintas que toquen dos
pantallas distintas produzcan algo que se vea como el mismo sistema.

Esta guía **describe lo que ya existe** y fija lo que se ha ido decidiendo con
el consultorio. Cuando una decisión venga de una petición concreta del doctor o
de la asistente, se anota: sirve para saber qué se puede cambiar y qué no.

---

## 0. La identidad de Cortex

Cortex hereda los patrones de pantalla de GEMS (las secciones de abajo siguen
vigentes) y les pone encima su propia identidad. Vive en dos lugares:

- `frontend/src/scss/_cortex.scss`: se carga **al final** y redefine las
  variables que leen las capas heredadas (`--cui-*`, `--glass-*`, `--hf-*`). Una
  pantalla que usa esos tokens toma la marca sola.
- `frontend/src/components/marca/`: `CortexMarca` (cerebro + palabra CORTEX con la
  E de tres barras) y `RedNeuronal` (el fondo animado en canvas).

**Paleta** (usa los `--cx-*`, no colores sueltos):

```
Marca        --cx-marino-900 #040a18 · --cx-marino-800 #071330 · --cx-marino-700 #0b1d45
             --cx-azul #1e63e9 (5.2:1 con blanco) · --cx-azul-vivo #2f8cff
             --cx-cian #38bdf8 · --cx-cian-claro #7dd3fc
Superficies  --cx-fondo #eef3fa · --cx-superficie #fff · --cx-superficie-2 #f6f9fd
Texto        --cx-texto #0d1b33 · --cx-texto-2 #4a5b78 · --cx-texto-3 #7b8aa5
Radios       --cx-radio 14px · --cx-radio-lg 20px
```

**Reglas:**

- El **marco** es marino (acceso, menú lateral, bandas de encabezado, banda del
  inicio): ahí brilla el cerebro del logo, que sólo se ve bien sobre fondo oscuro.
  El **contenido clínico** va sobre superficies claras, por legibilidad en
  jornadas largas.
- El azul eléctrico es para **acciones** (botón primario, foco, elemento activo).
- Tipografía: Inter para la interfaz; Michroma sólo para la palabra CORTEX.
- **Movimiento** con propósito y corto: entrada de pantallas ≤ 450 ms, cifras que
  cuentan (`CifraAnimada`), señal en el menú activo, barrido lento en las bandas.
  Todo se apaga con «reducir movimiento»; la red neuronal se pausa con la pestaña
  oculta y no se pinta en las pruebas (jsdom).
- Los recursos de marca se regeneran desde `docs/marca/logo-cortex.jpeg` con
  `python frontend/scripts/generar-marca-cortex.py`.

---

## 1. Quién usa esto

Tres perfiles, y el diseño se inclina por ellos en este orden:

| Quién | Cómo trabaja | Qué implica |
|---|---|---|
| **La asistente** (Jhoany) | Todo el día en el sistema, con la paciente enfrente y el teléfono sonando | Pocos clics, campos grandes, nada de jerga técnica |
| **El doctor** (Adolfo y equipo) | Entre consulta y consulta, con prisa | Lo esencial visible, lo avanzado plegado |
| **Administración** (master) | Ocasional, para configurar y supervisar | Puede permitirse más densidad |

Nadie aquí es técnico. **Ningún mensaje debe exigir saber qué es un HTTP, un
campo obligatorio de base de datos o un verbo REST.**

---

## 2. Tokens: usa los que hay, no inventes colores

Todo vive en `frontend/src/scss/_hyperframes-medical.scss` como variables CSS.
**No pongas colores sueltos en los componentes.**

```
Superficies   --hf-bg #f8f7f5 · --hf-surface #fff · --hf-surface-alt #f3f2ef
Bordes        --hf-border #e8e5e0 · --hf-border-hover #d5d1ca
Texto         --hf-text #1a1a1a · --hf-text-secondary #6b6b6b · --hf-heading #0f172a
Acentos       --hf-blue #2563eb · --hf-green #16a34a · --hf-amber #d97706
              --hf-purple #7c3aed · --hf-red #dc2626
              (cada uno con su -light para fondos y -border para contornos)
Radios        --hf-radius-sm 6px · --hf-radius 10px · --hf-radius-lg 14px
Sombras       --hf-shadow-sm / --hf-shadow / --hf-shadow-lg (sutiles, planas)
Transiciones  --hf-transition 0.15s
```

**Aviso conocido:** las variables `--hf-*` no tienen variante para modo oscuro.
Si añades una pantalla que deba funcionar en oscuro, hay que definirlas; hoy
ningún componente lo hace.

### Qué significa cada color

El color comunica, no decora. Mantén esta correspondencia:

- **Azul** — acción principal, lo seleccionado, información neutra.
- **Verde** — confirmado, disponible, libre, correcto.
- **Ámbar** — atención, pendiente, incompleto pero válido.
- **Rojo** — error, cancelado, destructivo.
- **Morado** — procedimientos y categorías secundarias.

---

## 3. Reglas que pidió el consultorio

Estas no son preferencias de quien programa. Salieron de usar el sistema.

1. **Bordes visibles.** *"Los bordes de los campos se pierden."* Los campos de
   texto llevan borde de 2px y un gris oscuro, no el gris casi blanco por
   defecto. Clase `gems-campo`.
2. **Nada de textos de ejemplo dentro de los campos.** Fuera los `Ej. 1 tableta`.
   Como mucho unos `...` discretos. La etiqueta y la pregunta guía de arriba ya
   dicen qué va ahí.
3. **Botones con color.** *"Que tengan más colores para ubicarlos más fácil."*
   Nada de botones fantasma para acciones frecuentes. Lo seleccionado se rellena
   en sólido con texto blanco, no solo se subraya.
4. **MAYÚSCULAS** en todo lo que se teclea de una paciente o de la consulta.
   Excepciones: correo, contraseñas, números y fechas. Helper compartido en
   `frontend/src/shared/utils/mayusculas.ts`; corrige el valor en el DOM y
   restaura la selección para que **el cursor no salte**.
5. **Todo en español**, incluidos los errores del servidor. Un `detail` en
   inglés es un error a corregir, no un detalle. Y no basta con traducir: el
   mensaje dice **qué pasó y qué hacer**, sin verbos HTTP, sin nombres de
   columnas y sin códigos.
   Los **422 de Pydantic** no se arreglan router por router (Pydantic corta
   antes de que el router se ejecute): se traducen en el manejador de
   `RequestValidationError` de `app/main.py`, por el `type` del error, con
   `app/core/errores_validacion.py` poniendo el nombre del campo tal como se
   ve en la pantalla. **Campo nuevo que viaja en un formulario = una entrada
   nueva en `ETIQUETAS`**, o el mensaje saldrá genérico.
6. **Lo avanzado, plegado.** La consulta abre en lo esencial. Plan clínico,
   consentimientos y certificados van en secciones plegables, cerradas por
   defecto, **pero con una insignia en el encabezado si ya tienen contenido**:
   que estén cerradas no puede ocultar información clínica.
7. **Preguntas guía sobre los campos.** "¿Cuánto debe tomar?", "¿Cada cuánto?".
   Cuestan una línea y ahorran una llamada de teléfono.
8. **Sugerir, no decidir.** Las fechas calculadas (FPP, próxima revisión) se
   muestran como sugerencia y **siempre se pueden sobrescribir**: una fecha por
   ecografía manda sobre la regla de Naegele.

---

## 4. Patrones de pantalla

### 4.1 Cabecera de página

Título grande, subtítulo de una línea explicando para qué sirve, y las acciones
a la derecha. La acción principal en azul sólido; las secundarias con borde.

```
Agenda de Citas                              [ Exportar ]  [ + Nueva Cita ]
Consulta y organiza las citas de la clínica
```

### 4.2 Barra de filtros

Los filtros van juntos en una tarjeta propia sobre el contenido, cada uno con
su etiqueta encima y un icono. **Un filtro que no aplica no se muestra**: el
de sucursal solo si el usuario tiene acceso a más de una, el de sala solo si
la sucursal tiene más de una. Nunca ofrecer algo que devolverá 403 o vacío.

### 4.3 Panel lateral de contexto

En pantallas anchas, una columna a la derecha con lo que acompaña a la vista
principal: mini calendario, lo del día seleccionado, y un resumen con cifras.
Es apoyo: si no cabe, se apila debajo, no se recorta.

### 4.4 Tarjeta de cita

Hora en negrita, nombre de la paciente, y debajo tipo y sala como metadatos
pequeños con icono. Menú de tres puntos a la derecha para las acciones.

### 4.5 Cifras y métricas: no pintar lo que no se puede calcular

Un panel de cifras es una promesa. Si el dato no existe, **no se enseña un
cero**: se enseña una raya y se explica por qué en el `title`.

Caso real, el resumen del mes de la agenda. El sistema **no tiene un estado
"no asistió"**, así que el porcentaje de asistencia no puede dividirse entre
el total: una cita de dentro de dos semanas todavía no ha faltado a nada. Se
mide sobre lo ya resuelto:

```
asistencia = atendidas / (atendidas + canceladas)
```

y cuando el mes no tiene ninguna cita resuelta, la función devuelve `null` y
la tarjeta pinta "—". Un 0 % ahí querría decir "nadie vino", que es otra cosa.

La misma regla vale para el resto: **antes de añadir una cifra al panel,
comprueba que los datos que ya llegan la sostienen.** Si no, dilo en vez de
inventar un endpoint o un número.

### 4.6 Exportar

Un botón que no hace nada es peor que ninguno. Si se pone "Exportar", que
exporte de verdad. El contrato es el mismo en toda la app:

- Se exporta **lo que se está viendo**: el mismo rango y los mismos filtros.
  Nada de volver a pedirle al servidor otra cosa.
- **CSV** con fila de cabeceras en español, generado en el navegador a partir
  de lo ya cargado, y con **BOM** (`﻿`) delante para que Excel no se coma
  los acentos.
- Los campos se entrecomillan y las comillas se duplican: una nota con una
  coma o un salto de línea no puede partir la fila.
- El nombre del archivo lleva el rango: `agenda-2026-09-01-a-2026-09-30.csv`.
- Sin nada que exportar, el botón va **deshabilitado y con su explicación en
  el `title`**, no pulsable para acabar en un archivo vacío.

La generación es una **función pura con pruebas**; el componente sólo arma el
`Blob` y dispara la descarga.

### 4.7 Secciones plegables

`CCollapse` + `CFormSwitch`, encabezado pulsable entero, `aria-expanded` y
`aria-controls`. Cerrada ocupa **solo la franja del encabezado**: nada de dejar
un hueco vacío. Patrón de referencia: `ConsultationSection`.

### 4.8 Estados vacíos

Explican qué falta y qué hacer, en español y sin culpar a nadie.
`"Todavía no hay medicamentos en esta receta."` vale;
`"No data"` no.

### 4.9 Visor de estudios

La imagen va sobre **negro fijo**, no sobre el fondo del tema: así se lee una
resonancia. El cromo alrededor sí usa los tokens.

- Series a la izquierda, imagen al centro, panel con pestañas a la derecha
  (**Mediciones · Cortes clave · Comparar · Estudio**). En pantalla angosta las tres
  columnas se apilan. La imagen ocupa la altura que queda en pantalla.
- El encabezado siempre dice **qué se está viendo**: descripción, modalidad,
  fecha, institución y estado (`Estudio completo` o el motivo de que no lo esté).
  Nunca se muestra una imagen sin fecha ni modalidad.
- Una serie sin geometría se marca «sin posición» y el estudio avisa de que no
  hay reconstrucción multiplanar. No se finge MPR.
- Las mediciones nacen **sin aceptar**. Aceptarlas es lo que las vuelve dato del
  expediente; una aceptada ya no se borra, se corrige en la nota. Misma regla que
  el resto del sistema: el rastro de lo que se midió no se pierde.
- La evolución contra el estudio previo se escribe en texto
  (`+3.3 (+18.3 %) vs. estudio previo`) y con color de **aviso**, no de alarma:
  en un tumor, crecer puede ser progresión o respuesta al tratamiento.
- Los análisis asistidos (volumetría, segmentación) aparecen en la pestaña
  «Estudio», con su motor y su versión, y se pueden apagar. Mientras no existan,
  la pestaña lo dice; no se deja un hueco que prometa IA.

**Controles.** La barra va en grupos, de lo que más se usa a lo que menos:
herramientas del botón izquierdo (contraste, distancia, ángulo, elipse, mover, zoom),
vista (acercar, ajustar, girar, voltear, invertir, restablecer), ventana, cine,
acciones (**Capturar · Marcar · Compartir**) y pantalla (presentación, completa,
atajos). Con poco ancho los botones pierden su rótulo y quedan con su ícono y tooltip,
**salvo** Capturar, Marcar y Compartir, que se buscan por nombre. Cada tooltip dice su
atajo, sacado de la misma tabla (`dominio/atajos.ts`) que alimenta la ayuda: no pueden
contradecirse. Los atajos no actúan mientras se escribe en un campo ni con una ventana
abierta, ni con Ctrl/Cmd/Alt (son del navegador).

- **Ventana (contraste):** presets sólo en tomografía (unidades Hounsfield). En
  resonancia hay «automática» y el ajuste a mano; ofrecer «encéfalo 40/80» sobre una
  RM prometería una precisión que no existe.
- **Captura:** PNG sin pérdida, con las mediciones y un sello (estudio, serie, fecha,
  corte, ventana) y la leyenda de material de apoyo. El **nombre del paciente no va
  por omisión**: una imagen suelta se reenvía y se queda en cualquier teléfono. Si se
  pidieron las mediciones y no se pudieron dibujar, se dice y no se entrega la captura
  a medias.
- **Cortes clave:** una marca por corte, con nombre, nota y la vista con que se marcó.
  Se ven como muescas en el deslizador y como miniaturas en su pestaña.
- **Compartir:** la hoja en PDF (con opción sin nombre) y el **enlace temporal**.
  El enlace exige confirmar el consentimiento, vence (máximo 7 días), se revoca, sirve
  los cortes sin identidad y se muestra **una sola vez**. Quien lo abre no entra al
  expediente ni puede guardar, capturar o compartir.
- **Modo presentación (`T`):** sólo la imagen y el deslizador, para enseñársela al
  paciente; oculta series, notas y herramientas. `Esc` sale.
- Nada dice «guardado», «enlace creado» o «revocado» hasta que el servidor lo confirmó.

Referencia: `frontend/src/modules/imagen/`.

### 4.10 Cuando algo falla: nunca una pantalla en blanco

Una pantalla vacía no dice nada y no se puede diagnosticar; con el médico
enfrente es una consulta detenida. Cuatro capas, de adentro hacia afuera:

1. **Por pestaña**: `BarreraDeError` en `TabsOutlet`. Falla la pantalla, siguen
   vivas las demás pestañas y el menú.
2. **De la aplicación**: otra `BarreraDeError` dentro de `App`, por si falla el
   armazón o el enrutador.
3. **Raíz**: en `index.tsx`, envolviendo todo. Sin ella, un fallo al armar la
   sesión o el enrutador se escapaba de las dos anteriores y React desmontaba la
   aplicación entera.
4. **Guardia de arranque**: en `index.html`, en HTML y JavaScript puros, fuera de
   React y de Vite. Es lo único que sobrevive si el paquete no carga, y es el caso
   que se veía como una página en blanco sin pista alguna. Muestra el motivo, un
   botón de recarga y se retira sola en cuanto React pinta algo.

El mensaje dice qué pasó y qué hacer; el detalle técnico va plegado. Nunca datos
del paciente: el detalle es el mensaje del error, no el expediente.

Referencia: `frontend/src/shared/components/BarreraDeError.tsx` y `frontend/index.html`.

<!-- base-modulos-extra (tramo A) -->
### 4.11 Módulos opcionales

Los permisos dicen **quién** usa algo; los módulos dicen **si el consultorio lo
usa**. Un módulo opcional (inventario, tareas, recepción desde equipos, dictado,
IA…) se instala para todos y se enciende por consultorio en **Sistema → Módulos**.

- **Backend:** el catálogo vive en `app/core/modulos.py` (`MODULOS_OPCIONALES`).
  Los routers del módulo llevan `Depends(require_modulo("<id>"))`: apagado,
  responde **404**, no 403, para que su información no se asome por otro camino.
- **Frontend:** el ítem del menú y su ruta llevan el mismo `modulo: '<id>'`
  (`_nav.tsx`, `routes.tsx`). El criterio es uno solo, `moduloPermitido`
  (`shared/utils/modulos.ts`), y se suma al permiso: ningún permiso ni rol abre
  un módulo apagado. Lo del núcleo no lleva `modulo`.
- Si un módulo aparece dentro de otra pantalla (expediente, consulta), se
  pregunta con `useAuth().tieneModulo('<id>')` y, apagado, **no se pinta**: no
  quedan huecos ni botones que lleven a «no está activo».
- **No se ofrece lo que no existe.** Un módulo entra a la pantalla de Módulos
  solo con `disponible=True`, en la misma rama que lo construye. Sin ninguno, la
  pantalla dice «Aún no hay módulos opcionales instalados».
- **Apagar no borra.** Solo oculta; al volver a encenderlo, todo sigue ahí. Cada
  cambio queda en la bitácora (`modulo.activado` / `modulo.desactivado`).
- Un módulo que necesita un servicio (Orthanc, Whisper, IA, segmentador) no se
  deja encender hasta que esté configurado; el interruptor queda deshabilitado
  y dice cuál falta. Apagarlo siempre se puede.
- El interruptor muestra lo que **confirmó el servidor**; «Guardado» aparece
  solo después de su respuesta. Si falla, se queda como estaba y dice por qué.
- **Estado de servicios** solo muestra lo que averigua el backend. La IA sale
  «Configurado, sin probar» (ámbar): no se le hace una consulta de prueba porque
  cuesta, y no se pinta en verde lo que nadie comprobó.

Referencia: `frontend/src/modules/sistema/`.
<!-- fin base-modulos-extra -->

### 4.12 Escalas clínicas: sugerir en pantalla, calcular en el servidor

<!-- Escalas neurológicas (Cortex, feat/escalas-neuro) -->

Una escala es **datos**, no código: ítems, opciones con sus puntos, forma de cálculo
(suma, porcentaje o prorrateo) y rangos de interpretación, con su **fuente** (autor y
año) siempre visible. Así el servidor repite la definición en Python y una prueba
compartida (`paridad.json`) vigila que digan lo mismo.

- **Opciones como botones grandes**, no un desplegable: se responde mirando al
  paciente. A la izquierda de cada opción, sus puntos. Grupo de radio accesible
  (flechas dentro del ítem, Tab entre ítems); la elegida se rellena en sólido.
- **El puntaje sugerido** se ve mientras se llena, con la interpretación pintada por
  tono (verde, ámbar, rojo). Es una sugerencia: el que se guarda lo calcula el
  servidor, y el aviso de guardado anuncia **ese**. Si no coincide, se dice.
- **«No valorable»** se distingue de cero: en el Glasgow anula el total y se registra
  por componentes (`O3 VT M5`); en el NIHSS cuenta 0 y queda anotado.
- **Secciones omitidas** (ODI, NDI) se permiten y se dicen («1 sección sin
  responder»); desde tres se avisa sin impedir guardar.
- **«(verificar)»** en ámbar marca el contenido clínico que falta confirmar contra la
  fuente validada. No se quita sin revisión médica.
- Una escala mal capturada **se anula con motivo**: queda tachada en el historial y
  fuera de la gráfica, nunca se borra.
- **Evolución**: una escala por gráfica (sus ejes no se comparan), con la tabla
  debajo y el cambio escrito en texto según la dirección de la escala (en el ODI
  bajar es mejorar; en el Glasgow, subir). Empeorar se pinta como **aviso**, no como
  alarma.

Referencia: `frontend/src/modules/escalas/` y `backend/app/services/escalas.py`.

---

## 11. Dónde vive cada cosa (módulos)

Un módulo por área clínica, y dentro de cada uno siempre las mismas capas. La
regla es simple: **la pantalla no habla con el servidor y el cálculo no vive
dentro de un componente.**

```
src/modules/<área>/
  dominio/      tipos y cálculos puros, con pruebas (sin React, sin red)
  servicios/    llamadas al API y arranque de librerías externas
  componentes/  piezas de interfaz sin estado de negocio
  paginas/      la pantalla que une todo
  ui/           estilos del módulo
  index.ts      única superficie pública
```

- El **expediente manda**: una pantalla clínica se abre desde el expediente y
  conserva su ruta (`/pacientes/:id/...`), no desde el menú.
- Si dos módulos necesitan lo mismo, se sube a `shared/`; no se copia.
- Las librerías pesadas —el motor del visor DICOM es el caso— se cargan con
  `React.lazy` y su propio paquete, para que quien no las usa no las descargue.
  Ese paquete solo se arma al servir y compilar; dentro de vitest se desactiva
  porque volvía la suite tres veces más lenta.

**Ejemplo vivo: imagen médica.** `modules/imagen` tiene `dominio/tipos.ts`
(series y comparabilidad), `dominio/medidas.ts` (evolución de una medición),
`servicios/estudiosApi.ts`, `servicios/cornerstone.ts`, los paneles y
`paginas/VisorEstudioPage.tsx`. La pestaña Imágenes del expediente solo monta
`EstudiosDelPaciente`; el visor vive en su propia ruta.

**Un módulo sin `paginas/`: escalas.** `modules/escalas` no tiene pantalla propia:
vive dentro de la consulta (`EscalasEnConsulta`, una sección más) y del expediente
(`EvolucionEscalas`, la pestaña «Escalas»), que ya son las pantallas. Su `dominio/`
es el catálogo como datos y el motor; `paridad.json` es el contrato con el servidor.

---

## 5. El modal de cita

Es la pantalla que más se usa. Estructura acordada:

1. **Cabecera**: "Editar Cita" + insignia del estado (Atendida, Confirmada…).
2. **Fila de identificación**: Tipo de cita · Paciente · Doctor.
   El paciente se busca escribiendo y, al elegirlo, queda una **etiqueta verde**
   con su nombre: que no quede duda de a quién se le está agendando.
3. **Dos paneles**:
   - *Izquierda*: calendario para elegir el día, con leyenda de
     seleccionada / disponible / no disponible.
   - *Derecha*: rejilla de horarios disponibles con conmutador **a. m. / p. m.**
     El elegido en azul sólido.
4. **Duración y Sala**, lado a lado.
5. **Aviso contextual** cuando hace falta explicar algo del dato, por ejemplo
   una cita anterior a las salas:
   > *Esta cita se agendó antes de que hubiera salas. Puedes dejarla en blanco
   > o asignarle una.*
6. **Notas adicionales** (opcional).
7. **Cerrar** (secundario) y **Guardar cambios** (azul sólido), abajo a la derecha.

**Regla dura:** al editar una cita, `room_id` solo viaja si cambió. Mandar
`room_id: null` **borra la sala** de la cita.

### 5.1 Disponibilidad: no pintes un hueco que no has comprobado

Un horario en verde es una promesa. Si la asistente lo elige y el servidor
rechaza el guardado, la pantalla ha mentido y habrá que llamar a la paciente.

- La rejilla de horarios y la leyenda del calendario salen de
  `GET /doctor-schedule/availability`. **No las calcules en el navegador.**
- Ese endpoint compone en el servidor las mismas cuatro reglas que valida
  `POST /appointments`: empalme del doctor, bloqueos de agenda, horario de
  atención y choque de sala. Las citas canceladas no ocupan.
- El criterio de solapamiento vive en **un solo sitio**, `se_solapa` en
  `app/services/appointment_service.py`. Dos implementaciones acabarían
  discrepando, y la discrepancia se ve como un horario que no se deja agendar.
- Lo ocupado **se muestra**, deshabilitado y con su motivo: que las 10:00
  desaparezcan de la rejilla no explica nada. El motivo viene del backend ya
  redactado en español.
- Si la consulta falla, se dice («No se pudieron cargar los horarios
  disponibles») y no se ofrece ninguno. Un hueco inventado es peor que ninguno.

**Dos casos que hay que conocer:**

- *Día sin horario de atención configurado.* `check_outside_working_hours`
  trata "sin ventanas ese día" como "sin restricción", así que el servidor
  aceptaría cualquier hora. Es un fallo conocido y **no se arregla desde la
  pantalla**. El endpoint ofrece la jornada del consultorio (07:00–20:00),
  devuelve `jornada_por_defecto: true` y el modal lo dice en una línea.
- *Horas pasadas.* El servidor las acepta (se registran citas a toro pasado);
  el endpoint las devuelve ocupadas porque ofrecerlas no tiene sentido. Es la
  única divergencia deliberada, y va en la dirección segura: nunca se ofrece
  algo que se rechazaría.

---

## 6. Agenda

- Vistas: **Mes · Semana · Día · Lista**, más la vista **Por salas (día)**.
- La vista por salas es propia, no de FullCalendar: sus vistas por recurso son
  de pago y el repo usa la edición libre. **No simules columnas dentro de
  FullCalendar.**
- **La vista Lista no desmonta FullCalendar.** Se le esconde la rejilla con
  `.agenda-calendar--solo-toolbar` y se le deja la barra de arriba, que es la
  que sigue mandando el rango visible por `datesSet`. Si el calendario se
  desmonta, al volver salta al mes actual y el mes que se estaba mirando se
  queda vacío: es exactamente el fallo que ya hubo que corregir una vez. Por
  el mismo motivo el spinner de carga es un **overlay** sobre la tarjeta y
  nunca un nodo que sustituya al calendario.
- Al volver de la lista hay que llamar a `updateSize()`: la rejilla estuvo
  oculta y FullCalendar midió con altura cero.
- En la vista por salas, **los huecos libres se pintan en verde y se pinchan**:
  abren el modal con esa hora y esa sala puestas.
- Cada cita lleva un punto del color de su sala; **el color de fondo indica el
  ESTADO** (agendada, confirmada, en sala, atendida, cancelada), que es lo que
  el consultorio lleva meses leyendo en esta pantalla. Leyenda siempre visible
  al pie, y la leyenda dice eso mismo: fondo = estado, punto = sala.
- **Ojo con el tipo de cita.** En el sistema sólo existen tres
  (`consulta`, `cirugia`, `procedimiento`) y el tipo **no colorea nada**. Si
  alguien pide una leyenda "por tipo" con Control, Primera vez o Ultrasonido,
  esos tipos no existen: primero hay que crearlos en el backend. El tipo se
  lee como texto en la vista Lista y en las tarjetas del panel lateral.
- **Motivo extra** (`motivo_extra`). Control, Primera vez, Ultrasonido y
  compañía se anotan aquí: una nota **opcional** de texto libre para el
  doctor, con sugerencias de un clic y captura en MAYÚSCULAS. El consultorio
  lo pidió así, *"como opcional... una nota para el doc extra"*. **No es un
  tipo de cita**: no colorea, no filtra y no bloquea nunca el guardado. Se
  lee en la tarjeta del panel lateral, en la vista Lista y en el CSV.
- La jornada visible va de **07:00 a 20:00**. Si el consultorio agenda fuera de
  ese rango, hay que hacerlo configurable (pendiente).

---

## 7. Accesibilidad y teclado

Quien usa esto va con prisa y no siempre suelta el teclado.

- Listas de sugerencias navegables con **↑ ↓ y Enter**.
- Todo control pulsable debe serlo también con teclado, con `aria-label` cuando
  el texto no baste.
- `aria-pressed` en los conmutadores, `aria-expanded` en los plegables.
- Contraste suficiente: los `-light` son para fondos, **nunca para texto**.

---

## 8. Iconos: comprueba antes de usar

El repo usa `@coreui/icons` en una versión que **no trae `cilEye`** — costó una
compilación descubrirlo. Antes de importar un icono, confirma que existe:

```bash
grep -oE "cil[A-Za-z]+" node_modules/@coreui/icons/dist/esm/free/index.d.ts | sort -u | grep -i <lo-que-buscas>
```

Si el icono no existe y no hay equivalente claro, **usa texto**: para quien usa
el sistema a diario, "Mostrar / Ocultar" es más claro que un ojo tachado.

---

## 9. Antes de dar algo por terminado

- `npx tsc --noEmit`, `npm run build` y `npx vitest run` en verde.
- La lógica que se pueda extraer a **funciones puras** (cálculos de fechas,
  filtrados, agrupaciones) va a un módulo aparte **con pruebas**. No la dejes
  enterrada en el JSX.
- Comprueba que tus pruebas **fallan sin tu cambio**. Una prueba que pasa en
  ambos casos no prueba nada.
- `npm run lint` falla en todo el repo por formato previo (indentación 4 vs 2).
  **No reformatees el repo**: arregla solo lo tuyo.
- **Nada está verificado hasta verlo en un navegador.** Las pruebas no ven
  colores, ni desbordes, ni desplegables tapados.
- Si la pantalla afirma algo del estado de la agenda (libre, ocupado, sin
  huecos), tiene que haber una prueba que compruebe que el servidor **opina lo
  mismo**. La de referencia recorre todas las franjas de un día cargado y
  agenda en cada una: `backend/tests/test_disponibilidad.py`.

---

## 10. Pendientes de diseño

- Variantes de modo oscuro para los tokens `--hf-*`.
- Jornada de la agenda configurable (hoy fija 07:00–20:00).
- Un test intermitente en `PrenatalCarePanel.test.tsx`: falla ~1 de cada 5
  corridas. Sin cazar.
