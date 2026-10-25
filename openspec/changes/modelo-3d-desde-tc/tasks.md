# Tareas · modelo-3d-desde-tc

## 1. Preparación
- [x] 1.1 Rama `feat/modelo-3d-desde-tc` desde `origin/develop`, anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio; licencias verificadas

## 2. Servicio segmentador (`servicios/segmentador/`)
- [ ] 2.1 App FastAPI: `/health`, `POST /segmentar` (ZIP de DICOM o NIfTI)
- [ ] 2.2 Conversión con dcm2niix y segmentación con TotalSegmentator (tarea `total`, abierta)
- [ ] 2.3 Mallas: marching cubes, suavizado, simplificación, mm y LPS, GLB con etiquetas
- [ ] 2.4 Conducto vertebral derivado de las vértebras (relleno del agujero por corte)
- [ ] 2.5 Modo `SEGMENTADOR_FALSO=1` determinista
- [ ] 2.6 Dockerfile con versiones fijas y servicio en el perfil `ia`
- [ ] 2.7 Pruebas en modo falso: forma, unidades, etiquetas, errores

## 3. Backend
- [ ] 3.1 Modelo `ImagingModelo3D` y migración 0053 (con prueba de ida y vuelta)
- [ ] 3.2 Permiso `neuro3d.generar_modelo` y línea base
- [ ] 3.3 Cliente HTTP al segmentador con tiempo límite y errores en español
- [ ] 3.4 Trabajo en segundo plano; vencimiento de trabajos colgados
- [ ] 3.5 Endpoints con módulo, permisos, alcance clínico y bitácora
- [ ] 3.6 Módulo `neuro3d_paciente` disponible
- [ ] 3.7 Pruebas: estados, fallo con motivo, permisos, alcance, módulo apagado

## 4. Frontend
- [ ] 4.1 `dominio/origenModelo.ts` exacto de COORDINACION.md
- [ ] 4.2 Botón «Generar modelo 3D» en el visor con su estado
- [ ] 4.3 `SelectorOrigen` y aviso por origen en Neuro 3D
- [ ] 4.4 Capa del paciente (GLTFLoader) registrada con ids del catálogo
- [ ] 4.5 Marcar el modelo como revisado
- [ ] 4.6 Pruebas vitest: selector, avisos, capa con mallas simuladas, botón

## 5. Cierre
- [ ] 5.1 Recorrido guiado, DESIGN §4.14, CHANGELOG
- [ ] 5.2 Verificación: tsc, vitest, build, pytest, capturas
