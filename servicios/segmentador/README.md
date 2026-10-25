# Segmentador de Cortex

Convierte una serie de tomografía (o resonancia de columna) en mallas 3D del
paciente para Neuro 3D: vértebras C1–L5 y sacro etiquetados, médula y conducto
vertebral (aproximado); y, como regiones extra, discos por nivel, cráneo,
carótidas y yugulares, y hemorragia intracerebral. Corre aparte del backend, en
el perfil `ia` (CPU) o `ia-gpu` (GPU NVIDIA) de Docker Compose.

> Reconstrucción automática con software de investigación. No es un dispositivo
> médico ni un diagnóstico: el médico la revisa contra las imágenes originales.

## Contrato

- `GET /health` → `{"estado": "ok", "modo": "falso" | "real", "motor",
  "version_motor", "dispositivo": "cuda" | "cpu" | "consultando" | "ninguno",
  "gpu": "NVIDIA GeForce RTX 4060 Laptop GPU" | null, "vram_total_mb", "torch",
  "cuda", "rapido", "respaldo", "malla", "regiones": [...]}`. El dispositivo lo
  dice una sonda de torch que corre en un proceso aparte al arrancar (unos
  segundos: mientras, `"consultando"`).
- `POST /segmentar?region=…&modalidad=CT|MR` con la serie en el cuerpo (ZIP de
  DICOM, NIfTI o NIfTI comprimido). Responde `model/gltf-binary`:
  - un nodo por estructura, con `name` = id del catálogo de Neuro 3D y
    `extras.nombre` en español;
  - **milímetros** y sistema del paciente **LPS** (+x izquierda, +y posterior,
    +z superior), declarados en `asset.extras.cortex`, junto con región, tareas,
    licencia, dispositivo, resolución (`normal (1.5 mm)` / `rapida (3 mm)`),
    intentos, acabado de la malla y, si la tarea lo pide, un `aviso`;
  - cabeceras `X-Cortex-Motor`, `X-Cortex-Motor-Version`, `X-Cortex-Estructuras`,
    `X-Cortex-Sintetico`, `X-Cortex-Tiempos` (por etapa: `entrada`, `dcm2niix`,
    `segmentacion`, `lectura`, `mallas`, `glb`, `total`, en segundos) y, en modo
    real, `X-Cortex-Dispositivo`, `X-Cortex-Resolucion`, `X-Cortex-Intentos` y
    `X-Cortex-VRAM-Pico-MB`.
- Errores con `detail` en español: 422 (la serie no sirve o no salió ninguna
  estructura: motivo), 503 (falta el motor, la GPU, la VRAM o la RAM; la
  cabecera `X-Cortex-Falta` dice cuál: `sin_gpu`, `sin_vram`, `sin_ram`,
  `tiempo`), 500 (el motor falló).
- **Nunca** responde un GLB vacío como éxito: si no salió nada es un 422 con el
  motivo de la región (p. ej. «No se encontró columna en el estudio…»).

## Regiones

| `region` | `modalidad` | Tarea(s) de TotalSegmentator | Ids |
|---|---|---|---|
| `columna` | `CT` | `total` (`roi_subset` de columna) | `vertebra-C1`…`vertebra-L5`, `sacro`, `medula-espinal`, `conducto-vertebral` |
| `columna` | `MR` | `vertebrae_mr` | vértebras, `sacro`, `conducto-vertebral` (sin médula) |
| `discos` | `CT` | `total` (vértebras) + `vertebrae_body` | `disco-C2-C3`…`disco-L5-S1` (+ vértebras); `disco-sin-nivel` si no se puede nombrar |
| `craneo` | `CT` | `craniofacial_structures` | `craneo`, `mandibula`, `dientes`, `seno-maxilar`, `seno-frontal` |
| `vasos-cuello` | `CT` | `headneck_bones_vessels` | `carotida-interna-izq/-der`, `yugular-interna-izq/-der` |
| `hemorragia` | `CT` | `cerebral_bleed` | `hemorragia-intracerebral` (con aviso) |

