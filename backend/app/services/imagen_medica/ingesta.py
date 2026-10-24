"""Lectura, agrupación y orden de estudios DICOM.

Todo lo de aquí es función pura sobre bytes y cabeceras: no toca base de datos ni
red, para poder probarlo con estudios sintéticos. La escritura en el
almacenamiento vive en ``almacen.py``.

La regla que ordena este módulo: **no inventar**. Si falta la geometría se dice
que falta; si la secuencia no se reconoce, se deja sin etiqueta y se marca como
deducida. Un estudio mal etiquetado en silencio es más peligroso que uno sin
etiqueta.
"""
from __future__ import annotations

import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from typing import Optional

import pydicom

MAGIC_OFFSET = 128
MAGIC = b"DICM"

# Un corte axial de 512x512 en 16 bits pesa ~0.5 MB. Un archivo de más de 120 MB
# no es un corte: es un multiframe enorme o algo que no es DICOM.
MAX_BYTES_POR_ARCHIVO = 120 * 1024 * 1024
MAX_BYTES_POR_ESTUDIO = 1200 * 1024 * 1024
MAX_ARCHIVOS_POR_ESTUDIO = 6000

PISTAS_DE_CONTRASTE = (
    "+c",
    " c+",
    "post",
    "poscontraste",
    "con contraste",
    "contraste",
    "gad",
)

# Secuencias que el visor y la comparación reconocen. Dos estudios solo son
# comparables si coinciden en este vocabulario.
SECUENCIAS = (
    "T1",
    "T1+C",
    "T2",
    "FLAIR",
    "DWI",
    "ADC",
    "TOF",
    "SWI",
    "T2*",
    "PERFUSION",
    "DIFUSION",
    "ANGIO",
    "HUESO",
    "OTRA",
)


@dataclass
class Instancia:
    """Cabecera de un corte, sin los píxeles."""

    sop_instance_uid: str
    series_instance_uid: str
    study_instance_uid: str
    series_number: int
    instance_number: int
    modality: str
    series_description: Optional[str]
    study_description: Optional[str]
    study_date: Optional[datetime]
    institution: Optional[str]
    accession: Optional[str]
    body_part: Optional[str]
    rows: Optional[int]
    columns: Optional[int]
    pixel_spacing: Optional[tuple[float, float]]
    slice_thickness: Optional[float]
    image_position: Optional[tuple[float, float, float]]
    image_orientation: Optional[tuple[float, float, float, float, float, float]]
    image_type: tuple[str, ...] = ()
    sha256: str = ""
    size: int = 0
    # Ruta relativa dentro del almacenamiento; la pone ``almacen.py``.
    ruta: Optional[str] = None

    @property
    def tiene_geometria(self) -> bool:
        return self.image_position is not None and self.image_orientation is not None


@dataclass
class GrupoSerie:
    """Las instancias de una serie, ya ordenadas."""

    series_instance_uid: str
    series_number: int
    modality: str
    series_description: Optional[str]
    sequence_label: Optional[str]
    sequence_detected_by: Optional[str]
    instancias: list[Instancia] = field(default_factory=list)
    ordenadas_por: str = "numero_de_instancia"

    @property
    def primera(self) -> Optional[Instancia]:
        return self.instancias[0] if self.instancias else None

    @property
    def tiene_geometria(self) -> bool:
        return bool(self.instancias) and all(i.tiene_geometria for i in self.instancias)

    @property
    def bytes_totales(self) -> int:
        return sum(i.size for i in self.instancias)


@dataclass
class GrupoEstudio:
    """Un estudio con sus series. Es lo que se guarda como una unidad."""

    study_instance_uid: str
    modality: str
    study_date: Optional[datetime]
    study_description: Optional[str]
    institution: Optional[str]
    accession: Optional[str]
    body_part: Optional[str]
    series: list[GrupoSerie] = field(default_factory=list)
    tiene_contraste: Optional[bool] = None

    @property
    def instancias(self) -> int:
        return sum(len(s.instancias) for s in self.series)

    @property
    def bytes_totales(self) -> int:
        return sum(s.bytes_totales for s in self.series)


def parece_dicom(contenido: bytes) -> bool:
    """La única prueba fiable: ``DICM`` en el desplazamiento 128.

    La extensión miente; muchos equipos guardan los cortes con nombres sin
    extensión o con ``.img``.
    """
    if len(contenido) < MAGIC_OFFSET + len(MAGIC):
        return False
    return contenido[MAGIC_OFFSET : MAGIC_OFFSET + len(MAGIC)] == MAGIC


def _texto(valor) -> Optional[str]:
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def _flotante(valor) -> Optional[float]:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def _entero(valor) -> int:
    numero = _flotante(valor)
    return int(numero) if numero is not None else 0


