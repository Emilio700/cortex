# Tareas · modelo-3d-desde-tc

## 1. Preparación
- [x] 1.1 Rama `feat/modelo-3d-desde-tc` desde `origin/develop`, anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio; licencias verificadas

## 2. Servicio segmentador (`servicios/segmentador/`)
- [x] 2.1 App FastAPI: `/health`, `POST /segmentar` (ZIP de DICOM o NIfTI)
- [x] 2.2 Conversión con dcm2niix y segmentación con TotalSegmentator (tarea `total`, abierta)
- [x] 2.3 Mallas: marching cubes, suavizado, simplificación, mm y LPS, GLB con etiquetas
- [x] 2.4 Conducto vertebral derivado de las vértebras (relleno del agujero por corte)
- [x] 2.5 Modo `SEGMENTADOR_FALSO=1` determinista
- [x] 2.6 Dockerfile con versiones fijas y servicio en el perfil `ia`
- [x] 2.7 Pruebas en modo falso: forma, unidades, etiquetas, errores

## 3. Backend
- [x] 3.1 Modelo `ImagingModelo3D` y migración 0053 (con prueba de ida y vuelta)
- [x] 3.2 Permiso `neuro3d.generar_modelo` y línea base
- [x] 3.3 Cliente HTTP al segmentador con tiempo límite y errores en español
- [x] 3.4 Trabajo en segundo plano; vencimiento de trabajos colgados
- [x] 3.5 Endpoints con módulo, permisos, alcance clínico y bitácora
- [x] 3.6 Módulo `neuro3d_paciente` disponible
- [x] 3.7 Pruebas: estados, fallo con motivo, permisos, alcance, módulo apagado

## 4. Frontend
- [x] 4.1 `dominio/origenModelo.ts` exacto de COORDINACION.md
- [x] 4.2 Botón «Generar modelo 3D» en el visor con su estado
- [x] 4.3 `SelectorOrigen` y aviso por origen en Neuro 3D
- [x] 4.4 Capa del paciente (GLTFLoader) registrada con ids del catálogo
- [x] 4.5 Marcar el modelo como revisado
- [x] 4.6 Pruebas vitest: selector, avisos, capa con mallas simuladas, botón

## 5. Cierre
- [x] 5.1 Recorrido guiado, DESIGN §4.14, CHANGELOG
- [x] 5.2 Verificación: tsc, vitest, build, pytest, capturas

## Notas
- 2.2: el modo real (torch + TotalSegmentator) **no se probó** en la máquina de
  desarrollo (sin espacio en disco para torch). Sí se probó dcm2niix real sobre el
  estudio demo y el mallado sobre su volumen.
