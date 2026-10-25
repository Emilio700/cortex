# Tareas · neuro3d-atlas

## 1. Preparación
- [x] 1.1 Rama `feat/neuro3d-atlas` desde `develop` (8cc9d2f), anotada en COORDINACION.md
- [x] 1.2 Fuente y licencia verificadas (BodyParts3D 4.0, CC BY 4.0, texto exacto)
- [x] 1.3 Propuesta y tareas

## 2. Script `scripts/atlas/preparar_atlas.py`
- [x] 2.1 Descarga oficial con tamaño y SHA-256 verificados
- [x] 2.2 Selección por id FMA (primera entrada gana; reparto por lado por la x)
- [x] 2.3 Unión, Taubin, simplificación con presupuesto; GLB por región (mm, LPS)
- [x] 2.4 `manifiesto.json`, `CREDITOS.json` y mapeo esperado para el frontend
- [x] 2.5 `.gitignore` y README
- [x] 2.6 Pruebas con pytest de las funciones puras
- [x] 2.7 Corrida real: 132 estructuras, 10.2 MB

## 3. Frontend
- [x] 3.1 Catálogo: estructuras `soloAtlas` con `parteDe`; buscador con `incluirAtlas`
- [x] 3.2 `dominio/atlasDetallado.ts` (manifiesto, aviso, ubicación en el catálogo)
- [x] 3.3 `servicios/atlasDetallado.ts` (consulta y descarga con avance y caché)
- [x] 3.4 `servicios/anatomia/capaAtlas.ts` (GLB → piezas alineadas)
- [x] 3.5 Escena: `fijarCapaAtlas`, piezas tapadas, `parteDe` al resaltar e indexar, hernias
- [x] 3.6 `SelectorDetalle` y su lugar en la página; atlas sólo con el esquemático
- [x] 3.7 `PieCreditos` y `dominio/creditos.ts`; crédito en la captura
- [x] 3.8 Pruebas: mapeo, capa con GLB simulado, opción deshabilitada, créditos, página

## 4. Cierre
- [x] 4.1 Recorrido `neuro-3d` v4 (pasos «Modelo» y «Créditos»)
- [x] 4.2 DESIGN §4.18 y CHANGELOG
- [x] 4.3 tsc, vitest, build y pytest del script
- [x] 4.4 Revisión visual (Vite 3019 + Playwright)
- [ ] 4.5 Al integrar con REAL: pasar `tejido` a la pieza (ver COORDINACION.md)
- [ ] 4.6 Instalar el atlas en el despliegue de producción