def _fecha(valor) -> Optional[datetime]:
    texto = _texto(valor)
    if not texto:
        return None
    for formato in ("%Y%m%d%H%M%S.%f", "%Y%m%d%H%M%S", "%Y%m%d"):
        try:
            return datetime.strptime(texto, formato)
        except ValueError:
            continue
    return None


def _tupla(valor, largo: int) -> Optional[tuple[float, ...]]:
    if valor is None:
        return None
    try:
        numeros = tuple(float(v) for v in valor)
    except (TypeError, ValueError):
        return None
    if len(numeros) != largo:
        return None
    return numeros


def menciona_contraste(texto: str) -> bool:
    minusculas = texto.lower()
    return any(pista in minusculas for pista in PISTAS_DE_CONTRASTE)


def detectar_secuencia(
    descripcion: Optional[str], tipos: Sequence[str] = ()
) -> tuple[Optional[str], str]:
    """Etiqueta canónica de la secuencia y cómo se dedujo.

    Es la pieza que más se prueba porque es la que más se equivoca: leer «T1
    post» como «T1» cambia la comparación de un estudio y, con ella, una
    decisión clínica.

    Devuelve ``(etiqueta, criterio)``; la etiqueta es ``None`` cuando no hay
    certeza, y entonces la interfaz muestra la descripción original del equipo.
    """
    pistas = " | ".join(
        [t for t in [(descripcion or "").lower(), " ".join(t.lower() for t in tipos)] if t]
    )
    if not pistas:
        return None, "sin_pistas"

    def contiene(*agujas: str) -> bool:
        return any(aguja in pistas for aguja in agujas)

    if contiene("adc", "apparent diffusion"):
        return "ADC", "tag"
    if contiene("dwi", "diffusion", "difusion", "b1000"):
        return "DWI", "tag"
    if contiene("flair", "tirm", "dark-fluid"):
        return "FLAIR", "tag"
    if contiene("tof", "time of flight"):
        return "TOF", "tag"
    if contiene("angio"):
        return "ANGIO", "tag"
    if contiene("swi", "susceptibility"):
        return "SWI", "tag"
    if contiene("t2*", "t2star", "gre"):
        return "T2*", "tag"
    if contiene("perfusion", "perfusi", "asl"):
        return "PERFUSION", "tag"
    if contiene("dti", "tensor", "tracto"):
        return "DIFUSION", "tag"
    if contiene("t1"):
        return ("T1+C" if menciona_contraste(pistas) else "T1"), "tag"
    if contiene("t2"):
        return "T2", "tag"
    if contiene("bone", "hueso", "oseo", "óseo", "cráneo", "craneo"):
        return "HUESO", "heuristic"
    return None, "sin_coincidencia"


def leer_instancia(contenido: bytes) -> Optional[Instancia]:
    """Cabecera de un corte, o ``None`` si el archivo no es DICOM legible."""
    if not parece_dicom(contenido):
        return None
    try:
        ds = pydicom.dcmread(BytesIO(contenido), stop_before_pixels=True, force=False)
    except Exception:  # noqa: BLE001 - un archivo corrupto no debe tumbar la ingesta
        return None

    study_uid = _texto(getattr(ds, "StudyInstanceUID", None))
    series_uid = _texto(getattr(ds, "SeriesInstanceUID", None))
    sop_uid = _texto(getattr(ds, "SOPInstanceUID", None))
    if not (study_uid and series_uid and sop_uid):
        return None

    return Instancia(
        sop_instance_uid=sop_uid,
        series_instance_uid=series_uid,
        study_instance_uid=study_uid,
        series_number=_entero(getattr(ds, "SeriesNumber", 0)),
        instance_number=_entero(getattr(ds, "InstanceNumber", 0)),
        modality=(_texto(getattr(ds, "Modality", None)) or "OT").upper(),
        series_description=_texto(getattr(ds, "SeriesDescription", None))
        or _texto(getattr(ds, "ProtocolName", None)),
        study_description=_texto(getattr(ds, "StudyDescription", None)),
        study_date=_fecha(getattr(ds, "StudyDate", None)),
        institution=_texto(getattr(ds, "InstitutionName", None)),
        accession=_texto(getattr(ds, "AccessionNumber", None)),
        body_part=_texto(getattr(ds, "BodyPartExamined", None)),
        rows=_entero(getattr(ds, "Rows", 0)) or None,
        columns=_entero(getattr(ds, "Columns", 0)) or None,
        pixel_spacing=_tupla(getattr(ds, "PixelSpacing", None), 2),
        slice_thickness=_flotante(getattr(ds, "SliceThickness", None)),
        image_position=_tupla(getattr(ds, "ImagePositionPatient", None), 3),
        image_orientation=_tupla(getattr(ds, "ImageOrientationPatient", None), 6),
        image_type=tuple(str(t) for t in (getattr(ds, "ImageType", None) or ())),
        sha256=hashlib.sha256(contenido).hexdigest(),
        size=len(contenido),
    )


