# Render volumétrico del estudio

## Por qué

El médico quiere ver la TC, la angio-TC o la RM del paciente «tal cual» en 3D:
el hueso con todo su detalle y los vasos con contraste. El modelo desde TC
(§4.14) entrega mallas segmentadas, que pierden detalle y tardan minutos; Neuro
3D es esquemático. Falta lo más directo: **el estudio mismo pintado en volumen**
en la tarjeta gráfica, sin IA ni servidor de por medio. Cornerstone 5 (ya en el
proyecto) trae el viewport `VOLUME_3D`, el cargador de volúmenes en streaming y
los preajustes de render de 3D Slicer.

## Qué cambia

- **Pantalla nueva «3D del estudio»** en `modules/imagen/`, ruta
  `/pacientes/:patientId/estudios/:studyId/3d/:serieId` (permiso
  `clinical_images.read`, mismos roles que el visor). La serie va en la ruta y no
  en `?…`: las pestañas recortan la consulta.
  - Arma el volumen con `volumeLoader.createAndCacheVolume` y el cargador
    `cornerstoneStreamingImageVolume`, con los mismos `wadouri:` del manifiesto y
    el token que ya pone `servicios/cornerstone.ts`.
  - Preajustes en español mapeados a los de Cornerstone: Hueso (`CT-Bone`),
    Hueso (contorno fino) (`CT-Bones`), Angio-TC (`CT-AAA`), Piel
    (`CT-Soft-Tissue`, que vuelve opaco todo lo que pasa de −160 UH), Tejidos
    blandos (`CT-Muscle`), RM: encéfalo (`MR-T2-Brain`), RM: angio (`MR-Angio`),
    RM: general (`MR-Default`). Sólo se ofrecen los de la modalidad de la serie.
  - Interruptor «Iluminación cinematográfica» (oclusión ambiental local y
    dispersión de vtk.js, receta inspirada en VolView de Kitware). Mientras se
    gira, la calidad baja (menos muestras, sin LAO) y vuelve al soltar.
  - Control de **umbral** (desplaza la curva de opacidad en unidades del estudio)
    y de **opacidad** (la escala).
  - Rotar, acercar y mover con el ratón o el dedo; **planos de recorte** axial,
    sagital y coronal con deslizador; restablecer; captura PNG sin datos del
    paciente.
  - Barra de progreso (descarga de cortes y armado del volumen). Si la GPU no
    soporta texturas *float*, se agota la memoria o falla un corte: mensaje claro,
    con la opción «Reducir resolución» (un corte de cada dos), nunca una pantalla
    en blanco. Al salir se libera el volumen de la caché y los archivos leídos.
  - Aviso fijo: «Render del estudio original: lo que ves depende del preajuste y
    del umbral; para medir y decidir, usa los cortes». **No hay mediciones.**
- **Visor (§4.9):** botón «Ver en 3D» en el encabezado. Sólo se habilita en series
  volumétricas (TC o RM, con cortes suficientes, paralelos y de espaciado
  uniforme); si no, queda deshabilitado y dice por qué.
- **Neuro 3D:** con paciente en contexto, enlace «Ver el estudio en 3D» si tiene
  una TC o RM con serie candidata. Cambio mínimo: un componente del módulo de
  imagen que la página de Neuro 3D pinta en sus acciones.
- Recorrido guiado propio (`recorridos/imagen3d.ts`) y DESIGN §4.16.

## Qué no cambia

- Backend: nada. Los cortes ya se sirven por serie con la sesión.
- El visor 2D, sus mediciones y su captura siguen igual.
- No se agregan dependencias: `@cornerstonejs/core` 5.13 ya trae todo.

## Riesgos

- **Memoria:** una TC de 512×512×600 en *float32* ocupa ~600 MB. Se estima antes
  de cargar y, por encima de un límite, se propone reducir la resolución.
- **Equipos sin texturas *float*** (algunas GPU integradas): se comprueba
  `canRenderFloatTextures()` y se dice; Cornerstone puede caer a texturas de
  16 bits, así que no se bloquea, se avisa.
- Lo que se ve depende del preajuste: el aviso lo dice siempre y la vista no
  ofrece medir.
