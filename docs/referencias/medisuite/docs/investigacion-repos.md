# Investigación de repositorios open source para MediSuite

**Fecha de corte:** 24 de octubre de 2026 · **Alcance:** cardiología, otras especialidades, estándares/CDS, apps para pacientes y demos en navegador.

## Metodología y advertencias

- **Todo lo listado se verificó.** Cada repo de GitHub se clonó en modo superficial (`git clone --depth 1`) para confirmar que existe, leer el archivo LICENSE y obtener la fecha del último commit de la rama principal. Las ⭐ se leyeron de la página pública de GitHub el 2026-10-24.
- **La API de GitHub (`gh api`) estaba bloqueada en esta sesión.** Por eso la columna "último push" muestra en realidad la **fecha del último commit en la rama por defecto**. Es casi siempre igual al `pushed_at`, pero puede diferir si hay actividad en otras ramas.
- **Licencia del código ≠ licencia de los pesos o datos.** Donde lo encontré, lo indico por separado. "🔍 revisar" significa que la licencia de pesos o datos no está declarada, es contradictoria o depende de un tercero.
- **Leyenda:**
  - Dónde corre: 🌐 navegador · ☁️ servidor (API que llama la app web).
  - Licencia: ✅ uso comercial OK (MIT/BSD/Apache/MPL) · ⚠️ copyleft (GPL/AGPL/CC BY-SA: se puede usar comercialmente, pero con obligaciones) · ⛔ no comercial · 🔍 revisar.
- **Nada de esto es un dispositivo médico certificado.** Si un modelo de IA se usa con pacientes reales en México, aplica la regulación de COFEPRIS sobre software como dispositivo médico.

---

## Parte A: repos cardiacos solicitados

