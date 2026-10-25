# Tareas · render-volumetrico

## 1. Preparación
- [x] 1.1 Rama `feat/render-volumetrico` desde `develop` (ceb2f7c), anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio

## 2. Dominio (puro, con pruebas)
- [ ] 2.1 Elegibilidad de la serie: TC/RM, cortes suficientes, paralelos, mismo tamaño, espaciado uniforme; motivo en español si no
- [ ] 2.2 Preajustes en español mapeados a `CONSTANTS.VIEWPORT_PRESETS`, filtrados por modalidad
- [ ] 2.3 Curva de opacidad con umbral y opacidad, idéntica a la de Cornerstone en cero
- [ ] 2.4 Planos de recorte axial, sagital y coronal (LPS) con lado invertible
- [ ] 2.5 Estimación de memoria y decimado de cortes

## 3. Servicio (`servicios/volumen3d.ts`)
- [ ] 3.1 Descarga de los cortes con la sesión y progreso; volumen en streaming y progreso del armado
- [ ] 3.2 Viewport `VOLUME_3D`, preajuste, umbral/opacidad, recorte, herramientas (rotar, mover, acercar)
- [ ] 3.3 Iluminación cinematográfica y calidad baja mientras se gira
- [ ] 3.4 Fallas honestas: texturas *float*, memoria, cortes sin decodificar, pérdida de contexto
- [ ] 3.5 Liberar volumen, archivos, motor y grupo al salir

## 4. Pantallas
- [ ] 4.1 Ruta `/pacientes/:patientId/estudios/:studyId/3d/:serieId` y página «3D del estudio» con aviso fijo
- [ ] 4.2 «Ver en 3D» en el visor, deshabilitado con motivo
- [ ] 4.3 Captura PNG sin datos del paciente
- [ ] 4.4 «Ver el estudio en 3D» en Neuro 3D (cambio mínimo)

## 5. Cierre
- [ ] 5.1 Recorrido guiado (`recorridos/imagen3d.ts`) con anclas válidas
- [ ] 5.2 DESIGN.md §4.16 y CHANGELOG `[Sin publicar]`
- [ ] 5.3 `tsc`, vitest completo, build
- [ ] 5.4 Revisión visual con el estudio demo (preajustes y recorte)
