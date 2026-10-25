# Tareas · columna-desde-radiografias

## 1. Preparación
- [x] 1.1 Rama `feat/columna-desde-radiografias` desde `origin/develop`, anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio

## 2. Dominio (puro, con pruebas)
- [x] 2.1 Modelo de puntos: esquinas por vértebra (lateral), platillos (AP), caderas y S1
- [x] 2.2 Cobb sagital: lordosis L1–S1 y cifosis T4–T12
- [x] 2.3 Cobb coronal con vértebras límite automáticas y cambiables
- [x] 2.4 Listesis en % con grado de Meyerding
- [x] 2.5 Índice de altura discal relativo al cuerpo de arriba
- [x] 2.6 PI, PT y SS (PI = PT + SS)
- [x] 2.7 Calibración: ninguna, DICOM o distancia conocida; mm solo con escala
- [x] 2.8 Conversión a `AjusteDelEje`
- [x] 2.9 `paridadRx.json` con su generador
- [x] 2.10 `origenModelo.ts` copiado exacto de COORDINACION.md

## 3. Eje deformado
- [x] 3.1 `ejeColumna.ts`: perfil sagital del paciente, perfil coronal y listesis
- [x] 3.2 `columna3d.ts`: marco con lateral general y alturas de disco ajustadas
- [x] 3.3 Pruebas: continuo, idéntico sin datos, escoliosis y listesis en su sentido

## 4. Backend
- [x] 4.1 Modelo `ColumnaAjusteRx` y migración `2026_10_27_0054`
- [x] 4.2 `services/columna_rx.py` con las mismas fórmulas y prueba de paridad
- [x] 4.3 Router: listar, guardar, anular; permisos, alcance y bitácora
- [x] 4.4 Etiquetas en `errores_validacion.py`
- [x] 4.5 Pruebas: permisos, alcance, anulación, migración

## 5. Herramienta de marcado
- [x] 5.1 Carga de foto (imagen clínica) o DICOM CR/DX
- [x] 5.2 Lupa, punto que toca, deshacer, saltar, arrastrar
- [x] 5.3 Mediciones en vivo como sugerencia; calibración visible
- [x] 5.4 Guardar y «Ver en Neuro 3D»; 390 px y touch

## 6. Neuro 3D
- [x] 6.1 Origen «radiografía»: columna deformada y aviso del origen
- [x] 6.2 Mediciones junto al modelo
- [x] 6.3 Entrada temporal del origen (se reemplaza por `SelectorOrigen` de TC al integrar)

## 7. Cierre
- [x] 7.1 Recorrido guiado y `anclas.test.ts`
- [x] 7.2 DESIGN §4.15 y CHANGELOG
- [x] 7.3 tsc, vitest, build y pytest
- [ ] 7.4 Revisión visual con Playwright (390 px y escritorio)
