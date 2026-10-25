# Tareas · atlas-neuro-3d

## 1. Preparación
- [x] 1.1 Rama `feat/atlas-neuro-3d` desde `origin/develop`, anotada en COORDINACION.md
- [x] 1.2 `three` 0.186.1 y `@types/three` 0.186.0 con versión exacta
- [x] 1.3 Propuesta y tareas de este cambio

## 2. Permiso
- [x] 2.1 `neuro3d.read` en `ALL_PERMISSIONS` y por omisión en médico y administración
- [x] 2.2 Línea base de permisos actualizada (delta deliberado) y prueba propia
- [x] 2.3 `MODULE_HIERARCHY`: «Imagen y señales» → «Neuro 3D»

## 3. Dominio (puro, con pruebas)
- [x] 3.1 Catálogo anatómico con color por token `--cx-anat-*`
- [x] 3.2 Niveles C1–sacro, discos, raíces y agujeros de salida
- [x] 3.3 Segmentos medulares frente a las vértebras (aproximación, `(verificar)`)
- [x] 3.4 Efecto de una hernia por nivel y posición
- [x] 3.5 Dermatomas: puntos clave de ASIA y contornos esquemáticos `(verificar)`
- [x] 3.6 Conexión de una raíz, de un segmento y de un disco
- [x] 3.7 Capas y pelado; vistas con su tecla; marcas del modo explicar

## 4. Escena
- [x] 4.1 Escena aislada de React con montaje y liberación completos
- [x] 4.2 Encéfalo procedural: lóbulos tocables, ínsula, cerebelo, tronco
- [x] 4.3 Ventrículos y polígono de Willis
- [x] 4.4 Columna C1–sacro, discos, médula por segmentos, cono, cola de caballo y raíces
- [x] 4.5 Columna despiezada (morph targets en médula y raíces)
- [x] 4.6 Cortes sagital, axial y coronal; pelado; flujo opcional; vías esquemáticas
- [x] 4.7 Resaltado con halo, rótulos y encuadre de lo elegido
- [x] 4.8 «Reducir movimiento» apaga giro, transiciones, latido y flujo
- [x] 4.9 Interfaz `CapaAnatomica` para el modelo del paciente

## 5. Pantalla e integración
- [x] 5.1 `AtlasNeuroPage` con aviso fijo, mensaje sin WebGL, teclado y 390 px
- [x] 5.2 Modo «Explicar al paciente» con silueta de dermatomas
- [x] 5.3 Captura PNG sin nombre del paciente
- [x] 5.4 Guardar en el expediente sólo con confirmación del servidor
- [x] 5.5 Menú «Imagen y señales», rutas por permiso y botón en la pestaña Imágenes
- [x] 5.6 `vendor-three` en `vite.config.mts`
- [x] 5.7 Recorrido guiado y anclas válidas
- [x] 5.8 DESIGN §4.13 y CHANGELOG

## 6. Pendiente (fase «modelo del paciente»)
- [ ] 6.1 Capa glTF que cargue las mallas del segmentador con `CapaAnatomica`
- [ ] 6.2 Registro de la malla del paciente contra el atlas (escala y orientación)
- [ ] 6.3 Hoja PDF del atlas cuando exista una utilidad de PDF en el navegador
- [ ] 6.4 Revisión clínica de los contornos de dermatomas y de la tabla de segmentos
