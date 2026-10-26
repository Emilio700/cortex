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

Dentro de Docker la segmentación completa **no cupo** en esta laptop (ni
reconstruir la imagen: el paso de torch deja la VM de WSL con ~5 GB y Windows bajó
a 167 MB disponibles). Se midió **nativo en Windows**: ver la sección siguiente.

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

## Nativo en Windows (laptops con poca RAM)

Mismo código, sin Docker: en una laptop de 16 GB, Docker Desktop paga dos veces
(la VM de WSL más torch y CUDA dentro de ella). Nativo sólo se paga el proceso.

```
.\correr_windows.ps1 -Instalar             # la primera vez (~6 GB en %LOCALAPPDATA%\cortex-segmentador)
.\correr_windows.ps1 -Puerto 8031          # resolución normal (1.5 mm)
.\correr_windows.ps1 -Puerto 8031 -Rapido  # sólo el modelo de 3 mm
```

- Python 3.12 (`py -3.12`) y el driver NVIDIA. torch 2.7.1+cu126 trae CUDA en su
  rueda; `dcm2niix` viene del paquete de PyPI con su binario de Windows.
- El venv y los pesos (`TOTALSEG_HOME_DIR`) van **fuera del repo**, que vive en
  OneDrive. venv: 6.1 GB. Pesos: `total` rápido 316 MB; `total` normal baja sus 5
  modelos (~105 s) la primera vez que se pide; con `vertebrae_body` y `vertebrae_mr`,
  2.0 GB en total.
- En la laptop de prueba el **8030 lo reserva Windows** (`http.sys`, «System»): el
  script lo detecta y pide otro puerto. Con 8031, en `backend/.env`:
  `SEGMENTADOR_URL=http://127.0.0.1:8031`.
- Escucha sólo en `127.0.0.1`: recibe estudios de pacientes sin autenticación propia.
- `OPENBLAS_NUM_THREADS=4`: con los 20 hilos de la laptop, el solo arranque del
  servicio comprometía 1.3 GB (búfer por hilo); con 4, 250 MB.

### Memoria en Windows: el límite es el compromiso, no la RAM libre

- torch + CUDA + TotalSegmentator comprometen ~1.5 GB antes de tocar el estudio.
- **La VRAM cuenta como memoria comprometida del proceso** (WDDM): 2 GB pedidos a
  la GPU suben 2 GB la memoria privada sin tocar la RAM física. El pico de VRAM de
  la corrida (2.7–3.9 GB) se suma al compromiso un instante.
- En las corridas, la RAM física del motor llegó a ~3.9 GB y el compromiso a ~6.7 GB;
  el margen de compromiso de Windows bajó hasta 282 MB con un archivo de paginación
  **fijo** (aquí, ~8 GB). Con el compromiso agotado Windows deja de dar memoria a
  cualquier programa. Conviene el archivo de paginación administrado por el sistema.

### Lo que hubo que corregir para que cupiera

- nnU-Net 2.8 abre un `Pool` de 12 procesos sólo para emparejar nombres de archivo;
  en Windows (spawn) cada uno vuelve a cargar torch: 14 procesos y 10.5 GB
  comprometidos antes de predecir. Ahora es una lista en el mismo proceso.
- TotalSegmentator 2.18 instala su `predict_from_files` (con procesos) al importar
  `totalsegmentator.nnunet` dentro de `totalsegmentator()`, y pisaba el secuencial
  del ejecutor. Ahora se importa antes de reemplazarlo.
- La salida del motor se lee en UTF-8: con cp1252, un carácter de `vertebrae_body`
  tumbaba la lectura y el servicio respondía 500 sin motivo.
- En Windows no hay grupo de sesión: al vencer el tiempo se mata el árbol del motor
  (`taskkill /T`); el `python.exe` del venv es un lanzador con el intérprete como hijo.
- Para instalar: `pip --no-cache-dir`. Con la caché HTTP, pip retuvo la rueda de
  torch (2.7 GB) en memoria al terminar de bajarla.

No hizo falta recortar el volumen: `roi_subset` de columna ya recorta con el modelo
de 6 mm (de 281 × 281 × 500 a 107 × 132 × 450 en `s0923`).

### Medido nativo (RTX 4060 Laptop 8 GB, 15.7 GB de RAM, Windows 11)

Estudio `s0923` en ZIP de 500 cortes DICOM, `POST /segmentar?region=…&modalidad=CT`,
GLB de mallas refinadas. RAM: procesos del segmentador muestreados cada 2 s.

| | Columna rápida (3 mm) | Columna normal (1.5 mm) | Discos (normal) |
|---|---|---|---|
| Total | **51.8 s** | **54.1 s** | 82.3 s |
| dcm2niix | 15.6 s | 14.3 s | 13.6 s |
| Segmentación (GPU) | 22.9 s | 27.5 s | 47.5 s (`total` 24.3 + `vertebrae_body` 23.2) |
| Lectura + mallas + GLB | 2.3 + 10.2 + 0.02 s | 2.3 + 9.4 + 0.02 s | 2.3 + 18.2 + 0.02 s |
| VRAM pico (torch) | 3878 MB | 2686 MB | 2948 MB |
| RAM física pico | 3.7 GB | 3.9 GB | 3.9 GB |
| Comprometida pico | 5.7 GB | 6.7 GB | 5.6 GB |
| Windows: disponible mínimo | 598 MB | 890 MB | 875 MB |
| Mallas / GLB | 27 / 4.8 MB | 27 / 4.9 MB | 47 (22 discos) / 5.4 MB |

- **Dice por estructura** contra las máscaras de referencia de `s0923` (la malla se
  voxeliza en la rejilla de la TC; 26 estructuras, el conducto no tiene referencia):
  - normal: mediana **0.985**; peores C4 0.949, médula 0.953, C1 0.962, C5 0.969;
  - rápida: mediana **0.863**; peores C1 0.777, C6 0.787, C4 0.797, C5 0.807;
  - piso del método (GLB hecho con las propias máscaras): mediana 0.998, mínimo 0.993.
- Discos: 22 de 23 niveles nombrados (C2-C3…L5-S1; faltó C3-C4), ninguno sin nivel.
- Punta a punta con el backend local (`SEGMENTADOR_URL` al 8031): «Sistema →
  Servicios» lo ve en línea, se activó `neuro3d_paciente` y el médico pidió el modelo
  de la única serie de la base local (resonancia de cráneo T1, 90 cortes; no había
  TC): `vertebrae_mr` 44.4 s, 48.2 s en total, estado «listo» con C1 y C2 (lo que
  alcanza el estudio), GLB servido por `/imaging/modelos-3d/{id}/mallas`.

### Cuánta memoria hace falta

- **Nativo, cómodo:** antes de empezar, ≥ 4.5 GB de RAM disponible y ≥ 7.5 GB de
  compromiso libre. En una laptop de 16 GB eso pide cerrar Docker Desktop, SQL Server
  y MySQL o tener el archivo de paginación administrado por el sistema; con 32 GB
  cabe con todo abierto.
- **En Docker:** súmale la VM de WSL (~2 GB) y torch dentro de ella: ≥ 12 GB para
  Docker en un equipo de 24–32 GB.

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
