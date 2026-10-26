# Orientar Cortex a neurocirugía de alto perfil

Estado: **plan por ejecutar** (2026-10-26). Nada de esto está construido.
Base: `develop` tras Neuro 3D, escalas y despliegue de pruebas.

## Por qué

Cortex nació de GEMS (ginecología). La interfaz ya casi no habla de ginecología,
pero la receta sigue **rosa/morada y con el membrete «G & G Ginecólogos»**, el
vademécum es **ginecológico** (307 entradas, casi todas prenatales y
anticonceptivos), los catálogos de estudios todavía destacan «imagen de la
mujer» y «US de embarazo», y la ficha y la nota no tienen la estructura que un
neurocirujano espera (diagnóstico codificado, lateralidad y nivel, examen
neurológico, escalas vigentes).

Meta: que un médico de neurocirugía abra Cortex y lo sienta hecho para él, con
una receta en **azul ejecutivo con el cerebro de Cortex** y medicamentos
buscables **en español**.

## Qué ya está hecho (no repetir)

Ficha con lateralidad, antecedentes neurológicos, implantes y anticoagulantes;
9 tipos de episodio neuro; 7 consentimientos neuro vigentes; plantillas de orden
v2 neuro; 14 escalas; Neuro 3D; agenda de cirugías; atajos de receta genéricos.
Lo ginecológico ya no se ofrece al crear datos nuevos.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Datos viejos de GEMS | **No se borran** (CLAUDE.md). Se ocultan; las columnas y migraciones quedan. |
| Fuente de medicamentos | **openFDA** (la que Cortex ya consulta) **más un vademécum neuro propio en español**. La búsqueda funciona en español aunque la ficha venga en inglés. |
| Receta | Azul ejecutivo (marino/azul de la marca) y el cerebro de Cortex como logo por defecto. Cada médico puede seguir subiendo el suyo. |
| Embarazo/prenatal | Ocultar de forma condicionada, no borrar (es lo más costoso: ~40 pruebas, permisos, FKs). Va al final. |
| Voz | Tú, «el médico», «el paciente» (`vozDeLaInterfaz.test.ts`). |

## Preguntas abiertas (responder antes de la fase indicada)

1. **Fase 3.** ¿Hay una lista de medicamentos que el médico recete de verdad
   (antiepilépticos, anticoagulantes, corticoides, opioides…)? Si la hay, el
   vademécum parte de ella y no de una lista genérica. Si no, arranco con la
   propuesta de la fase 3 y el médico la revisa.
2. **Fase 1.** ¿Se conserva el color por médico (cada uno elige acento)? Propuesta:
   sí, con azul ejecutivo de fábrica.
3. **Fase 5.** ¿Diagnóstico con **CIE-10** o **CIE-11**? Propuesta: CIE-10 (lo que
   piden aseguradoras y NOM en México hoy) con búsqueda en español.
4. **Fase 4.** ¿Quién revisa médicamente los textos nuevos de consentimientos y
   certificados? Se marcan «(verificar)» hasta que alguien los firme.

## Fases

### Fase 0 · Cerrar lo pendiente de la interfaz

Triage que salía encimado sobre «Editar Cita» (los fondos de las ventanas apiladas quedaban en el mismo nivel) y encabezado muy justo (buscador cortado, sin aire). Ya está hecho y visto en el navegador en la rama `fix/modales-apilados`; falta la suite completa, revisar el celular y otras ventanas apiladas. Ver tareas 0.x.

### Fase 1 · Identidad y receta (riesgo bajo)

- Acento de fábrica de `#8B2E83` (morado) a azul ejecutivo; línea y campo
  derivados del azul. Las tres constantes se cambian juntas:
  `backend/app/utils/colores.py`, `frontend/.../utils/ajustesReceta.ts`
  (`COLOR_ACENTO_POR_DEFECTO`) y los tonos de fábrica que `tonos()` no deriva.
- **Logo por defecto**: el cerebro de Cortex como asset **del backend**
  (`backend/app/assets/`), en versión **sobre blanco** (el PNG transparente de la
  interfaz se pierde sobre papel). Se usa en `pdf.py` (fallback del logo, línea
  ~617) y en el membrete de órdenes y certificados, en lugar de «G & G /
  GINECÓLOGOS». Sin logo propio del médico, sale el de Cortex.
- Quitar «G.E.M.S — Gynecology & Expert Management System» del pie (`pdf.py` ~491),
  el docstring «G&G Ginecólogos» y la leyenda de fábrica «CUIDAMOS TU SALUD,
  ACOMPAÑAMOS TU VIDA.» (neutra o de neurocirugía).
