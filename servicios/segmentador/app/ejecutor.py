"""Corre una tarea de TotalSegmentator en un proceso aparte.

``python -m app.ejecutor '<json>'``. Lo lanza ``motor.py`` con ``subprocess``,
nunca se importa desde el servicio. Va en su propio proceso por tres motivos:

- Si se acaba la RAM, el kernel mata a este proceso (el más grande), no al
  servicio: el servicio sigue vivo y le dice al médico qué pasó.
- La VRAM que torch reserva se libera toda al salir; en el proceso del servicio
  se quedaría ocupada entre trabajos.
- El pico de VRAM de *esta* corrida se puede medir y reportar.

Al terminar escribe en la salida estándar una línea ``CORTEX_RESULTADO {json}``.
Códigos de salida: 0 bien; 3 sin VRAM; 4 sin RAM; 5 sin GPU; 1 otro error.
(Si el kernel lo mata por memoria, ni siquiera llega a escribir: -9.)
"""
from __future__ import annotations

import json
import sys
import time

SIN_VRAM, SIN_RAM, SIN_GPU = 3, 4, 5


def _resultado(**datos) -> None:
    print("CORTEX_RESULTADO " + json.dumps(datos), flush=True)


def _sin_procesos_extra() -> None:
    """nnU-Net predice sin procesos auxiliares.

    Por omisión nnU-Net abre procesos *spawn* para preprocesar y para guardar, y
    cada uno vuelve a cargar torch (~650 MB de RAM). Con un estudio a la vez esos
    procesos no aceleran nada y, con la memoria de una laptop (Docker con ~7.6 GB),
    son la diferencia entre terminar y que el kernel mate la segmentación: medido
    con una TC de columna completa, el modelo rápido no cabía en 3 GB con ellos.
    """
    from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor

    def secuencial(self, entrada, salida, save_probabilities=False, overwrite=True,
                   num_processes_preprocessing=None, num_processes_segmentation_export=None,
                   folder_with_segs_from_prev_stage=None, num_parts=1, part_id=0, **_):
        return self.predict_from_files_sequential(
            entrada, salida, save_probabilities=save_probabilities, overwrite=overwrite,
            folder_with_segs_from_prev_stage=folder_with_segs_from_prev_stage,
        )

    nnUNetPredictor.predict_from_files = secuencial


def main(argumentos: dict) -> int:
    dispositivo = argumentos["dispositivo"]
    try:
        import torch
    except ImportError:
        _resultado(error="sin_torch")
        return 1
    if dispositivo == "gpu" and not torch.cuda.is_available():
        _resultado(error="sin_gpu")
        return SIN_GPU

    from totalsegmentator.python_api import totalsegmentator

    # Después de importar TotalSegmentator: al importarse, él mismo reemplaza
    # ``predict_from_files`` con su versión (que abre procesos) y pisaría ésta.
    if argumentos.get("secuencial", True):
        _sin_procesos_extra()

    inicio = time.monotonic()
    try:
        totalsegmentator(
            argumentos["entrada"], argumentos["salida"],
            task=argumentos["tarea"],
            roi_subset=argumentos.get("roi_subset"),
            fast=bool(argumentos.get("rapido")),
            device=dispositivo,
            quiet=True,
            # Un solo proceso para remuestrear y guardar: cada proceso extra de
            # nnU-Net carga su propio torch (~1 GB de RAM) y con 8 GB no caben.
            nr_thr_resamp=1,
            nr_thr_saving=1,
        )
    except torch.cuda.OutOfMemoryError as error:
        _resultado(error="sin_vram", detalle=str(error)[:300])
        return SIN_VRAM
    except MemoryError as error:
        _resultado(error="sin_ram", detalle=str(error)[:300])
        return SIN_RAM
    except RuntimeError as error:
        texto = str(error)
        if "out of memory" in texto.lower() and "cuda" in texto.lower():
            _resultado(error="sin_vram", detalle=texto[:300])
            return SIN_VRAM
        if "DefaultCPUAllocator" in texto or "can't allocate memory" in texto:
            _resultado(error="sin_ram", detalle=texto[:300])
            return SIN_RAM
        raise
    vram = None
    if dispositivo == "gpu":
        vram = round(torch.cuda.max_memory_reserved() / 2**20)
    _resultado(ok=True, segundos=round(time.monotonic() - inicio, 2), vram_pico_mb=vram)
    return 0


if __name__ == "__main__":
    sys.exit(main(json.loads(sys.argv[1])))