def proyeccion_sobre_normal(instancia: Instancia) -> Optional[float]:
    """Posición del corte a lo largo del eje de la pila.

    El orden correcto sale de la geometría del paciente, no del nombre del
    archivo: hay equipos que escriben ``InstanceNumber`` invertido y estudios
    que llegan con todos los números en cero.
    """
    if not instancia.image_position or not instancia.image_orientation:
        return None
    fila = instancia.image_orientation[:3]
    columna = instancia.image_orientation[3:]
    normal = (
        fila[1] * columna[2] - fila[2] * columna[1],
        fila[2] * columna[0] - fila[0] * columna[2],
        fila[0] * columna[1] - fila[1] * columna[0],
    )
    return sum(p * n for p, n in zip(instancia.image_position, normal, strict=True))


def ordenar_instancias(instancias: Sequence[Instancia]) -> tuple[list[Instancia], str]:
    """Ordena los cortes y dice con qué criterio se hizo."""
    if instancias and all(i.tiene_geometria for i in instancias):
        con_proyeccion = [(i, proyeccion_sobre_normal(i)) for i in instancias]
        if all(p is not None for _, p in con_proyeccion):
            return [i for i, _ in sorted(con_proyeccion, key=lambda par: par[1])], "posicion"
    return (
        sorted(instancias, key=lambda i: (i.instance_number, i.sop_instance_uid)),
        "numero_de_instancia",
    )


def agrupar(instancias: Iterable[Instancia]) -> list[GrupoEstudio]:
    """Agrupa cortes sueltos en estudios y series listos para guardar."""
    por_estudio: dict[str, list[Instancia]] = {}
    for instancia in instancias:
        por_estudio.setdefault(instancia.study_instance_uid, []).append(instancia)

    estudios: list[GrupoEstudio] = []
    for study_uid, del_estudio in por_estudio.items():
        primera = del_estudio[0]
        estudio = GrupoEstudio(
            study_instance_uid=study_uid,
            modality=primera.modality,
            study_date=primera.study_date,
            study_description=primera.study_description,
            institution=primera.institution,
            accession=primera.accession,
            body_part=primera.body_part,
        )

        por_serie: dict[str, list[Instancia]] = {}
        for instancia in del_estudio:
            por_serie.setdefault(instancia.series_instance_uid, []).append(instancia)

        for series_uid, cortes in por_serie.items():
            ordenadas, criterio = ordenar_instancias(cortes)
            referencia = ordenadas[0]
            etiqueta, criterio_etiqueta = detectar_secuencia(
                referencia.series_description, referencia.image_type
            )
            estudio.series.append(
                GrupoSerie(
                    series_instance_uid=series_uid,
                    series_number=referencia.series_number,
                    modality=referencia.modality,
                    series_description=referencia.series_description,
                    sequence_label=etiqueta,
                    sequence_detected_by=criterio_etiqueta,
                    instancias=ordenadas,
                    ordenadas_por=criterio,
                )
            )

        estudio.series.sort(key=lambda s: (s.series_number, s.series_instance_uid))
        estudio.tiene_contraste = _contraste_del_estudio(estudio)
        estudios.append(estudio)

    return estudios


def _contraste_del_estudio(estudio: GrupoEstudio) -> Optional[bool]:
    """``None`` cuando no se puede saber: no es lo mismo que «sin contraste»."""
    etiquetas = {s.sequence_label for s in estudio.series if s.sequence_label}
    if "T1+C" in etiquetas:
        return True
    if estudio.modality == "MR" and "T1" in etiquetas:
        return False
    if estudio.modality == "CT" and {"ANGIO"} & etiquetas:
        return True
    return None


def comparabilidad(actual: GrupoEstudio, previo: GrupoEstudio) -> list[str]:
    """Avisos sobre si dos estudios se pueden comparar de verdad.

    Es más útil decir «falta T1 con contraste respecto al previo» que mostrar
    una comparación que no significa nada.
    """
    avisos: list[str] = []
    if actual.modality != previo.modality:
        avisos.append(
            f"El estudio actual es {actual.modality} y el previo {previo.modality}: "
            "la comparación entre modalidades no es equivalente."
        )
    etiquetas_actual = {s.sequence_label for s in actual.series if s.sequence_label}
    etiquetas_previo = {s.sequence_label for s in previo.series if s.sequence_label}
    faltan = sorted(etiquetas_previo - etiquetas_actual)
    if faltan:
        avisos.append(
            "Este estudio no incluye " + ", ".join(faltan) + " que el previo sí tiene."
        )
    if actual.tiene_contraste is False and previo.tiene_contraste is True:
        avisos.append("El previo tiene contraste y este no: el realce no se puede comparar.")
    return avisos
