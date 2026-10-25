# Columna desde radiografías

## Por qué

Muchos pacientes llegan a la consulta de columna solo con radiografías: una AP y
una lateral, a veces en DICOM y muchas veces como **foto de la placa** tomada con
el teléfono. Neuro 3D enseña una columna esquemática con curvas «de libro», que
no son las del paciente. Con unos puntos marcados por el médico sobre esas
radiografías se pueden medir la lordosis, la cifosis, la escoliosis, la listesis
y la altura de los discos, y doblar la columna del modelo a esas medidas para
explicarle al paciente **su** curva y **su** nivel afectado.

Se presenta siempre como **«Aproximación desde radiografía»**. No es una
reconstrucción: la forma de cada vértebra sigue siendo la del modelo.

## Qué se puede inferir de una radiografía y qué no

| Se puede medir (con los puntos del médico) | No se puede inferir |
|---|---|
| Inclinación de cada platillo en la lateral y en la AP | La forma real de cada vértebra (osteofitos, acuñamientos finos, pedículos) |
| Lordosis lumbar L1–S1 y cifosis torácica T4–T12 (Cobb sagital) | La rotación axial de las vértebras (una AP la sugiere, no la mide) |
| Cobb coronal de la curva mayor y sus vértebras límite | El estado del disco por dentro, la médula, las raíces o el canal |
| Listesis en % del platillo de abajo (Meyerding) | Milímetros reales en una foto sin referencia |
| Altura del disco relativa al cuerpo vecino | Profundidad: la AP y la lateral no se registran entre sí |
| Incidencia pélvica, inclinación pélvica y pendiente sacra | Si la placa se tomó de pie o acostado (lo dice el médico) |

## Qué cambia

- **Dominio puro con pruebas** en `frontend/src/modules/neuro3d/dominio/`:
  - `ajusteRadiografico.ts`: modelo de puntos (4 esquinas del cuerpo por
    vértebra en la lateral; platillos en la AP; centros de las cabezas femorales y
    platillo de S1), cálculos y calibración. Cada fórmula con su fuente.
  - `marcadoRadiografia.ts`: el orden de los puntos, saltar, deshacer y
    corregir; qué falta para cada medición.
  - `origenModelo.ts`: el contrato común con el tramo TC, copiado exacto.
- **Eje deformado.** `servicios/anatomia/ejeColumna.ts` acepta un
  `AjusteDelEje` opcional: inclinaciones sagitales del paciente por platillo,
  inclinaciones coronales (hoy solo había sagital), listesis por nivel y
  factores de altura de disco. Donde no hay datos manda el perfil esquemático; sin
  ajuste el modelo queda idéntico al de hoy (hay prueba).
- **Herramienta de marcado** en `/pacientes/:patientId/neuro-3d/radiografia`:
  sobre una imagen clínica (foto) o una serie DICOM CR/DX, con lupa, el nombre
  del punto que toca, deshacer, saltar, arrastrar para corregir, y los ángulos
  calculados en vivo como sugerencia. Funciona a 390 px con dedo. Al final,
  «Ver en Neuro 3D».
- **Backend**: tabla `columna_ajustes_rx` (migración `2026_10_27_0054`), con los
  puntos, la calibración y las mediciones **calculadas en el servidor** con una
  implementación Python de las mismas fórmulas (`services/columna_rx.py`) y una
  prueba de paridad contra `paridadRx.json`. Listar, guardar y anular (borrado
  lógico con motivo). Permisos `spine_rx.read` y `spine_rx.write`, alcance del
  dueño del expediente, bitácora de accesos (sección `columna_rx`) y de acciones.
- **Neuro 3D**: con el origen «radiografía» la columna se dobla a las medidas
  guardadas, el aviso cambia al de ese origen y las mediciones se ven junto al
  modelo. El selector visible «Origen del modelo» lo construye el tramo TC; aquí
  se conecta con una entrada temporal mientras no exista.
- Recorrido guiado `columna-radiografia`, DESIGN §4.15 y línea en el CHANGELOG.

## Fórmulas y fuentes

