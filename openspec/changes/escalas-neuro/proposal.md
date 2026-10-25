# Escalas neurológicas en la consulta

## Por qué

Las escalas son el lenguaje diario de la neurocirugía: el Glasgow de ingreso, el
NIHSS del evento vascular, el Hunt y Hess de una hemorragia subaracnoidea, el ODI
antes y después de una cirugía de columna. Hoy el médico las calcula de memoria o
en otra aplicación y las escribe a mano en la nota, así que:

- no queda el detalle de qué se respondió en cada ítem;
- no se puede graficar la evolución (ODI preoperatorio contra el de los 3 meses);
- un error de suma pasa directo al expediente.

## Qué cambia

- **Dominio puro** (`frontend/src/modules/escalas/dominio/`): motor declarativo
  portado de MediSuite (`escalas/escalas.ts`). Cada escala define sus ítems, las
  opciones con sus puntos, cómo se calcula (suma, porcentaje o grado), la
  interpretación por rangos y su **fuente visible** (autor y año).
- **Escalas incluidas:** Glasgow (con «no valorable»: ojos cerrados por edema = C,
  intubado = T), NIHSS, Rankin modificada (mRS), ASIA/AIS (grado A–E), Hunt y Hess,
  Fisher modificada, WFNS, Karnofsky, mJOA, Oswestry (ODI, en porcentaje, con
  secciones omitidas), NDI, ENA de dolor, Spetzler-Martin y Barthel.
- **Backend:**
  - Tabla `escalas_aplicadas` (migración `2026_10_26_0052`, solo agrega).
  - `backend/app/services/escalas.py` recalcula el puntaje en el servidor: el
    puntaje del navegador nunca se guarda.
  - `GET/POST /api/v1/patients/{id}/escalas` y
    `POST /api/v1/patients/{id}/escalas/{escala_id}/anular` (con motivo).
  - Permisos nuevos `clinical_scales.read` y `clinical_scales.write`, del médico por
    omisión. Alcance clínico: solo el médico dueño del expediente (variante `own`).
    Anular exige además ser quien la aplicó.
  - La anulación es lógica: la escala anulada deja de contar en la gráfica, pero
    no se borra y conserva quién, cuándo y por qué.
  - Bitácora: aplicar y anular van a `audit_logs`; leer va a la bitácora de
    accesos (sección nueva `escalas`).
- **Frontend:**
  - En la consulta, una sección plegable **«Escalas neurológicas»** junto a
    «Plan clínico», con el selector de escala, el formulario de ítems (el puntaje
    se ve mientras se llena: sugerir, no decidir) y el historial del paciente para
    esa escala. El guardado solo confirma con la respuesta del servidor.
  - En el expediente, una pestaña **«Escalas»** con la gráfica de evolución
    (chart.js) y la tabla, para quien tenga `clinical_scales.read`.

## Fuera de alcance

- **Examen ISNCSCI completo** (puntajes motores y sensitivos por dermatoma, niveles
  neurológico, motor y sensitivo, zonas de preservación parcial). Aquí solo se
  registra el **grado AIS A–E** con sus criterios. Calcularlo a partir del examen
  queda para otro cambio.
- Escalas de MediSuite ajenas a la especialidad (PHQ-9, GAD-7, AUDIT-C, Apgar,
  Silverman, Morse, Braden, FINDRISC).
- Calificaciones complementarias (Lawton-Young para Spetzler-Martin, escala de
  Fisher original).

## Contenido clínico por revisar («(verificar)»)

Lo que sigue se escribió con la fuente citada a la vista de la memoria, no de un
documento validado. En la interfaz aparece con la marca **(verificar)** hasta que
un médico lo confirme. Ninguna regla ni punto de corte se inventó: lo que no
estaba claro se dejó marcado.

| Escala | Qué verificar |
|---|---|
| NIHSS | Rangos de gravedad (0, 1–4, 5–15, 16–20, 21–42): son de uso común, no del artículo original. Textos de los ítems: traducción libre del original en inglés; contrastar con la versión validada en español. |
| mJOA | Textos de los ítems: traducción libre (Benzel 1991; versión de Kopjar 2015). Rangos de gravedad de Tetreault 2017 (leve 15–17, moderada 12–14, grave 0–11). |
| ODI | Textos: traducción libre de la versión 2.1a (Fairbank y Pynsent 2000); la validada en español es la de Flórez 1995. Las distancias de «Caminar» se convirtieron de millas y yardas a metros. Regla de validez con secciones omitidas: el cálculo proporcional es del autor; el umbral de cuántas se pueden omitir no se fijó y la pantalla avisa desde tres. |
| NDI | Textos: traducción libre (Vernon y Mior 1991); la validada en español es la de Andrade Ortega 2008. Rangos 0–4, 5–14, 15–24, 25–34, ≥ 35 (Vernon 2008). Con secciones omitidas se prorratea a 50 igual que el ODI (verificar). |
| ENA de dolor | Rangos leve 1–3, moderado 4–6, intenso 7–10: hay cortes publicados distintos (p. ej. 1–4 / 5–6 / 7–10, Serlin 1995). |
| Barthel | Rangos de dependencia heredados de MediSuite (citan a Cid-Ruzafa 1997); existen otros cortes en uso. |
| Hunt y Hess | El original sube un grado por enfermedad sistémica grave o vasoespasmo grave en la angiografía. Se muestra como nota, no se aplica solo. |
| Fisher modificada | Definición de «gruesa» frente a «delgada» y porcentajes de vasoespasmo: no se muestran. |

## Riesgos y cómo se cubren

- **Puntaje distinto entre la pantalla y el servidor.** El servidor recalcula y
  guarda el suyo; la pantalla muestra el que devolvió el servidor. Un archivo de
  casos compartido (`frontend/src/modules/escalas/dominio/paridad.json`) se prueba
  en vitest y en pytest, y fija la estructura de cada escala (ítems, opciones y
  puntos): si una implementación cambia sin la otra, falla una de las dos suites.
- **Una escala cambia de versión.** Cada registro guarda `version_escala`; si el
  navegador manda otra versión que la del servidor, se rechaza con un mensaje en
  español para que recargue, en vez de guardar respuestas con otro significado.
- **Falla a media consulta.** El formulario no se limpia si el guardado falla;
  nada dice «guardada» sin la respuesta del servidor.
