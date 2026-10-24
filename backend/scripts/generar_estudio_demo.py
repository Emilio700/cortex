"""Genera un estudio DICOM sintético para probar el visor sin datos de nadie.

El problema real: para probar la carga de estudios hace falta una resonancia, y
usar la de un paciente —aunque sea propia— es justo lo que no se debe hacer en
un sistema clínico. Esto fabrica una RM de encéfalo falsa, con cuatro series
(T1, T1 con contraste, T2 y FLAIR), etiquetada como demostración.

Los píxeles son sintéticos: un patrón geométrico con ruido, suficiente para ver,
medir y comparar. **No es una imagen anatómica** y no sirve para diagnosticar
nada; sirve para probar que el estudio entra, se ordena, se muestra y se mide.

Uso (desde backend/):

    python -m scripts.generar_estudio_demo
    python -m scripts.generar_estudio_demo --salida C:\\ruta\\estudio_demo.zip
    python -m scripts.generar_estudio_demo --cortes 24 --lado 128

El ZIP resultante se sube desde el expediente, en la pestaña Imágenes, con
«Subir estudio».
"""
from __future__ import annotations

import argparse
import math
import random
import sys
import zipfile
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path

from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

# Raíz fija para que dos ejecuciones generen el mismo estudio y la prueba pueda
# comprobar que subirlo dos veces no lo duplica.
RAIZ_ESTUDIO = "1.2.826.0.1.3680043.10.999.1"
UID_ESTUDIO = f"{RAIZ_ESTUDIO}.2026.1"

# (descripción de la serie, número, si lleva contraste)
SERIES = (
    ("t1_ax", 1, False),
    ("t1_ax_post", 2, True),
    ("t2_tse_ax", 3, False),
    ("flair_ax", 4, False),
)

PIXEL_SPACING = 0.5
GROSOR = 4.0


def _pixeles(lado: int, corte: int, total: int, con_contraste: bool) -> bytes:
    """Un patrón geométrico con algo de ruido, en 16 bits con signo.

    Se dibuja un «encéfalo» elíptico y, en las series con contraste, un realce
    redondo en un cuadrante: así se ve que la ventana y la medición responden.
    """
    semilla = corte * 7919 + (1 if con_contraste else 0)
    azar = random.Random(semilla)
    centro = (lado - 1) / 2
    radio_x, radio_y = lado * 0.38, lado * 0.44
    proporcion = corte / max(1, total - 1)
    realce_y = centro - radio_y * 0.25
    datos = bytearray()

    for y in range(lado):
        for x in range(lado):
            dx = (x - centro) / radio_x
            dy = (y - centro) / radio_y
            dentro = dx * dx + dy * dy <= 1.0
            if dentro:
                # Intensidad que cambia por corte: da volumen al recorrerlo.
                valor = 900 + int(320 * (1 - abs(proporcion - 0.5) * 2))
                valor += int(180 * (1 - dx * dx - dy * dy))
                if con_contraste:
                    dist = math.hypot(x - centro, y - realce_y)
                    if dist < lado * 0.09:
                        valor += 700
            else:
                valor = 30
            valor += azar.randint(-25, 25)
            valor = max(0, min(4095, valor))
            datos += int(valor).to_bytes(2, "little", signed=False)
    return bytes(datos)