| Repo | Existe | Licencia código | Licencia modelos/datos | ⭐ | Último commit | Qué aprovechar |
|---|---|---|---|---|---|---|
| [Rjc1999/cathsim](https://github.com/Rjc1999/cathsim) | ✅ Sí | **PolyForm-Noncommercial-1.0.0** ⛔ | Corazón "Anatomical heart – codominance" (E-learning UMCG, Sketchfab, basado en BodyParts3D): **CC BY-NC-SA 4.0** ⛔. Cubre `public/models/heart.glb`, `heart.index.json` y `cases_manifest.json` (ver NOTICE.md). | 0 | 2026-10-05 | Simulador de proyecciones del arco en C (LAO/RAO, CRA/CAU) con fluoroscopía simulada y gemelo 3D (Vite + React + R3F + Zustand). Sin demo publicada. **Solo como referencia de UX y arquitectura.** No se puede copiar código ni modelo para uso comercial. |
| [he315/Cathlsbsimulator](https://github.com/he315/Cathlsbsimulator) ("CathMaster") | ✅ Sí | **Sin licencia** ⛔ (todos los derechos reservados por defecto) | `datasets/ATTRIBUTION.md`: CADICA **CC BY 4.0**, CoronaryDominance **CC0 1.0** y AngioCAD. Las imágenes no vienen en el repo; se generan con scripts. | 0 | 2026-10-10 | Simulador educativo de angiografía coronaria (catéteres, ostium, curvas de presión). Sin demo. **Lo valioso son los datasets abiertos que cita** (CADICA, CoronaryDominance en Hugging Face): se pueden usar directamente. El código no se puede usar sin permiso. |
| [SeraKah-1/cardiac-3d-ecg-simulator](https://github.com/SeraKah-1/cardiac-3d-ecg-simulator) | ✅ Sí | **MIT** ✅ | No usa mallas de terceros declaradas. ECG generado por modelo biofísico propio. | 0 | 2026-09-28 | **Demo:** https://cardiac-3d-ecg-simulator.vercel.app. Motor de ECG de 12 derivaciones (dipolo cardiaco + campo de derivaciones en el torso), arritmias, papel milimétrico, calipers, rueda del eje y PDF vectorial. React 19 + Three.js + TS. **Es el más reutilizable de los seis:** módulo educativo de ECG o generador de trazos sintéticos para pruebas del visor. |
| [SoumyadeepChattopadhyay2004/Cardio3D](https://github.com/SoumyadeepChattopadhyay2004/Cardio3D) | ✅ Sí | **Sin archivo LICENSE** ⛔🔍. NOTICE.md solo dice "provided for research and education". | Mallas: BodyParts3D 4.0 (DBCLS), declarada **CC BY 4.0**, reempaquetada vía ashemag/human-atlas. Datos: Z-Alizadeh Sani (UCI). | 0 | 2026-10-03 | **Demo:** https://cardio3d.onrender.com. Riesgo por arteria (CAD/LAD/LCX/RCA) con SHAP, pintado sobre un `thorax.glb` con LAD, LCX y RCA segmentadas. **Aprovechable:** la idea de construir nuestro propio GLB desde BodyParts3D, con atribución. El código no tiene licencia. |
| [Shreyas578/CardioViz3D](https://github.com/Shreyas578/CardioViz3D) | ✅ Sí | README dice **MIT**, pero **no hay archivo LICENSE** 🔍 | `heart.glb` (8.2 MB) compilado de 129 mallas "FMA" (IDs del Foundational Model of Anatomy; muy probablemente derivado de BodyParts3D). **No declara licencia de las mallas** 🔍 | 1 | 2026-10-13 | Sin demo (solo `vercel.json`). Patrón FastAPI `/predict`, `/explain` y `/whatif` con SHAP y simulador contrafactual. Pedir al autor que agregue el LICENSE antes de copiar código. |
| [azlaanaliladha-ACE/cardiolens-3d](https://github.com/azlaanaliladha-ACE/cardiolens-3d) | ✅ Sí | **Sin licencia** ⛔🔍 | Anatomía **procedural** (no usa malla de terceros). Dataset Z-Alizadeh Sani citado como **CC BY 4.0**. | 0 | 2026-10-13 | Demo solo "en Devpost" (no hay URL en el repo). Corazón procedural en three.js con coronarias como splines sobre los surcos, y **TreeSHAP exacto en JS sin servidor**. Es la técnica más limpia legalmente (no depende de mallas con licencia), pero el código requiere permiso del autor. |

**Conclusión de la Parte A:** solo **SeraKah-1/cardiac-3d-ecg-simulator (MIT)** se puede reutilizar sin pedir permiso. Para un corazón 3D comercial, conviene generar el modelo nosotros desde **BodyParts3D**.

> 🔍 BodyParts3D aparece citado como CC BY 4.0 (Cardio3D) y como CC BY-SA (cathsim, vía Sketchfab). Confirmen la versión y la licencia en el sitio de DBCLS antes de usarlo.

También sirven el heart model **procedural** (estilo cardiolens) o los modelos de NIH 3D marcados CC-BY o dominio público (ver Recursos fuera de GitHub).

---

## Parte B: proyectos adicionales verificados

### 1. Cardiología

#### 1a. CTA coronaria, vasos y 3D

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [wasserth/TotalSegmentator](https://github.com/wasserth/TotalSegmentator) | Segmenta más de 100 estructuras en TC y RM. Tiene subtareas cardiacas: `heartchambers_highres`, `coronary_arteries` y `aortic_sinuses`. Web: totalsegmentator.com y reportes de aorta y pulmonar. | ☁️ (Python/GPU) | ✅ Apache-2.0 para las tareas abiertas. ⚠️⛔ **`coronary_arteries` y `heartchambers_highres` requieren licencia**: gratis para uso académico, de pago para uso comercial. | 3.1k / 2026-10-22 |
| [XiaoweiXu/ImageCAS…](https://github.com/XiaoweiXu/ImageCAS-A-Large-Scale-Dataset-and-Benchmark-for-Coronary-Artery-Segmentation-based-on-CT) | Dataset de unas 1000 TC coronarias con etiquetas de arterias, más un benchmark. Hay espejo en Kaggle. | Datos | 🔍 El repo no tiene LICENSE. Para descargar hay que pedir el enlace y la contraseña por correo al autor. | 101 / 2023-11-02 |
| [vmtk/vmtk](https://github.com/vmtk/vmtk) | Toolkit clásico para extraer líneas centrales de vasos, medir diámetros y generar mallas de vasos. | ☁️ | ✅ BSD | 439 / 2026-09-28 |
| [Kitware/VolView](https://github.com/Kitware/VolView) | Visor DICOM con render volumétrico "cinemático" 100% en navegador, más pintado y medición. Demo: volview.kitware.app | 🌐 | ✅ Apache-2.0 | 303 / 2026-10-22 |

#### 1b. ECG: modelos, digitalización y visores

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [antonior92/automatic-ecg-diagnosis](https://github.com/antonior92/automatic-ecg-diagnosis) | ResNet para ECG de 12 derivaciones (6 anormalidades; paper en Nature Comms). Pesos en Zenodo. Exportable a ONNX para correr en navegador. | ☁️ / 🌐 (vía ONNX) | ✅ MIT (código). 🔍 Pesos en Zenodo: no verifiqué su licencia. | 455 / 2022-02-22 (sin mantenimiento) |
| [bowang-lab/ECG-FM](https://github.com/bowang-lab/ECG-FM) | Modelo fundacional de ECG (transformer). Checkpoints en Hugging Face (`wanglab/ecg-fm`). | ☁️ | ✅ MIT (código). 🔍 El README no declara la licencia de los pesos. | 322 / 2026-01-14 |
| [Edoar-do/HuBERT-ECG](https://github.com/Edoar-do/HuBERT-ECG) | Modelo fundacional de ECG auto-supervisado. | ☁️ | ⛔ CC BY-NC 4.0 | 83 / 2026-10-04 |
| [felixkrones/ECG-Digitiser](https://github.com/felixkrones/ECG-Digitiser) | **Ganador del PhysioNet Challenge 2024** (digitalización): convierte foto o escaneo de ECG en señal (nnU-Net + Hough). Pesos incluidos vía git-lfs. | ☁️ | ✅ BSD-2-Clause | 90 / 2025-06-18 |
| [alphanumericslab/ecg-image-kit](https://github.com/alphanumericslab/ecg-image-kit) | Genera imágenes sintéticas de ECG (arrugas, ruido) para entrenar o probar digitalizadores. Es la herramienta oficial del Challenge 2024. | ☁️ | ✅ BSD-3-Clause | 168 / 2024-07-11 |
| [neuropsychology/NeuroKit](https://github.com/neuropsychology/NeuroKit) | Procesamiento de ECG, PPG y EDA: picos R, HRV, delineación P-QRS-T. Ideal para un microservicio `/ecg/analyze`. | ☁️ | ✅ MIT | 2.4k / 2026-03-01 |
| [MIT-LCP/wfdb-python](https://github.com/MIT-LCP/wfdb-python) | Lectura y escritura del formato WFDB de PhysioNet. | ☁️ | ✅ MIT | 853 / 2026-06-30 |
| [sixlettervariables/sierra-ecg-tools](https://github.com/sixlettervariables/sierra-ecg-tools) | Parsers del XML de ECG de **Philips (Sierra)** en JS/Node, Python, C# y otros. Útil porque es un formato común en hospitales mexicanos. | 🌐 / ☁️ | ✅ MIT | 55 / 2024-11-02 |
| [PantelisGeorgiadis/dcmjs-ecg](https://github.com/PantelisGeorgiadis/dcmjs-ecg) | Renderiza ECG en formato **DICOM Waveform** a SVG, en navegador y Node. | 🌐 | ✅ MIT | 9 / 2026-05-19 |
| [ArturRod/ecg-dicom-web-viewer](https://github.com/ArturRod/ecg-dicom-web-viewer) | Visor web de ECG DICOM (12 derivaciones, general y ambulatorio). Paquete npm `ecg-dicom-web-viewer`. | 🌐 | ✅ MIT | 30 / 2026-09-08 |

#### 1c. Ecocardiografía y resonancia magnética cardiaca

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [echonet/dynamic](https://github.com/echonet/dynamic) | EchoNet-Dynamic: fracción de eyección y segmentación del VI en video de eco. | ☁️ | 🔍 **Contradictoria**: hay un `LICENSE` MIT y además un `LICENSE.txt` que **prohíbe redistribuir sin permiso escrito**. El dataset tiene acuerdo de uso **no comercial** ⛔. | 172 / 2026-05-01 |
| [echonet/EchoPrime](https://github.com/echonet/EchoPrime) | Modelo multivista de eco (reporte completo). | ☁️ | ⛔ El LICENSE es una "Academic Software License" de Cedars-Sinai, aunque el README dice MIT. | 116 / 2026-02-09 |
| [baiwenjia/ukbb_cardiac](https://github.com/baiwenjia/ukbb_cardiac) | Segmentación y análisis de RM cardiaca (UK Biobank): volúmenes y strain. | ☁️ | ✅ Apache-2.0 | 26 / 2025-12-19 |

### 2. Imagen médica, DICOM y segmentación (más allá de OHIF y Cornerstone)

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [ImagingDataCommons/slim](https://github.com/ImagingDataCommons/slim) | Visor de **patología digital** (DICOM WSI) 100% cliente sobre DICOMweb. | 🌐 | ✅ Apache-2.0 | 172 / 2026-10-14 |
| [ImagingDataCommons/dicom-microscopy-viewer](https://github.com/ImagingDataCommons/dicom-microscopy-viewer) | Librería JS que usa Slim por debajo, para embeber visores de laminillas. | 🌐 | ✅ MIT | 130 / 2026-10-22 |
| [dcmjs-org/dcmjs](https://github.com/dcmjs-org/dcmjs) | Leer y escribir DICOM en JS: SR, SEG, anonimización. Base para generar reportes estructurados DICOM-SR. | 🌐 | ✅ MIT | 353 / 2026-10-19 |
| [PantelisGeorgiadis/dcmjs-imaging](https://github.com/PantelisGeorgiadis/dcmjs-imaging) | Renderiza píxeles DICOM (incluye códecs JPEG, JPEG-LS y J2K vía WASM) sin depender de Cornerstone. Mismo autor que **dcmjs-dimse** (C-FIND, C-MOVE y C-STORE en Node, MIT). | 🌐 / ☁️ | ✅ MIT | 50 / 2026-10-20 |
| [knopkem/dicomweb-pacs](https://github.com/knopkem/dicomweb-pacs) | Mini-PACS en Node con DICOMweb (QIDO/WADO) y DIMSE, con OHIF preinstalado. Perfecto para desarrollo y demos. | ☁️ | ✅ MIT | 126 / 2026-03-22 |
| [orthanc-server/orthanc-explorer-2](https://github.com/orthanc-server/orthanc-explorer-2) | UI moderna para el PACS Orthanc. | ☁️ / 🌐 | ⚠️ AGPL-3.0 | 73 / 2026-10-20 |
| [ivmartel/dwv](https://github.com/ivmartel/dwv) | Visor DICOM ligero en JS puro (sin dependencias pesadas). | 🌐 | ⚠️ GPL-3.0 | 1.9k / 2026-10-23 |
| [niivue/niivue](https://github.com/niivue/niivue) | Visor WebGL2 de volúmenes y mallas (NIfTI, DICOM, MZ3). Tiene un ecosistema de demos en navegador. | 🌐 | ✅ BSD-2-Clause | 502 / 2026-10-06 |
| [neuroneural/brainchop](https://github.com/neuroneural/brainchop) | **Segmentación de RM cerebral 100% en navegador** (tfjs/WebGPU) sobre NiiVue. Demo: neuroneural.github.io/brainchop | 🌐 | ✅ MIT | 562 / 2025-08-13 |
| [InsightSoftwareConsortium/itk-wasm](https://github.com/InsightSoftwareConsortium/itk-wasm) | ITK compilado a WebAssembly: lectura de imágenes, filtros y registro en el navegador. | 🌐 | ✅ Apache-2.0 | 236 / 2026-09-16 |
| [Kitware/vtk-js](https://github.com/Kitware/vtk-js) | VTK en JS (render volumétrico y mallas). Es la base de VolView y del MPR de OHIF. | 🌐 | ✅ BSD-3-Clause | 1.5k / 2026-10-21 |
| [bowang-lab/MedSAM](https://github.com/bowang-lab/MedSAM) | SAM afinado para imagen médica (segmentación con caja o clic). Para correrlo en navegador se puede seguir el patrón del demo ONNX de [facebookresearch/segment-anything](https://github.com/facebookresearch/segment-anything) (Apache-2.0, 55.1k⭐): el encoder corre en servidor y el decoder ONNX en el navegador. **No encontré un demo oficial de MedSAM en navegador.** | ☁️ + 🌐 | ✅ Apache-2.0 | 4.4k / 2025-05-07 |
| [bowang-lab/MedSAM2](https://github.com/bowang-lab/MedSAM2) | MedSAM para volúmenes 3D y video (por ejemplo eco). | ☁️ | ✅ Apache-2.0 | 732 / 2025-07-11 |
| [Project-MONAI/MONAILabel](https://github.com/Project-MONAI/MONAILabel) | Servidor de anotación asistida por IA (se conecta con OHIF y 3D Slicer). | ☁️ | ✅ Apache-2.0 | 906 / 2026-10-22 |
| [Project-MONAI/VISTA](https://github.com/Project-MONAI/VISTA) | VISTA-3D y VISTA-2D: segmentación fundacional interactiva de TC. | ☁️ | ✅ Apache-2.0 (código). 🔍 Pesos: la licencia no está declarada en el README. | 300 / 2026-06-03 |
| [MIC-DKFZ/nnUNet](https://github.com/MIC-DKFZ/nnUNet) | Estándar de facto para entrenar segmentadores médicos (lo usan TotalSegmentator, ECG-Digitiser y DentalSegmentator). | ☁️ | ✅ Apache-2.0 | 9.0k / 2026-10-22 |

### 3. Otras especialidades

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| **Oftalmología** | | | | |
| [rmaphoh/RETFound_MAE](https://github.com/rmaphoh/RETFound_MAE) | Modelo fundacional de retina (fondo de ojo y OCT). | ☁️ | ⛔ CC BY-NC 4.0 | 689 / 2025-11-30 |
| [rmaphoh/AutoMorph](https://github.com/rmaphoh/AutoMorph) | Pipeline de fondo de ojo: calidad de imagen, segmentación de vasos y disco óptico, y métricas vasculares. | ☁️ | ✅ Apache-2.0 | 170 / 2025-06-21 |
| [marksgraham/OCT-Converter](https://github.com/marksgraham/OCT-Converter) | Extrae volúmenes de OCT de formatos propietarios (Heidelberg .e2e, Zeiss .img, Topcon .fds y otros). | ☁️ | ✅ MIT | 271 / 2026-09-14 |
| [MedVisBonn/eyepy](https://github.com/MedVisBonn/eyepy) | Lectura, anotación y análisis de OCT (capas, drusas). | ☁️ | ✅ MIT | 102 / 2026-09-04 |
| **Dermatología** | | | | |
| [suinleelab/MONET](https://github.com/suinleelab/MONET) | Modelo imagen-texto para dermatología (conceptos dermatoscópicos). | ☁️ | ⛔ CC BY-NC-SA 4.0 | 89 / 2025-04-08 |
| [SiyuanYan1/PanDerm](https://github.com/SiyuanYan1/PanDerm) | Modelo fundacional dermatológico multimodal. | ☁️ | ⛔ CC BY-NC-ND 4.0 (según README; no hay archivo LICENSE) | 176 / 2026-02-17 |
| **Sueño y función pulmonar** | | | | |
| [raphaelvallat/yasa](https://github.com/raphaelvallat/yasa) | Estadificación automática del sueño (EEG), husos y ondas lentas, e hipnogramas. | ☁️ | ✅ BSD-3-Clause | 589 / 2026-10-17 |
| [sbelbin/jsEDF](https://github.com/sbelbin/jsEDF) | Lector EDF+/BDF+ en JS (base para un visor de PSG o Holter en navegador). | 🌐 | ✅ MIT | 0 / 2020-10-01 (pequeño, sin mantenimiento) |
| [automate-medical/gli2012](https://github.com/automate-medical/gli2012) | Ecuaciones GLI-2012 de espirometría (FEV1, FVC, z-score, LLN) en TypeScript. Paquete npm `@automate-medical/gli2012`. Alternativa más completa en R: [thlytras/rspiro](https://github.com/thlytras/rspiro) (GLI-2012 y GLI-2022 race-neutral, ⚠️ GPL≥2, 24⭐, 2026-04-11). | 🌐 | ✅ MIT | 3 / 2020-11-30 (pequeño; validar contra tablas GLI) |
| **Odontología** | | | | |
| [biomathcode/react-odontogram](https://github.com/biomathcode/react-odontogram) | Componente React (SVG) de odontograma con notación FDI, Universal y Palmer. Tiene versión React Native. npm `react-odontogram@0.6.0`. Demo en Storybook: biomathcode.github.io/react-odontogram | 🌐 | ✅ MIT | 80 / 2026-09-09 |
| [clawnify/open-dentist](https://github.com/clawnify/open-dentist) | Gestión de consultorio dental (agenda y odontograma con react-odontogram). React 19 + Vite + Hono + Cloudflare D1. **Muy parecido a nuestro stack.** | 🌐 + ☁️ | ✅ MIT | 23 / 2026-10-20 |
| [gaudot/SlicerDentalSegmentator](https://github.com/gaudot/SlicerDentalSegmentator) | Segmentación de CBCT dental (dientes, maxilar, mandíbula y canal mandibular) con nnU-Net. Es una extensión de 3D Slicer; el modelo se puede llevar a un servidor. | ☁️ | ✅ Apache-2.0 (código). 🔍 Pesos en Zenodo: licencia no verificada. | 197 / 2026-05-22 |
| **Rehabilitación y fisioterapia** | | | | |
| [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) | Estimación de pose y manos en navegador (WASM/WebGL) para medir rango de movimiento y contar repeticiones de ejercicios. | 🌐 | ✅ Apache-2.0 | 37.4k / 2026-10-23 |

### 4. Estándares, interoperabilidad y soporte a decisiones clínicas

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [aehrc/smart-forms](https://github.com/aehrc/smart-forms) | Renderer **React** de FHIR Questionnaire (SDC: enableWhen, cálculos, prellenado) de CSIRO. Demo: smartforms.csiro.au | 🌐 | ✅ Apache-2.0 | 63 / 2026-10-23 |
| [lhncbc/lforms](https://github.com/lhncbc/lforms) | LHC-Forms de la NLM: Web Component que renderiza FHIR Questionnaire. Demo: lhcforms.nlm.nih.gov | 🌐 | ✅🔍 Términos propios de NLM (uso libre). El contenido LOINC o UCUM incluido tiene sus propios términos. | 125 / 2026-10-20 |
| [cds-hooks/sandbox](https://github.com/cds-hooks/sandbox) | Sandbox para probar servicios **CDS Hooks** (`patient-view`, `order-select`). Hospedado en sandbox.cds-hooks.org | 🌐 | ✅ Apache-2.0 | 43 / 2026-10-02 |
| [cqframework/cql-execution](https://github.com/cqframework/cql-execution) | Motor **CQL** en JavaScript: reglas clínicas estándar que corren en navegador o Node. | 🌐 / ☁️ | ✅ Apache-2.0 | 84 / 2026-10-09 |
| [smart-on-fhir/client-js](https://github.com/smart-on-fhir/client-js) | Cliente oficial SMART on FHIR (OAuth2 launch) para apps web. | 🌐 | ✅ Apache-2.0 | 355 / 2026-10-21 |
| [smart-on-fhir/growth-chart-app](https://github.com/smart-on-fhir/growth-chart-app) | App SMART de **curvas de crecimiento pediátricas** (CDC/OMS). | 🌐 | ✅ Apache-2.0 | 71 / 2024-02-08 |
| [medplum/medplum](https://github.com/medplum/medplum) | Plataforma FHIR completa: servidor, auth, bots y **componentes React** (incluye un renderer de Questionnaire). | ☁️ + 🌐 | ✅ Apache-2.0 | 2.8k / 2026-10-23 |
| [hapifhir/hapi-fhir](https://github.com/hapifhir/hapi-fhir) | Servidor FHIR de referencia en Java. | ☁️ | ✅ Apache-2.0 | 2.4k / 2026-10-22 |
| [ehrbase/ehrbase](https://github.com/ehrbase/ehrbase) | Servidor clínico **openEHR** (CDR). | ☁️ | ✅ Apache-2.0 | 386 / 2026-10-16 |
| [openEHR/archie](https://github.com/openEHR/archie) | Librería openEHR (ADL2, arquetipos y plantillas) en Java. | ☁️ | ✅ Apache-2.0 | 71 / 2026-10-20 |
| [medblocks/medblocks-ui](https://github.com/medblocks/medblocks-ui) | Web Components para formularios openEHR y FHIR. | 🌐 | ✅ Apache-2.0 | 74 / 2025-04-29 |
| [IHTSDO/snowstorm-lite](https://github.com/IHTSDO/snowstorm-lite) | Servidor de terminología FHIR **SNOMED CT** de baja memoria. | ☁️ | ✅ Apache-2.0 (código). ⚠️ **El contenido SNOMED CT requiere licencia**: confirmar el estatus de México con SNOMED International. | 38 / 2026-09-18 |
| [pacharanero/clincalc](https://github.com/pacharanero/clincalc) | **104 calculadoras clínicas** con referencias y pruebas contra vectores publicados (CHA2DS2-VASc, eGFR, NEWS2, CURB-65, PHQ-9, SOFA y otras). CLI y API REST local en Rust. | ☁️ | ⚠️ AGPL-3.0 (cada calculadora registra su propia licencia en `LICENSES/`) | 5 / 2026-10-20 |
| [alexgoodell/open-med-calc](https://github.com/alexgoodell/open-med-calc) | API FastAPI con pocas calculadoras (MELD, MELD-Na, Caprini, Wells DVT, PSI/PORT). | ☁️ | ✅ MIT | 22 / 2025-12-24 |

### 5. Plataformas, portales de pacientes y datos de demostración

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [ohcnetwork/care_fe](https://github.com/ohcnetwork/care_fe) | Frontend **React** de CARE, un EMR open source (Digital Public Good) muy activo. Referencia de UX hospitalaria. | 🌐 | ✅ MIT | 663 / 2026-10-22 |
| [beda-software/fhir-emr](https://github.com/beda-software/fhir-emr) | EMR React 100% FHIR con formularios SDC. | 🌐 + ☁️ | ✅ MIT | 132 / 2026-10-20 |
| [masslight/ottehr](https://github.com/masslight/ottehr) | EHR y telemedicina sobre Medplum: registro de pacientes, sala de espera virtual y consulta. | 🌐 + ☁️ | ✅ MIT | 340 / 2026-10-21 |
| [openmrs/openmrs-esm-core](https://github.com/openmrs/openmrs-esm-core) | Framework de microfrontends de OpenMRS 3 (React). | 🌐 | ✅ MPL-2.0 (copyleft débil por archivo) | 100 / 2026-10-21 |
| [fastenhealth/fasten-onprem](https://github.com/fastenhealth/fasten-onprem) | Expediente personal de salud (PHR) auto-hospedado que agrega datos FHIR. | ☁️ + 🌐 | ⚠️ GPL-3.0 | 2.8k / 2026-02-12 |
| [is81/sig](https://github.com/is81/sig) | **PWA de recordatorios de medicamentos** multiusuario con Web Push (incluye iOS PWA). Demo: is81.net/sig. Para Android nativo: [Futsch1/medTimer](https://github.com/Futsch1/medTimer) (MIT, 639⭐). | 🌐 + ☁️ | ✅ MIT | 2 / 2026-08-19 (muy pequeño) |
| [jitsi/jitsi-meet](https://github.com/jitsi/jitsi-meet) | Videollamada para teleconsulta, embebible con un iframe o la API externa. | ☁️ + 🌐 | ✅ Apache-2.0 | 30.1k / 2026-10-24 |
| [synthetichealth/synthea](https://github.com/synthetichealth/synthea) | Genera **pacientes sintéticos** en FHIR, C-CDA y CSV. Ideal para demos sin datos reales. | ☁️ | ✅ Apache-2.0 | 3.4k / 2026-10-21 |
| [openfoodfacts/openfoodfacts-server](https://github.com/openfoodfacts/openfoodfacts-server) | Base de productos alimenticios (incluye México), con API pública y Nutri-Score. | ☁️ (API) | ⚠️ AGPL-3.0 (software). 🔍 Datos: "open data" (ODbL según el proyecto; confirmar). | 1.2k / 2026-10-24 |

> **Verificador de síntomas para pacientes:** no recomiendo ninguno open source. No encontré proyectos mantenidos y validados clínicamente, y en México representaría un riesgo regulatorio. Es mejor usar **triage por cuestionarios FHIR** (smart-forms) con reglas revisadas por médicos.

### 6. Demos impresionantes en navegador (IA, WebGPU y anatomía)

| Repo (link) | Para qué sirve | Dónde corre | Licencia | ⭐ / último commit |
|---|---|---|---|---|
| [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | `onnxruntime-web` con backends WebGPU, WASM y WebNN. Sirve para correr en el navegador modelos exportados (ECG, segmentación). | 🌐 | ✅ MIT | 22.2k / 2026-10-23 |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | Modelos de Hugging Face en navegador (WebGPU): Whisper para dictado clínico, embeddings y clasificación de imágenes. | 🌐 | ✅ Apache-2.0 | 16.4k / 2026-10-22 |
| [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | LLM local en el navegador con WebGPU (resúmenes de notas sin enviar datos a la nube). | 🌐 | ✅ Apache-2.0 (los pesos de cada LLM tienen su propia licencia) | 19.3k / 2026-10-11 |
| [LluisV/Z-Anatomy](https://github.com/LluisV/Z-Anatomy) | Atlas anatómico 3D completo (proyecto Unity con modelos .blend y FBX). Se puede exportar a glTF para three.js o WebXR. No hay versión web en el repo. | Assets | ⚠️ CC BY-SA 4.0 | 402 / 2024-12-25 |

---

## Recursos fuera de GitHub (verificados parcialmente)

| Recurso | Uso | Licencia / estado |
|---|---|---|
| **WHO ICD-11 ECT** (npm `@whoicd/icd11ect` v1.8.0, publicado el 2026-03-20) | Buscador y codificador de **CIE-11 en español** embebible (tiene ejemplos para React, Angular y Vue). Puede apuntar a la API de la OMS o a un contenedor local. | ✅ Uso permitido en software (leí el `license.pdf` del paquete). El contenido es **CC BY-ND 3.0 IGO**: no se permiten "adaptaciones", y los mapeos o traducciones requieren un acuerdo aparte con la OMS. |
| **NIH 3D** (3d.nih.gov) | Modelos 3D de corazón. Ejemplos: 3DPX-011381 (CC-BY) y 3DPX-022787 (dominio público). 3DPX-000900 es CC-BY-NC. | ✅ o ⛔ según cada modelo: revisar el campo "Licensing" de cada entrada. |
| **Tabla de composición de alimentos extendida 2019** (INCMNSZ vía CONABIO/SiAgroBD) | El equivalente abierto más cercano al SMAE (3,928 alimentos mexicanos). | 🔍 No pude abrir el sitio para confirmar la licencia. **El SMAE no es open data.** |
| **Datasets de angiografía** citados por CathMaster: CADICA (Mendeley, CC BY 4.0) y CoronaryDominance (Hugging Face, CC0) | Entrenamiento o demos de angiografía. | ✅ (licencias tomadas del ATTRIBUTION.md del repo; conviene confirmarlas en la fuente) |

**No encontré con suficiente confianza:**
- Un repo oficial de plantillas RadReport o MRRT en GitHub. Hay que usar la API de radreport.org.
- Una app web open source de audiometría tonal confiable.
- Un modelo dermatológico con licencia comercial.
- Un catálogo CIE-10 de la DGIS en JSON con licencia clara.
- Por eso no los incluí en las tablas.

---

## Top 10 para integrar ya en MediSuite

1. **[aehrc/smart-forms](https://github.com/aehrc/smart-forms) (Apache-2.0):** usar `@aehrc/smart-forms-renderer` en React para renderizar historia clínica, PHQ-9 y triage como FHIR Questionnaire. Las respuestas se guardan como QuestionnaireResponse.
2. **[medplum/medplum](https://github.com/medplum/medplum) (Apache-2.0):** backend FHIR auto-hospedado con auth y componentes React. Ahorra meses frente a construir la API de expediente desde cero. Alternativa: HAPI FHIR.
3. **WHO ICD-11 ECT (`@whoicd/icd11ect`):** campo de diagnóstico con búsqueda CIE-11 en español dentro de la nota clínica. Conviene un contenedor local de la API de la OMS para no depender de internet.
4. **[biomathcode/react-odontogram](https://github.com/biomathcode/react-odontogram) (MIT):** módulo dental en una tarde. Ver cómo lo integra [clawnify/open-dentist](https://github.com/clawnify/open-dentist), que usa nuestro mismo stack.
5. **[dcmjs-ecg](https://github.com/PantelisGeorgiadis/dcmjs-ecg) + [sierra-ecg-tools](https://github.com/sixlettervariables/sierra-ecg-tools) (MIT):** visor de ECG en navegador para DICOM Waveform y XML de Philips, con papel milimétrico. Los trazos sintéticos de prueba pueden venir de SeraKah-1 (MIT).
6. **[knopkem/dicomweb-pacs](https://github.com/knopkem/dicomweb-pacs) (MIT) + [Kitware/VolView](https://github.com/Kitware/VolView) (Apache-2.0):** PACS DICOMweb de desarrollo, más un visor 3D o volumétrico abierto desde un estudio. Ideal para el demo de angio-TC.
7. **[cqframework/cql-execution](https://github.com/cqframework/cql-execution) + [CDS Hooks](https://github.com/cds-hooks/sandbox) (Apache-2.0):** alertas clínicas (por ejemplo, interacciones o metas de control de HbA1c y presión arterial) como servicios CDS Hooks que la UI consulta en `patient-view` y `order-select`.
8. **[smart-on-fhir/client-js](https://github.com/smart-on-fhir/client-js) + [growth-chart-app](https://github.com/smart-on-fhir/growth-chart-app) (Apache-2.0):** abrir MediSuite como lanzador SMART. La primera app embebida serían las curvas de crecimiento pediátricas.
9. **[onnxruntime-web](https://github.com/microsoft/onnxruntime) / [transformers.js](https://github.com/huggingface/transformers.js) siguiendo el patrón de [brainchop](https://github.com/neuroneural/brainchop) (MIT):** demo de "IA local, sin subir datos", por ejemplo dictado clínico con Whisper o un clasificador de ECG exportado a ONNX. Hay que confirmar la licencia de los pesos.
10. **[synthetichealth/synthea](https://github.com/synthetichealth/synthea) (Apache-2.0):** poblar el ambiente de demo y QA con miles de pacientes FHIR sintéticos, ajustando nombres y localidades a México.

**Siguientes en la lista:**
- MediaPipe para rango de movimiento en rehabilitación.
- NeuroKit como microservicio de HRV y análisis de ECG.
- ECG-Digitiser para digitalizar fotos de ECG en papel. Es BSD y el ganador del Challenge 2024, pero requiere GPU o servidor.
- TotalSegmentator solo con las tareas abiertas, a menos que se compre la licencia de coronarias.
