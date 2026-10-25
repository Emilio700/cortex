# Modelo 3D desde TC

## Por qué

Neuro 3D hoy sólo enseña un modelo **esquemático**: sirve para explicar qué es una
raíz L5, pero no dónde está la lesión de *este* paciente. El neurocirujano ya
tiene en Cortex la tomografía del paciente (visor DICOM, DESIGN §4.9). Si con un
botón esa tomografía se convierte en mallas 3D (vértebras C1–S1 etiquetadas,
conducto y médula), la explicación en consulta y la planeación se hacen sobre la
anatomía real, en la misma pantalla que ya conoce.

## Qué cambia

- **Servicio `servicios/segmentador/`** (aparte del backend, perfil `ia` de
  Docker Compose, imagen con versión fija). App FastAPI pequeña:
  - `POST /segmentar?region=columna` recibe una serie (ZIP de DICOM o NIfTI),
    convierte con `dcm2niix`, segmenta con **TotalSegmentator** (sólo tareas de
    licencia abierta) y genera mallas con *marching cubes* (scikit-image),
    suavizadas y simplificadas, en **GLB**: milímetros, sistema del paciente
    **LPS**, un nodo por estructura con su etiqueta (`vertebra-L5`, `sacro`,
    `medula-espinal`, `conducto-vertebral`).
  - `GET /health`.
  - `SEGMENTADOR_FALSO=1`: mallas sintéticas deterministas, sin torch ni GPU, para
    pruebas y equipos de desarrollo.
- **Backend**
  - Tabla `imaging_modelos_3d` (migración `2026_10_27_0053`): estudio, serie,
    estado `pendiente | procesando | listo | fallo`, motivo del fallo, ruta del
    GLB en el almacenamiento, motor y versión, quién lo pidió, fechas, y quién lo
    revisó (`confirmado_por`, `confirmado_en`).
  - `POST /imaging/studies/{id}/series/{sid}/modelo-3d` encola el trabajo en un
    hilo del proceso web; `GET` del mismo recurso da el estado; `GET
    /imaging/modelos-3d/{id}/mallas` descarga el GLB; `GET
    /patients/{id}/modelos-3d` lista los del paciente; `POST
    /imaging/modelos-3d/{id}/revisado` registra que el médico lo revisó.
  - Todo detrás de `require_modulo("neuro3d_paciente")` (apagado → 404), permiso
    `clinical_images.read` para ver y **`neuro3d.generar_modelo`** (nuevo) para
    generar o marcar revisado, alcance clínico del paciente y bitácora.
  - Cliente HTTP al segmentador con tiempo límite y errores en español.
  - El módulo `neuro3d_paciente` pasa a `disponible=True`.
- **Frontend**
  - Visor: botón «Generar modelo 3D» en estudios TC o RM, con el estado que
    confirma el servidor («Procesando…», «Listo», «No se pudo: motivo»).
  - Neuro 3D con paciente: selector **«Origen del modelo»** (esquemático,
    radiografía, TC) con el contrato común `dominio/origenModelo.ts`; el aviso
    visible es el del origen elegido. La capa del paciente es una
    `CapaAnatomica` que carga el GLB con `GLTFLoader` y registra cada malla con su
    id del catálogo, así tocar una raíz enciende **la vértebra del paciente**.
- Recorrido guiado, DESIGN §4.14 y CHANGELOG.

## Fuera de alcance (fase 2)

- Encéfalo y ventrículos desde TC/RM. El servicio ya recibe `region`, pero sólo
  `columna` está implementada; `encefalo` responde «aún no disponible».
- RM de columna con vértebras por nivel (tarea abierta `vertebrae_mr`): se deja
  anotada; hoy una RM usa la misma ruta que la TC y puede fallar con motivo.
- Registro fino contra el modelo esquemático (raíces del atlas sobre la columna
  del paciente): hoy se alinea por escala fija y traslación de los centros de las
  vértebras en común.

## Riesgos clínicos y regulatorios

- **Es una reconstrucción automática, no un diagnóstico.** Nada en la interfaz
  la presenta como hallazgo. El aviso del origen `tc` lo dice siempre: «Revísala
  contra las imágenes originales antes de usarla para decidir». La captura lo
  lleva al pie.
- **Software de investigación.** TotalSegmentator y dcm2niix no son dispositivos
  médicos (la licencia de dcm2niix dice: «developed for research purposes only and
  is not a clinical tool»). Cortex no lo oculta: el motor y su versión quedan en
  la fila y se muestran junto al modelo. Usarlo como apoyo diagnóstico requeriría
  una evaluación regulatoria (COFEPRIS) que este cambio no hace.
- **Errores de etiqueta.** Una vértebra mal numerada (vértebra transicional,
  campo de visión parcial) haría que «L5» señale otra cosa. Por eso el médico
  marca el modelo como **revisado** y, hasta entonces, la pantalla dice que está
  sin revisar.
- **Nunca «listo» sin confirmación.** El botón refleja sólo lo que el servidor
  devolvió. Si el proceso web se reinicia a media segmentación, el trabajo queda
  en «procesando» y, pasado el tiempo límite, se marca como fallo con motivo; no
  se queda diciendo que avanza.
- **Datos del paciente fuera de Cortex.** La serie viaja al segmentador, que
  corre en el mismo servidor (red interna de Docker), no a un tercero. No guarda
  nada: trabaja en un directorio temporal que borra al terminar.

## Licencias verificadas (2026-10-25)

| Pieza | Licencia | Fuente |
|---|---|---|
| TotalSegmentator 2.18.0 (código) | Apache-2.0 | repositorio `wasserth/TotalSegmentator`, metadatos de PyPI |
| Pesos de la tarea `total` (y `total_mr`, `vertebrae_mr`) | Tareas abiertas: «Openly available for any usage (Apache-2.0 license)»; se descargan de los *releases* del repositorio, sin número de licencia | README, lista de tareas; `libs.py` (la rama abierta no lee `license_number`) |
| Tareas **no usadas** por licencia | `brain_structures`, `tissue_types`, `appendicular_bones`, `heartchambers_highres`, `coronary_arteries`, etc. requieren licencia (gratuita sólo para uso no comercial) | README |
| nnU-Net v2 (dependencia de TotalSegmentator) | Apache-2.0 | repositorio MIC-DKFZ/nnUNet |
| dcm2niix 1.0.20260724 | BSD de 2 cláusulas (partes de dominio público y MIT); «not a clinical tool» | `license.txt` del repositorio |
| scikit-image, SciPy, NumPy, nibabel | BSD-3 / BSD-3 / BSD-3 / MIT | sus repositorios |
| three.js `GLTFLoader` (ya instalado) | MIT | `three` 0.186.1 |

El conjunto de datos con que se entrenó `total` es CC BY 4.0; se cita en el
README del servicio.

## Impacto

- **Datos:** una tabla nueva; la migración sólo agrega y tiene `downgrade`. El GLB
  vive junto al estudio en el almacenamiento (`.../imaging/<uid>/modelos/`).
  Apagar el módulo no borra nada.
- **Permisos:** uno nuevo, `neuro3d.generar_modelo`, por omisión para el médico.
  La migración sube `permissions_version` para que las sesiones abiertas lo vean.
- **Infraestructura:** un contenedor más en el perfil `ia`. En CPU, una TC de
  columna tarda minutos; con GPU, segundos. Un solo trabajo a la vez por proceso
  web, para no tumbar la consulta.