- Los discos llegan como una sola clase; se separan por componentes y cada uno se
  nombra por las dos vértebras más cercanas. Si no son vecinas, va a
  `disco-sin-nivel`: mejor sin nombre que con uno equivocado.
- **Hemorragia:** el modelo se entrenó con pocos casos. El GLB lleva el aviso y,
  si no encuentra nada, responde 422 «…no la descarta…», no un modelo vacío.
- `encefalo` responde 422: la tarea abierta que lo haría no existe
  (`brain_structures` pide licencia). No se usan `brain_structures` ni
  `brain_aneurysm` (CC BY-NC).
- En modo falso sólo hay columna (sintética).

## Modos y variables

| Variable | Por omisión | Qué hace |
|---|---|---|
| `SEGMENTADOR_FALSO` | `0` | `1`: columna sintética determinista, sin torch ni pesos. Lo dice en `/health`, en la cabecera y en el GLB. |
| `SEGMENTADOR_DISPOSITIVO` | `cpu` (`gpu` en `Dockerfile.gpu`) | Dónde corre la red. |
| `SEGMENTADOR_RAPIDO` | `1` (`0` en `ia-gpu`) | Modelo de 3 mm (`--fast`) en vez del de 1.5 mm. Sólo en tareas que lo tienen (`total`). |
| `SEGMENTADOR_RESPALDO` | `rapido` | Si falta un recurso: `rapido` repite con 3 mm tras quedarse sin VRAM o RAM; `cpu` repite en CPU si no hay GPU (o si ni el rápido cupo en la VRAM). Lista separada por comas; `ninguno` lo apaga. Sin RAM no se repite en CPU: usaría la misma RAM. |
| `SEGMENTADOR_MALLA` | `refinada` | `clasica` vuelve al mallado de la primera versión. |
| `SEGMENTADOR_TIEMPO_LIMITE` | `1500` | Segundos por corrida del motor (el backend espera 1800). |

## Cómo corre el motor

1. `dcm2niix` convierte el ZIP en NIfTI (se queda con el volumen más grande).
2. TotalSegmentator corre en **un proceso aparte** (`app/ejecutor.py`), en su
   propia sesión:
   - si el kernel lo mata por memoria, muere ese proceso y no el servicio, que
     responde 503 «se quedó sin memoria RAM» y sigue atendiendo;
   - al terminar se mata el grupo entero, para que no queden procesos huérfanos
     de nnU-Net con gigas tomados;
   - nnU-Net predice **sin procesos auxiliares** (`predict_from_files_sequential`):
     cada proceso *spawn* vuelve a cargar torch (~650 MB) y con un estudio a la
     vez no aceleran nada;
   - la VRAM se libera al salir y su pico se reporta.
3. Mallas: *marching cubes* (scikit-image) y, con el acabado `refinada`,
   suavizado **Taubin** (trimesh, 20 iteraciones, λ 0.5 / μ 0.53, en milímetros)
   y decimación cuádrica (fast-simplification) hasta 8000 triángulos por
   estructura (60 000 el cráneo, 20 000 mandíbula y dientes).

## GPU (`ia-gpu`)

Requisitos: GPU NVIDIA con **8 GB de VRAM** (es lo probado: RTX 4060 Laptop),
driver con CUDA 12.6 o más (≥ 560; probado con 610.60), Docker con el NVIDIA
Container Toolkit (Docker Desktop + WSL2 en Windows lo trae) y **al menos 6 GB de
RAM libres para el contenedor** (ver «Medido»).

```
docker compose --profile ia-gpu up -d segmentador-gpu      # en lugar de «segmentador»
curl http://127.0.0.1:8030/health                         # "dispositivo": "cuda", "gpu": "NVIDIA …"
docker compose --profile ia-gpu down                      # no borra el volumen de pesos
```

