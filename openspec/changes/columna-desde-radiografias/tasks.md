# Tareas · columna-desde-radiografias

## 1. Preparación
- [x] 1.1 Rama `feat/columna-desde-radiografias` desde `origin/develop`, anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio

## 2. Dominio (puro, con pruebas)
- [ ] 2.1 Modelo de puntos: esquinas por vértebra (lateral), platillos (AP), caderas y S1
- [ ] 2.2 Cobb sagital: lordosis L1–S1 y cifosis T4–T12
- [ ] 2.3 Cobb coronal con vértebras límite automáticas y cambiables
- [ ] 2.4 Listesis en % con grado de Meyerding
- [ ] 2.5 Índice de altura discal relativo al cuerpo de arriba
- [ ] 2.6 PI, PT y SS (PI = PT + SS)
- [ ] 2.7 Calibración: ninguna, DICOM o distancia conocida; mm solo con escala
- [ ] 2.8 Conversión a `AjusteDelEje`
- [ ] 2.9 `paridadRx.json` con su generador
- [ ] 2.10 `origenModelo.ts` copiado exacto de COORDINACION.md

## 3. Eje deformado
- [ ] 3.1 `ejeColumna.ts`: perfil sagital del paciente, perfil coronal y listesis
- [ ] 3.2 `columna3d.ts`: marco con lateral general y alturas de disco ajustadas
- [ ] 3.3 Pruebas: continuo, idéntico sin datos, escoliosis y listesis en su sentido

## 4. Backend
- [ ] 4.1 Modelo `ColumnaAjusteRx` y migración `2026_10_27_0054`
- [ ] 4.2 `services/columna_rx.py` con las mismas fórmulas y prueba de paridad
- [ ] 4.3 Router: listar, guardar, anular; permisos, alcance y bitácora
- [ ] 4.4 Etiquetas en `errores_validacion.py`
- [ ] 4.5 Pruebas: permisos, alcance, anulación, migración

## 5. Herramienta de marcado
- [ ] 5.1 Carga de foto (imagen clínica) o DICOM CR/DX
- [ ] 5.2 Lupa, punto que toca, deshacer, saltar, arrastrar
- [ ] 5.3 Mediciones en vivo como sugerencia; calibración visible
- [ ] 5.4 Guardar y «Ver en Neuro 3D»; 390 px y touch

## 6. Neuro 3D
- [ ] 6.1 Origen «radiografía»: columna deformada y aviso del origen
- [ ] 6.2 Mediciones junto al modelo
- [ ] 6.3 Entrada temporal del origen (se reemplaza por `SelectorOrigen` de TC)

## 7. Cierre
- [ ] 7.1 Recorrido guiado y `anclas.test.ts`
- [ ] 7.2 DESIGN §4.15 y CHANGELOG
- [ ] 7.3 tsc, vitest, build y pytest
- [ ] 7.4 Revisión visual con Playwright (390 px y escritorio)