- Ejemplo de la vista previa (`doctor_profile.py` `_receta_de_muestra`): paciente
  y medicamentos neuro (por ejemplo levetiracetam, dexametasona), no «ácido
  fólico».
- Certificados: pasar a la misma paleta azul y al mismo membrete.
- Pruebas a actualizar a propósito: `test_receta_configurable.py` (~638, 671),
  `test_orden_configurable.py:165`, `ajustesReceta.test.ts:108`.
- Revisar con la receta real en PDF (abrirla y verla), no solo con pruebas.

### Fase 2 · Textos de marca residuales

`main.py:97`, `email_templates.py:54`, `core/config.py` (`gems.local`),
`.env.prod.example` (`MFA_ISSUER`, `EMAIL_FROM_NAME`), `frontend/public/sw.js`, claves
`gems-*` de almacenamiento (migrar sin perder la preferencia del usuario),
`Login.tsx`. Revisar los recorridos guiados (sube `version` si cambian).

### Fase 3 · Medicamentos: vademécum neuro y búsqueda en español

- **Vademécum neuro propio** (`backend/app/data/vademecario.json`), limpio y en
  español, con nombre genérico, marca, presentaciones, vía, dosis habituales y
  grupo. Grupos mínimos: antiepilépticos (levetiracetam, valproato, carbamazepina,
  fenitoína, lamotrigina, oxcarbazepina, topiramato, lacosamida), antiedema y
  corticoides (dexametasona, prednisona, manitol), analgésicos y opioides
  (paracetamol, ketorolaco, tramadol, morfina, fentanilo, buprenorfina),
  neuropáticos (gabapentina, pregabalina, amitriptilina, duloxetina), relajantes
  (ciclobenzaprina, baclofeno, tizanidina), anticoagulantes y antiagregantes
  (warfarina, rivaroxabán, apixabán, enoxaparina, clopidogrel, ácido
  acetilsalicílico), nimodipino, antieméticos y gastroprotectores (ondansetrón,
  metoclopramida, omeprazol), antiparkinsonianos si aplica. Se parte de las
  entradas útiles del vademécum actual (paracetamol, aspirina, betametasona,
  gabapentina…) y se descarta lo ginecológico y lo sucio (nombres con «HS 10 DIAS»,
  duplicados, caracteres rotos). Fuente de cada dato: indicada; lo no confirmado
  va «(verificar)» (no se inventan dosis).
- **Traducción**: ampliar `DRUG_NAME_ES_EN` con todo lo anterior y corregir la
  búsqueda (`espacio` vs `_`). Que escribir «levetiracetam», «Keppra» o «antiepiléptico»
  encuentre el medicamento.
- **openFDA**: cambiar los ~30 términos de sincronización diaria de ginecología a los
  del vademécum neuro; **traducir al español** las secciones que se muestran
  (indicaciones, contraindicaciones, advertencias) y marcarlas «traducción
  automática; revisa la ficha original». Se muestra al médico como consulta, no
  como receta automática.
- **Mostrar la búsqueda en la receta**: hoy `PrescriptionForm` solo usa el
  vademécum; el componente `MedicationSearch` (openFDA + caché) no lo monta nadie.
  Montarlo como «buscar fuera de mis frecuentes» y, al elegir, llenar nombre,
  presentación y dosis sugerida (editable: «sugerir, no decidir»).
- **Guardar el genérico** en el item de la receta (`generic_name`) para poder
  advertir de interacciones y duplicidad.
- **Alerta de anticoagulantes**: si la ficha dice que el paciente toma uno y se
  receta otro (o un AINE), avisar antes de guardar. Sin base comercial de
  interacciones: solo reglas simples y publicadas, marcadas «(verificar)».
- Pruebas: `test_vademecario.py` (≥300, ASPIRINA PROTEC/ELEVIT en el top 6) y
  `receta.vademecario.test.ts` (elevit, gesta, foliv) se **reescriben** con lo
  neuro; nueva prueba de búsqueda en español.

### Fase 4 · Estudios, consentimientos y certificados neuro

- **Catálogo de estudios**: quitar el `destacado` de «imagen de la mujer» y «US
  embarazo» (y ocultarlos o retirarlos); agregar angiografía cerebral digital,
  perfusión y difusión, espectroscopía, RM funcional, tractografía, mielografía y
  mielo-TC, PET-CT, SPECT, Doppler transcraneal, EEG y video-EEG, EMG y velocidades
  de conducción, potenciales evocados, polisomnografía, punción lumbar con LCR.
  Ajustar `test_catalogo_estudios.py` (hoy exige esos grupos y que sean los únicos
  destacados).