def _corte(
    *,
    uids_serie: str,
    numero_serie: int,
    descripcion: str,
    indice: int,
    total: int,
    lado: int,
    con_contraste: bool,
    fecha: datetime,
) -> FileDataset:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.4"  # MR Image Storage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = UID_ESTUDIO
    ds.SeriesInstanceUID = uids_serie
    ds.FrameOfReferenceUID = f"{RAIZ_ESTUDIO}.2026.1.0"

    # Identidad claramente falsa: si este archivo se escapa del entorno de
    # pruebas, se reconoce a la legua.
    ds.PatientName = "DEMO^SINTETICO"
    ds.PatientID = "DEMO-0001"
    ds.PatientBirthDate = "19800101"
    ds.PatientSex = "O"

    ds.StudyDate = fecha.strftime("%Y%m%d")
    ds.StudyTime = fecha.strftime("%H%M%S")
    ds.SeriesDate = ds.StudyDate
    ds.SeriesTime = ds.StudyTime
    ds.ContentDate = ds.StudyDate
    ds.ContentTime = ds.StudyTime

    ds.Modality = "MR"
    ds.StudyDescription = "RM ENCEFALO SIMPLE Y CONTRASTADA (DEMO)"
    ds.SeriesDescription = descripcion
    ds.ProtocolName = descripcion
    ds.SeriesNumber = numero_serie
    ds.InstanceNumber = indice + 1
    ds.BodyPartExamined = "HEAD"
    ds.InstitutionName = "Hospital de demostracion"
    ds.Manufacturer = "Cortex DEMO"
    ds.MagneticFieldStrength = 1.5
    ds.ImageType = ["ORIGINAL", "PRIMARY", "M", "ND"]

    ds.Rows = lado
    ds.Columns = lado
    ds.PixelSpacing = [PIXEL_SPACING, PIXEL_SPACING]
    ds.SliceThickness = GROSOR
    ds.SpacingBetweenSlices = GROSOR
    ds.ImagePositionPatient = [0.0, 0.0, float(indice) * GROSOR]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.SliceLocation = float(indice) * GROSOR

    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.WindowCenter = 900
    ds.WindowWidth = 1400
    ds.RescaleIntercept = 0
    ds.RescaleSlope = 1
    ds.PixelData = _pixeles(lado, indice, total, con_contraste)

    return ds


def _como_bytes(ds: FileDataset) -> bytes:
    buffer = BytesIO()
    ds.save_as(buffer, write_like_original=False)
    return buffer.getvalue()


def generar(destino: Path, *, cortes: int = 12, lado: int = 64) -> Path:
    """Escribe el ZIP con el estudio completo y devuelve su ruta."""
    if cortes < 2:
        raise ValueError("Se necesitan al menos dos cortes para que haya pila.")
    if lado < 16:
        raise ValueError("El lado del corte es demasiado pequeño.")

    fecha = datetime(2026, 9, 14, 10, 30)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as archivo:
        for descripcion, numero, con_contraste in SERIES:
            uids_serie = f"{UID_ESTUDIO}.{numero}"
            for indice in range(cortes):
                ds = _corte(
                    uids_serie=uids_serie,
                    numero_serie=numero,
                    descripcion=descripcion,
                    indice=indice,
                    total=cortes,
                    lado=lado,
                    con_contraste=con_contraste,
                    fecha=fecha + timedelta(minutes=numero * 5),
                )
                nombre = f"DICOM/S{numero:02d}/IM{indice + 1:04d}"
                archivo.writestr(nombre, _como_bytes(ds))
    return destino


def main() -> None:
    # La consola de Windows no siempre entiende UTF-8. Sin esto, un mensaje con
    # una flecha termina en UnicodeEncodeError después de haber escrito el ZIP.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Genera una RM de demostración en ZIP.")
    parser.add_argument(
        "--salida",
        type=Path,
        default=Path("estudio_demo.zip"),
        help="Dónde dejar el ZIP (por omisión, ./estudio_demo.zip).",
    )
    parser.add_argument("--cortes", type=int, default=12, help="Cortes por serie.")
    parser.add_argument("--lado", type=int, default=64, help="Lado del corte en píxeles.")
    args = parser.parse_args()

    ruta = generar(args.salida, cortes=args.cortes, lado=args.lado)
    tamaño = ruta.stat().st_size / 1024
    print(f"Estudio de demostración: {ruta.resolve()}")
    print(
        f"{len(SERIES)} series × {args.cortes} cortes de {args.lado}×{args.lado} "
        f"· {tamaño:.1f} KB"
    )
    print("Paciente ficticio: DEMO^SINTETICO (DEMO-0001). No es una imagen anatomica.")
    print("Subelo desde el expediente, pestana Imagenes, con «Subir estudio».")


if __name__ == "__main__":
    main()
