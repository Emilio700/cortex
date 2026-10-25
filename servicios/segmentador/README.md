# Segmentador de Cortex

Convierte una serie de tomografía en mallas 3D del paciente para Neuro 3D:
vértebras C1–L5 y sacro etiquetados, médula y conducto vertebral (aproximado).
Corre aparte del backend, en el perfil `ia` de Docker Compose.

> Reconstrucción automática con software de investigación. No es un dispositivo
> médico ni un diagnóstico: el médico la revisa contra las imágenes originales.

## Contrato

- `GET /health` → `{"estado": "ok", "modo": "falso" | "real", "motor", "version_motor", ...}`
- `POST /segmentar?region=columna&modalidad=CT` con la serie en el cuerpo (ZIP de
  DICOM, NIfTI o NIfTI comprimido). Responde `model/gltf-binary`:
  - un nodo por estructura, con `name` = id del catálogo de Neuro 3D
    (`vertebra-L5`, `sacro`, `medula-espinal`, `conducto-vertebral`) y
    `extras.nombre` en español;
  - **milímetros** y sistema del paciente **LPS** (+x izquierda, +y posterior,
    +z superior), declarados en `asset.extras.cortex`. glTF supone metros y +Y
    arriba: un visor genérico lo verá acostado y grande, a propósito;
  - cabeceras `X-Cortex-Motor`, `X-Cortex-Motor-Version`, `X-Cortex-Estructuras`
    y `X-Cortex-Sintetico`.
- Errores con `detail` en español: 422 (la serie no sirve: motivo), 503 (falta el
  motor), 500 (el motor falló).

## Modos

- `SEGMENTADOR_FALSO=1`: columna sintética determinista, sin torch ni pesos. Para
  pruebas y para equipos sin GPU. Lo dice en `/health`, en la cabecera y en el GLB.
- Real: dcm2niix → TotalSegmentator (tarea `total`, `roi_subset` de columna) →
  marching cubes (scikit-image) con suavizado y tope de triángulos.
  `SEGMENTADOR_RAPIDO=1` (por omisión) usa el modelo de 3 mm, que en CPU tarda
  minutos; `SEGMENTADOR_DISPOSITIVO=gpu` si hay CUDA.

Sólo se segmenta TC por ahora. La RM de columna (tarea abierta `vertebrae_mr`) y el
encéfalo quedan para la fase 2: hoy responden 422 con el motivo.

## Licencias

| Pieza | Licencia |
|---|---|
| TotalSegmentator 2.18.0 y los pesos de la tarea `total` | Apache-2.0 (tarea abierta) |
| nnU-Net v2 | Apache-2.0 |
| dcm2niix 1.0.20260724 | BSD-2 (partes de dominio público y MIT); «not a clinical tool» |
| scikit-image, SciPy, NumPy / nibabel | BSD-3 / MIT |

No se usan tareas con licencia (`vertebrae_body`, `brain_structures`, etc.).

Cita del modelo: Wasserthal J. et al. *TotalSegmentator: Robust Segmentation of
104 Anatomic Structures in CT Images.* Radiology: Artificial Intelligence, 2023.
El conjunto de datos de entrenamiento es CC BY 4.0.

## Pruebas

```
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest -q
```

Las pruebas corren en modo falso; el modo real no tiene pruebas automáticas.