- Mismo puerto (`SEGMENTADOR_PORT`, 8030) y mismo nombre en la red interna
  (alias `segmentador`) que el de CPU: `SEGMENTADOR_URL` no cambia. No levantes
  los dos a la vez.
- Los pesos se bajan la primera vez que se usa cada tarea y quedan en el volumen
  `cortex_segmentador_pesos` (`TOTALSEG_HOME_DIR=/pesos`,
  `TOTALSEG_WEIGHTS_PATH=/pesos/nnunet/results`). `total` rápido: 317 MB (modelos
  297 de 3 mm y 298 de 6 mm para recortar); `total` normal y cada tarea extra
  bajan ~250–300 MB más.
- `shm_size: 2gb`: nnU-Net pasa datos por memoria compartida.

### Medido en esta laptop (RTX 4060 Laptop 8 GB, 15.7 GB de RAM, Docker con 7.6 GB)

Estudio: TC de cuello a pelvis del conjunto de TotalSegmentator (`s0923`, partición
de prueba, 281 × 281 × 500 vóxeles de 1.5 mm, convertido a 500 cortes DICOM,
47 MB en ZIP).

| Qué | Resultado |
|---|---|
| `/health` en el contenedor GPU | `"dispositivo": "cuda"`, `"gpu": "NVIDIA GeForce RTX 4060 Laptop GPU"`, `vram_total_mb` 8188 |
| Descarga de pesos de `total --fast` (primera vez) | 317 MB, dentro de los 133 s de la primera petición |
| Recorte con el modelo de 6 mm, en GPU | remuestreo 0.07 s, predicción 9.5 s (incluye cargar el modelo), 12.0 s en total |
| VRAM pico (nvidia-smi del host) | 533–807 MiB en las corridas rápidas |
| Segmentación rápida completa con el contenedor limitado a **3 GB** | **no cupo**: el kernel mató al motor; el servicio respondió 503 `sin_ram` en 30–36 s y siguió vivo |
| Con **4.5 GB** | Windows bajó de 2.6 a 0.87 GB libres en 15 s y se detuvo a propósito |
| RSS de un proceso con torch y CUDA cargados | ~2.7–3.3 GB antes de tocar el estudio |
| `dcm2niix` del ZIP (500 cortes), en CPU | 15.0–15.6 s |
| Lectura de 27 máscaras + mallas refinadas + GLB | 2.2 s + 9.5 s + 0.02 s; GLB de 4.9 MB, 27 mallas |

**No se midió** el tiempo de la segmentación completa en GPU ni en CPU, ni el
modelo de 1.5 mm, ni las tareas extra: con la RAM que quedaba libre en el equipo
(2–3 GB fuera de Docker) el motor no cabe. Para medirlo hace falta cerrar otras
cargas o subir la memoria de Docker (`.wslconfig`, `memory=10GB`) en un equipo
con 16 GB libres para eso, y repetir con `scripts` de la sección siguiente.

### Cómo medir

```
H=<carpeta con el ZIP>
docker compose --profile ia-gpu up -d segmentador-gpu
time curl -s -o columna.glb -D cabeceras.txt -X POST \
  "http://127.0.0.1:8030/segmentar?region=columna&modalidad=CT" \
  -H "Content-Type: application/octet-stream" --data-binary @$H/serie.zip
grep -i x-cortex cabeceras.txt        # tiempos por etapa, dispositivo, VRAM pico
nvidia-smi --query-gpu=memory.used --format=csv -lms 500   # en otra terminal
docker stats cortex_segmentador_gpu                        # RAM
```

Para comparar con CPU o con el modelo rápido, recrea el contenedor con
`SEGMENTADOR_DISPOSITIVO=cpu` o `SEGMENTADOR_RAPIDO=1`.

## Calidad de malla

Sobre las máscaras de referencia de la misma TC (27 estructuras, de C1 al sacro):

