# Tareas · orientar-a-neurocirugia

Marca cada una al terminarla, en su rama. Rama sugerida entre paréntesis.

## Fase 0 · Pendiente de antes: triage encimado y encabezado (`fix/modales-apilados`)
Ya hecho y visto en el navegador (commit wip `1368b73`); falta cerrarlo.
- [x] 0.1 Ventanas apiladas: cada nivel sube su fondo y su ventana (el triage sobre «Editar Cita»)
- [x] 0.2 Prueba guardia `frontend/src/scss/modalesApilados.test.ts`
- [x] 0.3 Encabezado: buscador de 560 px, más margen lateral y separación entre elementos
- [x] 0.4 Suite completa en verde (2110 pruebas, `--maxWorkers=3`) y línea en CHANGELOG
- [ ] 0.5 Revisar a 390 px (celular) que el encabezado no se rompa
- [ ] 0.6 Revisar otras ventanas apiladas (alta de paciente sobre la cita, modal de compartir)
- [ ] 0.7 Recorridos guiados de la agenda y el encabezado: revisar y subir `version` si cambian

## Fase 1 · Identidad y receta (`feat/receta-azul-ejecutivo`)
- [ ] 1.1 Elegir el azul ejecutivo de fábrica (marino/azul de `--cx-*`) y derivar línea y campo
- [ ] 1.2 Cambiar acento, línea y campo en `backend/app/utils/colores.py`, `ajustesReceta.ts` y `tonos()` a la vez
- [ ] 1.3 Cerebro de Cortex sobre blanco como asset del backend (a partir de `docs/marca/logo-cortex.jpeg`; ajustar `frontend/scripts/generar-marca-cortex.py` o un script nuevo)
- [ ] 1.4 Logo por defecto en `pdf.py` (receta, órdenes, certificados) en lugar de «G & G GINECÓLOGOS»
- [ ] 1.5 Quitar pie «G.E.M.S…», docstring «G&G», leyenda de fábrica ginecológica
- [ ] 1.6 Ejemplo de la vista previa con paciente y medicamentos neuro
- [ ] 1.7 Certificados con la misma paleta y membrete
- [ ] 1.8 Actualizar `test_receta_configurable.py`, `test_orden_configurable.py`, `ajustesReceta.test.ts`
- [ ] 1.9 Abrir la receta, la orden y el certificado en PDF y verlos
- [ ] 1.10 CHANGELOG y DESIGN.md (receta)

## Fase 2 · Textos de marca (`chore/marca-sin-gems`)
- [ ] 2.1 `main.py:97`, `email_templates.py:54`, `core/config.py` (`gems.local`), `.env.prod.example`
- [ ] 2.2 `frontend/public/sw.js`, claves `gems-*` (migrar sin perder preferencias), `Login.tsx`
- [ ] 2.3 Revisar recorridos; subir `version` si cambian

## Fase 3 · Medicamentos (`feat/vademecum-neuro`)
- [ ] 3.1 Lista de medicamentos que el médico receta (pregunta 1) o propuesta inicial por grupos
- [ ] 3.2 `vademecario.json` nuevo, limpio y en español, con fuente; «(verificar)» donde falte
- [ ] 3.3 Ampliar `DRUG_NAME_ES_EN` y corregir la búsqueda (espacio vs `_`)
- [ ] 3.4 Cambiar los términos de sincronización diaria de openFDA a los neuro
- [ ] 3.5 Traducir al español las secciones de openFDA que se muestran, rotuladas como traducción automática
- [ ] 3.6 Montar `MedicationSearch` en `PrescriptionForm` («buscar fuera de mis frecuentes»); llenar con sugerencia editable
- [ ] 3.7 Guardar `generic_name` en el item de la receta (schema, tipos, PDF si aplica)
- [ ] 3.8 Alerta simple de anticoagulante/AINE contra la ficha (reglas publicadas, «(verificar)»)
- [ ] 3.9 Reescribir `test_vademecario.py` y `receta.vademecario.test.ts`; prueba de búsqueda en español
- [ ] 3.10 Verlo en el navegador: buscar «levetiracetam», «Keppra», «antiepiléptico»

## Fase 4 · Estudios, consentimientos, certificados (`feat/catalogos-neuro`)
- [ ] 4.1 Catálogo: quitar destacados gineco; agregar estudios neuro faltantes
- [ ] 4.2 Ajustar `test_catalogo_estudios.py` y `SelectorEstudio.tsx`
- [ ] 4.3 Plantillas de orden neuro faltantes (9)
- [ ] 4.4 Consentimientos neuro nuevos; quitar `requires_pregnancy_test` y FUM/FPP del flujo nuevo
- [ ] 4.5 Tipos de certificado neuro y migración de enums
- [ ] 4.6 Revisión médica de los textos nuevos (quién firma: pregunta 4)

## Fase 5 · Ficha, triage, nota (`feat/ficha-neuro`)
- [ ] 5.1 Quitar «HISTORIA G-O» de `PatientHistory.tsx`; limpiar estado muerto de `PacienteForm.tsx`
- [ ] 5.2 Migración y campos estructurados de ficha
- [ ] 5.3 Triage ampliado
- [ ] 5.4 Nota: placeholders neuro, examen neurológico, lateralidad y nivel, plan quirúrgico
- [ ] 5.5 Diagnóstico codificado con búsqueda en español (pregunta 3)
- [ ] 5.6 Escalas: ECOG, Engel, Hoehn-Yahr, ICH, GOS/GOSE, Frankel, Nurick, MoCA, SINS (paridad pantalla–servidor)
- [ ] 5.7 «Estado neurológico vigente» en la cabecera del expediente
- [ ] 5.8 Migración que crea «Neurocirugía» y la deja por defecto

## Fase 6 · Retirar embarazo y prenatal (`refactor/ocultar-embarazo`)
- [ ] 6.1 Flag de módulo; ocultar insignia, pestaña, encabezado, SDG de agenda, resumen, consentimientos, `pregnancyContext`
- [ ] 6.2 Permisos `prenatal.*` y router detrás del flag
- [ ] 6.3 Ajustar las ~40 pruebas, sin tocar migraciones ni datos
- [ ] 6.4 Recorridos guiados de consulta y expediente

## Cierre de cada fase
- [ ] `scripts/verificar_todo.ps1` en verde (frontend con `--maxWorkers=4`)
- [ ] Visto en el navegador
- [ ] Recorridos guiados revisados
- [ ] Línea en CHANGELOG
