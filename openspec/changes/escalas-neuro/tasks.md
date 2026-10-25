# Tareas · escalas-neuro

## 1. Especificación
- [x] 1.1 Propuesta y tareas de este cambio
- [x] 1.2 Anotar en `COORDINACION.md` permisos, migración y archivos compartidos

## 2. Dominio (frontend)
- [ ] 2.1 Motor declarativo en `modules/escalas/dominio/motor.ts` (suma, porcentaje, grado, «no valorable»)
- [ ] 2.2 Catálogo de 14 escalas con fuente y marcas «(verificar)»
- [ ] 2.3 Pruebas vitest de cada escala contra ejemplos publicados
- [ ] 2.4 Casos de paridad compartidos (`paridad.json`) con la estructura de cada escala

## 3. Backend
- [ ] 3.1 Modelo `EscalaAplicada` y migración `2026_10_26_0052` con prueba de ida y vuelta
- [ ] 3.2 `services/escalas.py`: el mismo cálculo en Python
- [ ] 3.3 Router `/patients/{id}/escalas`: listar, crear, anular con motivo
- [ ] 3.4 Permisos `clinical_scales.read` y `clinical_scales.write`, sección `escalas` en la bitácora de accesos
- [ ] 3.5 Etiquetas en español en `errores_validacion.ETIQUETAS`
- [ ] 3.6 Pruebas: recálculo, error en español, permisos y alcance, anulación lógica, paridad

## 4. Frontend
- [ ] 4.1 `modules/escalas/{servicios,componentes,ui}` e `index.ts`
- [ ] 4.2 Sección «Escalas neurológicas» en la consulta, junto a «Plan clínico»
- [ ] 4.3 Pestaña «Escalas» del expediente con gráfica de evolución
- [ ] 4.4 Recorridos guiados de la consulta y del expediente (sube `version`)
- [ ] 4.5 Permisos en `MODULE_HIERARCHY`

## 5. Cierre
- [ ] 5.1 `docs/DESIGN.md`
- [ ] 5.2 Línea en `CHANGELOG.md`
- [ ] 5.3 `npx tsc --noEmit`, `npm test` y `pytest` en verde