| | Clásica (tope 12 000) | Refinada (tope 8000) |
|---|---|---|
| Triángulos | 203 940 | 203 288 |
| GLB | 4.92 MB | 4.90 MB |
| Volumen de la malla / volumen de la máscara (mediana) | 0.971 | 0.984 |
| Médula: volumen conservado | **0.44** (la gaussiana y el paso 3 la adelgazan) | **0.99** |
| L3: volumen conservado | 0.96 | 0.99 |
| Ángulo entre caras vecinas, p95 (escalones) | 39° | 29° |

Con el mismo tope de 8000, la clásica baja a 111 366 triángulos y 2.7 MB, con
p95 de 52° y médula al 0.57. La refinada tarda lo mismo (~9 s la columna
completa en CPU).

## Licencias

| Pieza | Licencia |
|---|---|
| TotalSegmentator 2.18.0 y los pesos de `total`, `vertebrae_mr`, `vertebrae_body`, `craniofacial_structures`, `headneck_bones_vessels`, `cerebral_bleed` | Apache-2.0 (tareas abiertas; verificado con `totalseg_info --list-tasks` en 2.18.0 y en su README) |
| nnU-Net v2 | Apache-2.0 |
| torch / torchvision | BSD-3 |
| dcm2niix 1.0.20260724 | BSD-2 (partes de dominio público y MIT); «not a clinical tool» |
| trimesh 5.2.0, fast-simplification 0.2.0 | MIT |
| scikit-image, SciPy, NumPy / nibabel | BSD-3 / MIT |

No se usan tareas con licencia (`brain_structures` y demás marcadas «yes» en
`totalseg_info`) ni `brain_aneurysm` (CC BY-NC 4.0).

Citas: Wasserthal J. et al. *TotalSegmentator: Robust Segmentation of 104
Anatomic Structures in CT Images.* Radiology: Artificial Intelligence, 2023. Los
artículos de cada tarea extra están en el README de TotalSegmentator.

Datos de prueba: *TotalSegmentator dataset v2.0.1* (Zenodo, DOI
10.5281/zenodo.10047292), **CC BY 4.0**; caso `s0923` (TC, partición de prueba) y
sus máscaras de referencia. Se bajó sólo ese caso del ZIP de 23.6 GB con
peticiones HTTP de rango. No se usaron datos de pacientes de Cortex.

## Imagen

`Dockerfile.gpu` (torch 2.7.1+cu126 en su propia capa) debería pesar ~8–9 GB
descomprimida: ~5.4 GB de torch y las bibliotecas CUDA 12 y ~2 GB del motor
(VTK, pyarrow, SimpleITK, triton…). Para hacerla más ligera:

- Fijar todo el árbol con `constraints-motor.txt` (`pip freeze` de una imagen
  probada): sin eso, cualquier dependencia sin versión puede arrastrar otro
  torch (pasó con torchvision: +3 GB de CUDA 13).
- No meter los pesos en la imagen (`DESCARGAR_PESOS=0`, ya es así): van al volumen.
- Base `python:slim` (ya es así), no las imágenes `nvidia/cuda:*-devel`: las
  bibliotecas de CUDA vienen en las ruedas de torch y el driver lo pone el host.
- Quitar dependencias de TotalSegmentator que el servicio no usa (`fury`/VTK,
  `xvfbwrapper`, `imgkit`, `dipy`) instalando el motor con `--no-deps` y una
  lista explícita; ahorra ~0.5 GB, pero hay que probar cada actualización.

## Pruebas

```
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest -q
```

Corren sin torch ni GPU: modo falso, y modo real con el motor sustituido por uno
que escribe la columna sintética o falla como fallaría el real (sin GPU, sin
VRAM, sin RAM, sin estructuras). Cubren respaldo, mensajes, regiones extra,
nombres de los discos y calidad de malla (una esfera: no encoge y quita
escalones).
