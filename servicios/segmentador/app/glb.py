"""Escritura y lectura de GLB (glTF 2.0 binario) sin dependencias extra.

Se escribe a mano porque sólo hacen falta triángulos con normales y un nombre por
nodo: traer ``trimesh`` o ``pygltflib`` para esto sería otra licencia y otra
versión que vigilar.

Ojo: glTF supone metros y +Y arriba. Estas mallas van en **milímetros** y en el
sistema del paciente **LPS** (+x izquierda, +y posterior, +z superior), y lo
declaran en ``asset.extras.cortex``. Quien las lee (Neuro 3D) aplica la
conversión; un visor glTF genérico las verá acostadas y enormes, y está bien así:
el dato no se deforma para agradar a un visor.
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from typing import Any

import numpy as np

MAGIA = 0x46546C67  # «glTF»
TROZO_JSON = 0x4E4F534A
TROZO_BIN = 0x004E4942

FLOTANTE = 5126
ENTERO_32 = 5125
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


@dataclass
class Malla:
    id: str
    nombre: str
    vertices: np.ndarray  # (n, 3) float32, mm, LPS
    caras: np.ndarray  # (m, 3) uint32
    normales: np.ndarray | None = None
    extras: dict[str, Any] = field(default_factory=dict)


def _alinear(datos: bytes, relleno: bytes = b"\x00") -> bytes:
    sobra = (-len(datos)) % 4
    return datos + relleno * sobra


def escribir_glb(mallas: list[Malla], extras_del_archivo: dict[str, Any]) -> bytes:
    binario = bytearray()
    vistas: list[dict] = []
    accesores: list[dict] = []
    gltf_mallas: list[dict] = []
    nodos: list[dict] = []

    def agregar(datos: np.ndarray, objetivo: int) -> int:
        bruto = datos.tobytes()
        while len(binario) % 4:
            binario.append(0)
        vistas.append({"buffer": 0, "byteOffset": len(binario), "byteLength": len(bruto), "target": objetivo})
        binario.extend(bruto)
        return len(vistas) - 1

    for malla in mallas:
        v = np.ascontiguousarray(malla.vertices, dtype=np.float32)
        c = np.ascontiguousarray(malla.caras, dtype=np.uint32).reshape(-1)
        atributos: dict[str, int] = {}

        vista = agregar(v, ARRAY_BUFFER)
        accesores.append({
            "bufferView": vista, "componentType": FLOTANTE, "count": int(v.shape[0]), "type": "VEC3",
            "min": [float(x) for x in v.min(axis=0)], "max": [float(x) for x in v.max(axis=0)],
        })
        atributos["POSITION"] = len(accesores) - 1

        if malla.normales is not None:
            n = np.ascontiguousarray(malla.normales, dtype=np.float32)
            vista = agregar(n, ARRAY_BUFFER)
            accesores.append({"bufferView": vista, "componentType": FLOTANTE, "count": int(n.shape[0]), "type": "VEC3"})
            atributos["NORMAL"] = len(accesores) - 1

        vista = agregar(c, ELEMENT_ARRAY_BUFFER)
        accesores.append({"bufferView": vista, "componentType": ENTERO_32, "count": int(c.shape[0]), "type": "SCALAR"})
        indices = len(accesores) - 1

        gltf_mallas.append({"name": malla.id, "primitives": [{"attributes": atributos, "indices": indices, "mode": 4}]})
        nodos.append({"name": malla.id, "mesh": len(gltf_mallas) - 1, "extras": {"nombre": malla.nombre, **malla.extras}})

    documento = {
        "asset": {"version": "2.0", "generator": "Cortex segmentador", "extras": {"cortex": extras_del_archivo}},
        "scene": 0,
        "scenes": [{"name": "paciente", "nodes": list(range(len(nodos)))}],
        "nodes": nodos,
        "meshes": gltf_mallas,
        "accessors": accesores,
        "bufferViews": vistas,
        "buffers": [{"byteLength": len(binario)}],
    }
    texto = _alinear(json.dumps(documento, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    bin_ = _alinear(bytes(binario))
    total = 12 + 8 + len(texto) + 8 + len(bin_)
    return b"".join([
        struct.pack("<III", MAGIA, 2, total),
        struct.pack("<II", len(texto), TROZO_JSON), texto,
        struct.pack("<II", len(bin_), TROZO_BIN), bin_,
    ])


def leer_glb(datos: bytes) -> tuple[dict, list[Malla]]:
    """Lo inverso de ``escribir_glb``; sirve a las pruebas y a quien quiera revisar."""
    magia, version, total = struct.unpack_from("<III", datos, 0)
    if magia != MAGIA or version != 2 or total != len(datos):
        raise ValueError("No es un GLB válido.")
    largo_json, tipo = struct.unpack_from("<II", datos, 12)
    if tipo != TROZO_JSON:
        raise ValueError("Al GLB le falta su JSON.")
    documento = json.loads(datos[20:20 + largo_json].decode("utf-8"))
    inicio_bin = 20 + largo_json
    largo_bin, tipo = struct.unpack_from("<II", datos, inicio_bin)
    if tipo != TROZO_BIN:
        raise ValueError("Al GLB le falta su parte binaria.")
    binario = datos[inicio_bin + 8:inicio_bin + 8 + largo_bin]

    def accesor(i: int) -> np.ndarray:
        a = documento["accessors"][i]
        v = documento["bufferViews"][a["bufferView"]]
        tipo_np = np.float32 if a["componentType"] == FLOTANTE else np.uint32
        ancho = 3 if a["type"] == "VEC3" else 1
        arreglo = np.frombuffer(binario, dtype=tipo_np, count=a["count"] * ancho, offset=v["byteOffset"])
        return arreglo.reshape(-1, 3) if ancho == 3 else arreglo.reshape(-1, 3)

    mallas: list[Malla] = []
    for nodo in documento["nodes"]:
        prim = documento["meshes"][nodo["mesh"]]["primitives"][0]
        extras = dict(nodo.get("extras", {}))
        nombre = extras.pop("nombre", nodo["name"])
        mallas.append(Malla(
            id=nodo["name"], nombre=nombre,
            vertices=accesor(prim["attributes"]["POSITION"]),
            caras=accesor(prim["indices"]),
            normales=accesor(prim["attributes"]["NORMAL"]) if "NORMAL" in prim["attributes"] else None,
            extras=extras,
        ))
    return documento, mallas
