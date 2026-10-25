# Neuro 3D realista

## Por qué

Neuro 3D se diseñó para explicar: colores por lóbulo, hueso plano y vasos
brillantes. Al médico le sirve, pero pide que el modelo **se vea real** cuando lo
enseña en consulta: hueso con su textura, encéfalo húmedo con surcos que se lean,
arterias y venas como en un atlas de anatomía. Hoy además falta todo el sistema
venoso: la pregunta «¿dónde está el seno sagital?» no tiene respuesta en pantalla.

Esto se logra con lo que ya trae three r186 (WebGL), sin descargar mallas ni
texturas y sin paquetes nuevos.

## Qué cambia

- **Interruptor de calidad «Estándar | Realista»** en la barra de la escena.
  - Se recuerda por usuario en `localStorage` (preferencia de pantalla, no dato
    clínico; si el navegador no deja guardar, sólo no se recuerda).
  - Sin preferencia guardada, arranca en Realista sólo si el equipo lo aguanta:
    WebGL2, `MAX_TEXTURE_SIZE` ≥ 4096, sin «reducir movimiento» y no en un
    teléfono. Sin WebGL2 la opción Realista queda deshabilitada y dice por qué.
  - Si con Realista los cuadros por segundo caen de forma sostenida, la escena
    baja sola a Estándar y lo dice. Si después el médico vuelve a elegir
    Realista, se respeta (no se vuelve a bajar en esa sesión).
  - Cambiar de calidad rehace la escena (la geometría cambia) conservando la
    cámara, las capas, el corte, la selección, las marcas y la capa del paciente.
- **Materiales por tejido** (`servicios/materiales/`): `MeshPhysicalMaterial`
  para hueso (marfil, poroso), corteza (rosado grisáceo, húmeda, surcos más
  oscuros), sustancia blanca, arterias, venas y senos, nervios (sheen), discos
  (azulados translúcidos), líquido y lesión. Texturas generadas en código
  (`DataTexture` con ruido periódico): relieve y rugosidad del poro del hueso
  cortical y del tejido blando, proyectadas en triplanar porque las mallas del
  paciente (TC) no traen UV. Colores como tokens `--cx-anat-real-*`.
- **Luz y posproceso, sólo en Realista:** entorno `RoomEnvironment` con PMREM más
  presente, tone mapping AgX, luz de estudio; `EffectComposer` con GTAO a media
  resolución (sólo con lo opaco: la piel translúcida no ensombrece), SMAA y
  `OutputPass`. Al girar o mover la cámara se apaga el GTAO; al soltar vuelve.
- **Más detalle geométrico en Realista** (procedural): circunvoluciones más finas
  y más resolución del encéfalo; vértebras con carillas articulares, agujeros
  transversos en las cervicales y láminas y apófisis más definidas. Respeta el eje
  (`ejeColumna.ts`) y el ajuste de radiografía.
- **Sistema venoso nuevo**, capa «Venas y senos» (`venas`) en ambos modos: senos
  sagital superior e inferior, recto, confluencia, transversos, sigmoides, vena
  cerebral magna, yugulares internas y venas cerebrales superiores (puenteantes).
  Cada una con su id en el catálogo, ficha y búsqueda. Trayectos aproximados,
  marcados «(verificar)» donde no hay certeza.
- **Compatibilidad:** las mallas del paciente (TC) toman el material de su tejido
  por id; la radiografía sólo dobla el eje y hereda todo. «Reducir movimiento»
  sigue apagando animaciones; al salir se liberan composer, pases, texturas y
  materiales.
- Recorrido `neuro-3d` (paso de calidad, capa de venas), DESIGN §4.17, CHANGELOG.

## API para capas futuras (ATLAS)

Una capa con mallas detalladas (`CapaAnatomica`) no elige materiales: entrega
piezas con `acabado`, `capa` y, si quiere, `tejido` (`PiezaAnatomica.tejido`).
La escena resuelve el tejido con `tejidoDePieza()` y pide el material a la
biblioteca (`crearBibliotecaDeTejidos`), que comparte las texturas y crea un
material por pieza (el resaltado cambia el emisivo de cada una).

## Fuera de alcance

- Mallas descargadas (tramo ATLAS) y render volumétrico (tramo VOL).
- WebGPU, sombras proyectadas, transmisión física y subsurface scattering.
- Senos cavernosos, petrosos y occipital; venas profundas además de la magna.

## Riesgos

- **Rendimiento:** el GTAO y la geometría fina pesan en equipos sin tarjeta
  gráfica. Mitigación: detección al arrancar, caída automática medida y GTAO
  apagado mientras se mueve la cámara. Una vista quieta se pinta una sola vez.
- **Clínico:** un modelo más realista puede leerse como la anatomía del paciente.
  El aviso del origen no cambia con la calidad: sigue diciendo «esquemático» o
  «aproximación» según corresponda. Las venas son trayectos típicos (verificar).
