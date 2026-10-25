# Atlas detallado de Neuro 3D (BodyParts3D)

## Por qué

El modelo esquemático de Neuro 3D lo dibuja Cortex en código: sirve para explicar
qué es una raíz L5, pero los giros, los huesos del cráneo y la forma de cada
vértebra son aproximaciones. Para enseñar anatomía con más detalle (dónde está el
giro precentral, cómo es una vértebra lumbar de verdad, el polígono de Willis
real) hace falta un modelo hecho a partir de una persona.

**BodyParts3D 4.0** (Database Center for Life Science, DBCLS) publica mallas de
un adulto real, identificadas por concepto FMA, bajo **CC BY 4.0**. Emilio aprobó
usar modelos CC0, CC BY y CC BY-SA con los créditos en un pie visible cuando se
muestra Neuro 3D.

## Qué cambia

- **Script reproducible** `scripts/atlas/preparar_atlas.py` (no se guardan
  modelos en git; `frontend/public/atlas/` en `.gitignore`):
  - descarga de la URL oficial el zip de mallas (IS-A, 136 MB) y la tabla de
    partes; verifica tamaño y SHA-256 guardados en el script;
  - elige las estructuras por **id FMA**: cráneo hueso por hueso, giros y
    lóbulos, ínsula, hipocampo, cíngulo, tálamo, cuerpo calloso, cerebelo,
    tronco, ventrículos, carótidas internas, vertebrales, basilar, ACA, MCA, PCA,
    comunicantes, nervios óptico y troclear, C1–L5, sacro y discos;
  - une, suaviza (Taubin), simplifica con presupuesto por estructura y escribe
    `cabeza.glb` y `columna.glb` (mm, LPS, ≈10 MB), `manifiesto.json` y
    `CREDITOS.json` con el texto de atribución exacto;
  - dependencias ligeras en un entorno aparte (trimesh, numpy, scipy,
    fast-simplification; todas MIT). Pruebas de sus funciones puras con pytest.
- **Catálogo**: cada pieza usa el mismo id que Neuro 3D (`vertebra-L5`,
  `disco-L4-L5`, `basilar`, `insula-izq`…). Lo que no existía se agrega con
  `soloAtlas` (giros, huesos del cráneo, tálamo, cuerpo calloso, nervios II y IV)
  y `parteDe` (giro → lóbulo, hueso → cráneo): elegir «Lóbulo frontal» enciende sus
  giros. El buscador sólo ofrece lo exclusivo del atlas con el atlas a la vista.
- **Capa «Atlas detallado»** (`servicios/anatomia/capaAtlas.ts`): una
  `CapaAnatomica` más, como la de la TC. Carga diferida con avance; la escena
  oculta (sin borrar) las piezas simplificadas que reemplaza y la quita al volver.
  Alineación documentada: la cabeza con escala uniforme limitada a la caja de los
  lóbulos simplificados; cada vértebra rígida y con su tamaño real al lugar de la
  simplificada (las raíces esquemáticas siguen saliendo donde deben).
- **Selector «Modelo: Simplificado | Atlas detallado»**, aparte del «Origen del
  modelo» (no toca el contrato `AVISO_ORIGEN`). Sólo con el origen esquemático; sin
  atlas instalado, deshabilitado con «El atlas detallado no está instalado en este
  servidor» y cómo instalarlo. Aviso propio: «persona de referencia, no este
  paciente».
- **Pie «Créditos»** en Neuro 3D, siempre visible y desplegable, armado con los
  `CREDITOS.json` de las fuentes activas más los fijos (three.js). La captura PNG
  con el atlas lleva su crédito.
- Recorrido guiado `neuro-3d` v4, DESIGN §4.18 y CHANGELOG.

## Datos, permisos e integraciones

- Sin tablas, migraciones ni permisos nuevos: el atlas es un archivo estático del
  frontend y se ve con `neuro3d.read`.
- Descarga externa sólo al preparar el servidor (el navegador no sale a internet).

## Fuera de alcance

- Raíces nerviosas, médula por segmentos, senos venosos, yugulares, el resto de
  los pares craneales, el disco T12-L1 y el cóccix: BodyParts3D no los trae (o sólo
  un tramo); los sigue dibujando el modelo simplificado.
- Materiales por tejido del modo Realista (tramo REAL): el manifiesto ya trae el
  `tejido`; se conecta al integrar.
- Instalar el atlas en el despliegue automático de producción.

## Riesgos

- **Licencia**: los OBJ de 2013 llevan en su encabezado CC BY-SA 2.1 JP; la página
  vigente de DBCLS (2025-02-27) declara CC BY 4.0 para toda la base. Se usa y se
  cita CC BY 4.0; incluso con BY-SA, la aprobación de Emilio lo cubre (los GLB
  derivados se distribuirían bajo la misma licencia).
- **Clínico**: es otra persona. Por eso no se ofrece con la TC ni con la
  radiografía del paciente, y el aviso lo dice siempre que está a la vista.
