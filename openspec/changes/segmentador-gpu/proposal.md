# Segmentador con GPU

## Por qué

El segmentador de `modelo-3d-desde-tc` se probó sólo en modo falso: en CPU, el
modelo de TotalSegmentator tarda minutos y el equipo de desarrollo no tenía disco
para torch. El consultorio sí puede tener una GPU NVIDIA (la laptop de desarrollo
tiene una RTX 4060 de 8 GB). Además, la investigación previa dejó cuatro
pendientes: la malla con escalones de vóxel, qué pasa cuando falta GPU o memoria,
la RM de columna y otras tareas abiertas útiles en neurocirugía.

## Qué cambia

- **Imagen GPU** `servicios/segmentador/Dockerfile.gpu` (torch 2.7.1+cu126,
  TotalSegmentator 2.18.0, versiones fijas y licencias anotadas) y servicio
  `segmentador-gpu` en Compose (perfil `ia-gpu`, reserva de GPU nvidia, mismo
  puerto y alias `segmentador`: `SEGMENTADOR_URL` no cambia). La de CPU queda
  igual, salvo fijar torchvision (sin eso pip trae otro torch).
- **Motor en un proceso aparte** (`app/ejecutor.py`), en su propia sesión: si se
  acaba la RAM muere ese proceso, no el servicio; nnU-Net predice sin procesos
  auxiliares; al terminar se mata el grupo.
- **Respaldo y errores** (`SEGMENTADOR_RESPALDO`): sin GPU, sin VRAM o sin RAM →
  503 con motivo en español y cabecera `X-Cortex-Falta`; si se configura, se
  repite con el modelo de 3 mm o en CPU. El GLB y las cabeceras dicen dispositivo,
  resolución e intentos. Nunca un GLB vacío como éxito.
- **`/health`** con dispositivo (`cuda`/`cpu`), nombre y VRAM de la GPU, versión de
  torch y CUDA, y regiones disponibles.
- **Regiones** con tareas abiertas (Apache-2.0, verificadas con `totalseg_info
  --list-tasks` en 2.18.0): `columna`+`MR` (`vertebrae_mr`), `discos`
  (`vertebrae_body` + vértebras de `total`, un disco por nivel `disco-L4-L5`),
  `craneo` (`craniofacial_structures`), `vasos-cuello` (`headneck_bones_vessels`)
  y `hemorragia` (`cerebral_bleed`, con aviso de modelo con pocos datos y 422 «no
  la descarta» si no encuentra nada). No se usan `brain_structures` (licencia) ni
  `brain_aneurysm` (CC BY-NC).
- **Malla refinada**: Taubin (trimesh, MIT) y decimación cuádrica
  (fast-simplification, MIT) después de *marching cubes*; tope de 8000 triángulos.
- Tiempos por etapa en `X-Cortex-Tiempos`.

## Fuera de alcance

- Frontend: Neuro 3D sigue pidiendo y mostrando sólo `columna`. Las regiones
  nuevas quedan listas en el servicio; mostrarlas (capas, colores, aviso de la
  hemorragia) es otro cambio.
- Backend: sin cambios. Una serie de RM ya viajaba con `modalidad=MR`; antes
  recibía 422 y ahora se segmenta con `vertebrae_mr`.

## Riesgos

- **Memoria.** torch con CUDA ocupa ~3 GB de RAM por proceso antes de leer el
  estudio. En la laptop de desarrollo (15.7 GB, Docker con 7.6 GB y otras cargas)
  el motor no cupo ni con 4.5 GB sin dejar a Windows sin memoria: la medición de la
  segmentación completa queda pendiente (ver tareas). El servicio, en cambio, sí
  se comportó como debe: 503 claro y sigue vivo.
- **Hemorragia.** Modelo menos robusto; se dice en el GLB y en `/health`, y «no
  encontró» nunca se presenta como «no hay».
- **Discos sin nivel.** Si las vértebras vecinas no salen, el disco va a
  `disco-sin-nivel` en vez de inventarle uno.
- Lo demás (reconstrucción automática, software de investigación, revisión del
  médico) sigue como en `modelo-3d-desde-tc`.