- **Plantillas de orden** que faltan: tumor cerebral, hidrocefalia/válvula,
  neurotrauma, hemorragia subaracnoidea, mielopatía, dolor crónico, control
  posquirúrgico, cirugía funcional, suspensión de anticoagulación.
- **Consentimientos** (los gineco se conservan solo para abrir los ya firmados):
  agregar anestesia o enlace al del anestesiólogo, tumor (cráneo-base y
  transesfenoidal), aneurisma/MAV, cirugía de epilepsia y DBS, craniectomía
  descompresiva, monitor de PIC, ventriculostomía externa, neuronavegación,
  mapeo/despertar intraoperatorio, paciente pediátrico (firma del tutor),
  representante legal. Quitar `requires_pregnancy_test` y el prellenado de FUM/FPP
  del flujo (conservar para los ya firmados).
- **Certificados**: incapacidad posquirúrgica, aptitud tras cirugía o crisis,
  restricción de conducir por epilepsia, constancia de procedimiento, constancia
  de implante (válvula, neuroestimulador) para RM y aeropuertos, resumen clínico
  para aseguradoras, referencia y contrarreferencia. Migración de los enums.
- Todo texto médico nuevo lleva fuente o «(verificar)».

### Fase 5 · Ficha, triage y nota

- Quitar la tarjeta «HISTORIA G-O» de `PatientHistory.tsx` y limpiar el estado
  muerto de `PacienteForm.tsx` (la validación de gestas/paras, FPP).
- **Ficha estructurada** (migración tras la 0054): antiepilépticos vigentes,
  cirugías previas (fecha, procedimiento, lado), alergia a contraste/gadolinio,
  función renal de referencia, clase de anticoagulante y fecha de suspensión,
  riesgo anestésico (ASA), condición para RM de los implantes.
- **Triage**: agregar FC, FR, SpO2, glucemia, Glasgow, pupilas, fuerza por
  segmento y pares craneales.
- **Nota**: placeholders neuro, **examen neurológico estructurado**, lateralidad y
  nivel del hallazgo, plan quirúrgico estructurado (procedimiento, fecha, lado,
  consentimiento ligado), **diagnóstico codificado** (CIE-10, en español, con
  búsqueda; la pregunta 3).
- **Escalas**: agregar ECOG, Engel, Hoehn-Yahr, ICH, GOS/GOSE, Frankel, Nurick,
  MoCA y SINS, y un «estado neurológico vigente» derivado en la cabecera del
  expediente (última escala por tipo).
- **Especialidad**: migración que cree «Neurocirugía» (hoy solo en el seed) y la
  deje como valor por defecto.

### Fase 6 · Retirar embarazo y prenatal (al final, la más costosa)

Ocultar sin borrar datos: la insignia «paciente embarazada» y la llamada
`useEmbarazoActivo` en la consulta, la pestaña del expediente, «Embarazo: N sem»
del encabezado, SDG en la agenda, la sección del resumen clínico y la impresión de
FUM/FPP en consentimientos, `pregnancyContext` en estudios, el permiso
`prenatal.*` y el router. Con un flag de módulo (como los módulos opcionales de
Cortex), no con borrado: los embarazos viejos siguen en la base y, si algún día
hacen falta, se reactivan. ~40 pruebas se ajustan; no se tocan las migraciones.
Recorrido guiado de la consulta y del expediente: revisar y subir `version`.

## Riesgos

- **Cambiar constantes de color** rompe 3 pruebas atadas a los valores de fábrica:
  se actualizan juntas en el mismo commit.
- **Nuevo vademécum** pierde el orden por «veces recetado» de GEMS: arranca en cero
  y se vuelve a ordenar con el uso real.
- **Contenido médico** (dosis, interacciones, consentimientos, certificados) lo
  firma un médico antes de usarse con pacientes reales; mientras tanto va «(verificar)».
- **Traducción automática de fichas de openFDA** puede equivocarse: se rotula y se
  muestra junto al original.
- **Fase 6** toca datos clínicos: nada se borra, todo con flag y pruebas.

## Orden y ramas

Una rama por fase, desde `develop`, con su cambio de OpenSpec resumido aquí. Orden:
1 → 2 → 3 → 4 → 5 → 6. Las fases 1, 2 y 3 son independientes y pueden ir en
paralelo (tres agentes), las fases 4 y 5 también entre sí; la 6 va sola al final.
Cada fase: `scripts/verificar_todo.ps1` en verde, verla en el navegador y, si toca
el frontend, revisar los recorridos guiados.
