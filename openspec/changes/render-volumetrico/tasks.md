# Tareas · render-volumetrico

## 1. Preparación
- [x] 1.1 Rama `feat/render-volumetrico` desde `develop` (ceb2f7c), anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio

## 2. Dominio (puro, con pruebas)
- [x] 2.1 Elegibilidad de la serie: TC/RM, cortes suficientes, paralelos, mismo tamaño, espaciado uniforme; motivo en español si no
- [x] 2.2 Preajustes en español mapeados a `CONSTANTS.VIEWPORT_PRESETS`, filtrados por modalidad
- [x] 2.3 Curva de opacidad con umbral y opacidad, idéntica a la de Cornerstone en cero
- [x] 2.4 Planos de recorte axial, sagital y coronal (LPS) con lado invertible
- [x] 2.5 Estimación de memoria y decimado de cortes

## 3. Servicio (`servicios/volumen3d.ts`)
- [x] 3.1 Descarga de los cortes con la sesión y progreso; volumen en streaming y progreso del armado
- [x] 3.2 Viewport `VOLUME_3D`, preajuste, umbral/opacidad, recorte, herramientas (rotar, mover, acercar)
- [x] 3.3 Iluminación cinematográfica y calidad baja mientras se gira
- [x] 3.4 Fallas honestas: texturas *float*, memoria, cortes sin decodificar, pérdida de contexto
- [x] 3.5 Liberar volumen, archivos, motor y grupo al salir

## 4. Pantallas
- [x] 4.1 Ruta `/pacientes/:patientId/estudios/:studyId/3d/:serieId` y página «3D del estudio» con aviso fijo
- [x] 4.2 «Ver en 3D» en el visor, deshabilitado con motivo
- [x] 4.3 Captura PNG sin datos del paciente
- [x] 4.4 «Ver el estudio en 3D» en Neuro 3D (cambio mínimo)

## 5. Cierre
- [x] 5.1 Recorrido guiado (`recorridos/imagen3d.ts`) con anclas válidas
- [x] 5.2 DESIGN.md §4.16 y CHANGELOG `[Sin publicar]`
- [x] 5.3 `tsc`, vitest completo, build
- [x] 5.4 Revisión visual con el estudio demo (preajustes y recorte)

## Pendiente (fuera de este cambio)
- Remuestreo en el plano (p. ej. a ~256³) para TC muy grandes: el cargador `wadouri:` no entiende `#decimation`; hoy sólo se decima entre cortes.
- La iluminación cinematográfica se verificó con swiftshader (CPU, ~22 s por cuadro); falta medirla en una GPU real del consultorio.
- Probar con una angio-TC real anonimizada (la revisión visual usó una TC sintética).