| Medición | Cómo se calcula | Fuente |
|---|---|---|
| Cobb sagital (lordosis L1–S1, cifosis T4–T12) | Diferencia de inclinación entre el platillo superior de la vértebra de arriba y el platillo (inferior, o superior en S1) de la de abajo | Cobb 1948 (método); rangos de referencia de Roussouly 2005 y Bernhardt 1989 (verificar) |
| Cobb coronal | Par de platillos de mayor diferencia de inclinación entre una vértebra de arriba y otra de abajo; el médico puede cambiarlas. Escoliosis desde 10° | Cobb 1948; umbral de 10° de la Scoliosis Research Society (verificar) |
| Listesis | Desplazamiento de la esquina posteroinferior de la vértebra de arriba sobre el platillo superior de la de abajo, en % del largo de ese platillo. Grados I–V por cuartos | Meyerding 1932 (grados); medición en % de Taillard 1954 (verificar) |
| Altura discal relativa | Media de la altura anterior y posterior del disco entre la altura media del cuerpo de arriba | Cociente simple (verificar); idea de normalizar por el cuerpo vecino como en Farfan 1972 y Frobin 1997 |
| PI, PT, SS | SS: ángulo del platillo de S1 con la horizontal. PT: ángulo de la línea del eje de las caderas al centro de S1 con la vertical. PI: ángulo entre la perpendicular al platillo de S1 y esa línea. PI = PT + SS se comprueba | Legaye, Duval-Beaupère 1998 |

## Calibración

Una foto no trae escala. Por defecto todo se calcula como **ángulos y
proporciones**, que no dependen de ella. Los milímetros solo aparecen en dos casos,
y la interfaz dice cuál aplica:

1. **DICOM con espaciado del píxel** (`PixelSpacing` o el del detector): «medido con
   el espaciado del DICOM; la magnificación de la placa puede agregar 10–20 %
   (verificar)».
2. **Distancia conocida** que el médico marca (una regla, un objeto de tamaño
   conocido): «medido con la referencia de N mm que marcaste».

Si el espaciado del DICOM no es igual en las dos direcciones, los ángulos se
calculan sobre coordenadas en mm, no en píxeles.

## Riesgos y cómo se cubren

- **Una foto torcida deforma los ángulos.** Una placa fotografiada en ángulo
  produce perspectiva. La pantalla pide fotografiarla de frente y lo repite en el
  aviso; no hay forma de corregirlo desde la imagen.
- **Se confunde la aproximación con el paciente real.** El aviso del origen
  «radiografía» es fijo y visible, y la captura lo lleva. Las vértebras conservan
  la forma del modelo; no se dibuja ninguna anatomía que no se midió.
- **Ángulo distinto entre la pantalla y el servidor.** El servidor recalcula y
  guarda el suyo; la prueba de paridad (`paridadRx.json`) corre en vitest y en
  pytest.
- **Puntos mal colocados.** Las mediciones son una sugerencia mientras se marca;
  cualquier punto se arrastra para corregirlo. Un ajuste guardado no se edita: se
  anula con motivo y se vuelve a marcar, para conservar el rastro.
- **Falla a media consulta.** El marcado vive en la pantalla hasta que el servidor
  confirma el guardado; si falla, no se pierde ni se dice «guardado».
- **Lateral sin orientación.** El sentido «adelante» sale de las propias esquinas
  (anterior y posterior que marca el médico), no de un supuesto sobre la placa. En
  la AP el médico confirma de qué lado está la derecha del paciente (por omisión, la
  convención radiológica: a la izquierda de la imagen).

## Impacto

- **Datos**: una tabla nueva. Nada se borra. La imagen de origen no se copia: se
  referencia (imagen clínica o serie DICOM).
- **Permisos**: dos nuevos, del médico por omisión; se sube
  `users.permissions_version` para que las sesiones abiertas los vean.
- **Archivos compartidos con el tramo TC**: `ejeColumna.ts` (solo RX),
  `origenModelo.ts` (idéntico), `AtlasNeuroPage.tsx` (entrada temporal del
  origen), migración 0054 (se reencadena a la 0053 al integrar).

## Fuera de alcance

- Detección automática de puntos (visión por computadora).
- Curvas secundarias de escoliosis y rotación vertebral (Nash-Moe).
- Columna cervical: las fórmulas sirven, pero el marcado se ofrece de T1 al sacro.
- Parámetros globales con C7 (SVA, T1 pelvic angle): requieren placa completa.
