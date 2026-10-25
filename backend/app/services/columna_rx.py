"""Mediciones de la columna desde los puntos de una radiografía (Cortex).

Es la misma definición que ``frontend/src/modules/neuro3d/dominio/ajusteRadiografico.ts``,
repetida en Python porque **lo que se guarda lo calcula el servidor**: la pantalla
sugiere los ángulos mientras el médico marca, pero el expediente no puede depender
de lo que diga el navegador. ``paridadRx.json`` (lo genera el lado de TypeScript)
vigila que las dos implementaciones calculen lo mismo.

Fórmulas y fuentes:

- Cobb sagital y coronal: Cobb 1948.
- Listesis: grados de Meyerding 1932; % sobre el platillo de abajo según
  Taillard 1954 (verificar).
- Altura discal: altura media del disco ÷ altura media del cuerpo de arriba
  (verificar).
- Incidencia pélvica, inclinación pélvica y pendiente sacra: Legaye,
  Duval-Beaupère 1998.

Si cambias una fórmula, cambia ``VERSION_CALCULO_RX`` en los dos lados.
"""
from __future__ import annotations

import math
from typing import Any

VERSION_CALCULO_RX = "1"

VERTEBRAS_RX: list[str] = (
    [f"C{n}" for n in range(2, 8)]
    + [f"T{n}" for n in range(1, 13)]
    + [f"L{n}" for n in range(1, 6)]
    + ["S1"]
)
ESQUINAS_LATERAL = ("sa", "sp", "ia", "ip")
ESQUINAS_AP = ("si", "sd", "ii", "id")
TIPOS_DE_CALIBRACION = ("ninguna", "dicom", "referencia")

UMBRAL_LISTESIS = 5
UMBRAL_ESCOLIOSIS = 10

# Límites de cordura para lo que llega del navegador: una imagen clínica no
# pasa de 20 000 píxeles por lado, y ningún detector tiene píxeles de 5 mm.
MAXIMO_PIXEL = 20000
MAXIMO_MM_POR_PIXEL = 5.0
MAXIMO_MM_REFERENCIA = 2000.0

Punto = dict[str, float]


def redondear(x: float, decimales: int = 1) -> float:
    """La mitad hacia arriba, igual que la pantalla (``round`` de Python redondea al par)."""
    f = 10 ** decimales
    r = math.floor(abs(x) * f + 0.5 + 1e-9) / f
    return -r if x < 0 and r != 0 else r + 0.0


def _grados(rad: float) -> float:
    return rad * 180 / math.pi


def escala_de(c: dict[str, Any]) -> dict[str, float] | None:
    """mm por píxel en x e y; ``None`` si la imagen no trae escala."""
    if c.get("tipo") == "dicom":
        x, y = c.get("mmPorPxX", 0), c.get("mmPorPxY", 0)
        return {"x": x, "y": y} if x > 0 and y > 0 else None
    if c.get("tipo") == "referencia":
        a, b = c["a"], c["b"]
        px = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        return {"x": c["mm"] / px, "y": c["mm"] / px} if px > 0 and c["mm"] > 0 else None
    return None


def _factores_de_forma(c: dict[str, Any]) -> dict[str, float]:
    e = escala_de(c)
    return {"x": 1, "y": e["y"] / e["x"]} if e else {"x": 1, "y": 1}


def _distancia(a: Punto, b: Punto, f: dict[str, float]) -> float:
    return math.hypot((b["x"] - a["x"]) * f["x"], (b["y"] - a["y"]) * f["y"])


def sentido_anterior(lateral: dict[str, Any]) -> int:
    suma = 0.0
    for v in lateral["vertebras"].values():
        if v.get("sa") and v.get("sp"):
            suma += v["sa"]["x"] - v["sp"]["x"]
        if v.get("ia") and v.get("ip"):
            suma += v["ia"]["x"] - v["ip"]["x"]
    return -1 if suma < 0 else 1


def _a_anatomico(dx: float, dy: float, s: int, f: dict[str, float]) -> tuple[float, float]:
    """(adelante, arriba) de un vector de la imagen lateral."""
    return dx * f["x"] * s, -dy * f["y"]


def _inclinacion_sagital(anterior: Punto, posterior: Punto, s: int, f: dict[str, float]) -> float:
    ad, ar = _a_anatomico(anterior["x"] - posterior["x"], anterior["y"] - posterior["y"], s, f)
    return _grados(math.atan2(ar, ad))


def _inclinacion_coronal(p: Punto, q: Punto, derecha: str, f: dict[str, float]) -> float:
    izq, der = (p, q) if p["x"] <= q["x"] else (q, p)
    t = _grados(math.atan2(-(der["y"] - izq["y"]) * f["y"], (der["x"] - izq["x"]) * f["x"]))
    return t if derecha == "izquierda" else -t


def grado_de_meyerding(porcentaje: float) -> int | None:
    if porcentaje <= 0:
        return None
    if porcentaje <= 25:
        return 1
    if porcentaje <= 50:
        return 2
    if porcentaje <= 75:
        return 3
    if porcentaje <= 100:
        return 4
    return 5


def _orden(id_: str) -> int:
    return VERTEBRAS_RX.index(id_) if id_ in VERTEBRAS_RX else -1


def cobb_coronal_de(inclinaciones: list[dict[str, Any]], eleccion: dict[str, str] | None) -> dict[str, Any] | None:
    sup = [i for i in inclinaciones if i["platillo"] == "superior"]
    inf = [i for i in inclinaciones if i["platillo"] == "inferior"]
    mejor = None
    if eleccion:
        a = next((i for i in sup if i["vertebra"] == eleccion.get("superior")), None)
        b = next((i for i in inf if i["vertebra"] == eleccion.get("inferior")), None)
        if not a or not b or _orden(a["vertebra"]) >= _orden(b["vertebra"]):
            return None
        mejor = (a, b, a["grados"] - b["grados"])
    else:
        for a in sup:
            for b in inf:
                if _orden(b["vertebra"]) <= _orden(a["vertebra"]):
                    continue
                d = a["grados"] - b["grados"]
                if mejor is None or abs(d) > abs(mejor[2]) + 1e-9:
                    mejor = (a, b, d)
    if mejor is None:
        return None
    g = redondear(abs(mejor[2]))
    return {
        "grados": g,
        "superior": mejor[0]["vertebra"],
        "inferior": mejor[1]["vertebra"],
        "convexidad": "izquierda" if mejor[2] >= 0 else "derecha",
        "automatico": not eleccion,
        "escoliosis": g >= UMBRAL_ESCOLIOSIS,
    }


def calcular(marcas: dict[str, Any], cal: dict[str, Any], opciones: dict[str, Any] | None = None) -> dict[str, Any]:
    """Todo lo que los puntos permiten; lo que falta se dice en ``faltan``."""
    op = opciones or {"derechaDelPaciente": "izquierda", "cobbCoronal": None}
    faltan: list[str] = []
    lat = marcas["lateral"]
    s = sentido_anterior(lat)
    f_l = _factores_de_forma(cal["lateral"])
    esc_l = escala_de(cal["lateral"])

    def vl(id_: str) -> dict[str, Punto]:
        return lat["vertebras"].get(id_) or {}

    sagitales: list[dict[str, Any]] = []
    for id_ in VERTEBRAS_RX:
        v = vl(id_)
        if v.get("sa") and v.get("sp"):
            sagitales.append({"vertebra": id_, "platillo": "superior", "grados": _inclinacion_sagital(v["sa"], v["sp"], s, f_l)})
        if id_ != "S1" and v.get("ia") and v.get("ip"):
            sagitales.append({"vertebra": id_, "platillo": "inferior", "grados": _inclinacion_sagital(v["ia"], v["ip"], s, f_l)})

    def sagital(id_: str, p: str) -> float | None:
        return next((i["grados"] for i in sagitales if i["vertebra"] == id_ and i["platillo"] == p), None)

    t_l1, t_s1 = sagital("L1", "superior"), sagital("S1", "superior")
    lordosis = (
        {"grados": redondear(t_l1 - t_s1), "superior": "L1", "inferior": "S1"}
        if t_l1 is not None and t_s1 is not None else None
    )
    if not lordosis:
        faltan.append("Lordosis lumbar: marca el platillo superior de L1 y el de S1 en la lateral.")

    t_t4, t_t12 = sagital("T4", "superior"), sagital("T12", "inferior")
    cifosis = (
        {"grados": redondear(t_t12 - t_t4), "superior": "T4", "inferior": "T12"}
        if t_t4 is not None and t_t12 is not None else None
    )
    if not cifosis:
        faltan.append("Cifosis torácica: marca el platillo superior de T4 y el inferior de T12 en la lateral.")

    listesis: list[dict[str, Any]] = []
    discos: list[dict[str, Any]] = []
    for k in range(len(VERTEBRAS_RX) - 1):
        id_a, id_b = VERTEBRAS_RX[k], VERTEBRAS_RX[k + 1]
        a, b = vl(id_a), vl(id_b)
        if not (b.get("sa") and b.get("sp")):
            continue
        ancho = _distancia(b["sp"], b["sa"], f_l)
        if a.get("ip") and ancho > 0:
            ux = (b["sa"]["x"] - b["sp"]["x"]) * f_l["x"] / ancho
            uy = (b["sa"]["y"] - b["sp"]["y"]) * f_l["y"] / ancho
            avance = (a["ip"]["x"] - b["sp"]["x"]) * f_l["x"] * ux + (a["ip"]["y"] - b["sp"]["y"]) * f_l["y"] * uy
            porcentaje = redondear(avance / ancho * 100)
            listesis.append({
                "nivel": f"{id_a}-{id_b}",
                "superior": id_a,
                "inferior": id_b,
                "porcentaje": porcentaje,
                "grado": grado_de_meyerding(porcentaje),
                "apreciable": abs(porcentaje) >= UMBRAL_LISTESIS,
                "mm": redondear(avance / f_l["x"] * esc_l["x"]) if esc_l else None,
            })
        if a.get("sa") and a.get("sp") and a.get("ia") and a.get("ip"):
            anterior = _distancia(a["ia"], b["sa"], f_l)
            posterior = _distancia(a["ip"], b["sp"], f_l)
            cuerpo = (_distancia(a["sa"], a["ia"], f_l) + _distancia(a["sp"], a["ip"], f_l)) / 2
            if cuerpo > 0:
                disco = (anterior + posterior) / 2
                discos.append({
                    "nivel": f"{id_a}-{id_b}",
                    "superior": id_a,
                    "inferior": id_b,
                    "indice": redondear(disco / cuerpo, 2),
                    "mm": redondear(disco / f_l["x"] * esc_l["x"]) if esc_l else None,
                })

    pelvis = None
    s1 = vl("S1")
    caderas = lat.get("caderas") or []
    if s1.get("sa") and s1.get("sp") and caderas:
        hx = sum(p["x"] for p in caderas) / len(caderas)
        hy = sum(p["y"] for p in caderas) / len(caderas)
        mx = (s1["sa"]["x"] + s1["sp"]["x"]) / 2
        my = (s1["sa"]["y"] + s1["sp"]["y"]) / 2
        e_ad, e_ar = _a_anatomico(s1["sa"]["x"] - s1["sp"]["x"], s1["sa"]["y"] - s1["sp"]["y"], s, f_l)
        mh_ad, mh_ar = _a_anatomico(hx - mx, hy - my, s, f_l)
        pendiente = -_grados(math.atan2(e_ar, e_ad))
        inclinacion = _grados(math.atan2(mh_ad, -mh_ar))
        n_ad, n_ar = e_ar, -e_ad
        incidencia = abs(_grados(math.atan2(n_ad * mh_ar - n_ar * mh_ad, n_ad * mh_ad + n_ar * mh_ar)))
        pelvis = {
            "incidencia": redondear(incidencia),
            "inclinacion": redondear(inclinacion),
            "pendienteSacra": redondear(pendiente),
        }
    else:
        faltan.append("Parámetros pélvicos: marca el platillo de S1 y al menos una cabeza femoral en la lateral.")

    f_a = _factores_de_forma(cal["ap"])
    coronales: list[dict[str, Any]] = []
    for id_ in VERTEBRAS_RX:
        v = marcas["ap"]["vertebras"].get(id_) or {}
        if v.get("si") and v.get("sd"):
            coronales.append({"vertebra": id_, "platillo": "superior", "grados": _inclinacion_coronal(v["si"], v["sd"], op["derechaDelPaciente"], f_a)})
        if id_ != "S1" and v.get("ii") and v.get("id"):
            coronales.append({"vertebra": id_, "platillo": "inferior", "grados": _inclinacion_coronal(v["ii"], v["id"], op["derechaDelPaciente"], f_a)})
    eleccion = op.get("cobbCoronal")
    cobb = cobb_coronal_de(coronales, eleccion)
    if not cobb:
        faltan.append(
            f"Cobb coronal: faltan los platillos de {eleccion['superior']} (superior) o de {eleccion['inferior']} (inferior) en la AP."
            if eleccion else "Cobb coronal: marca los platillos de al menos dos vértebras en la AP."
        )

    return {
        "version": VERSION_CALCULO_RX,
        "lordosisLumbar": lordosis,
        "cifosisToracica": cifosis,
        "cobbCoronal": cobb,
        "listesis": listesis,
        "discos": discos,
        "pelvis": pelvis,
        "inclinacionesSagitales": [{**i, "grados": redondear(i["grados"])} for i in sagitales],
        "inclinacionesCoronales": [{**i, "grados": redondear(i["grados"])} for i in coronales],
        "escala": {"lateral": cal["lateral"]["tipo"], "ap": cal["ap"]["tipo"]},
        "faltan": faltan,
    }


# ── Validación de lo que manda el navegador ────────────────────────────────


def _es_numero(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _punto_valido(p: Any) -> bool:
    return (
        isinstance(p, dict)
        and set(p) == {"x", "y"}
        and _es_numero(p["x"]) and _es_numero(p["y"])
        and -MAXIMO_PIXEL <= p["x"] <= MAXIMO_PIXEL
        and -MAXIMO_PIXEL <= p["y"] <= MAXIMO_PIXEL
    )


def validar_marcas(marcas: dict[str, Any]) -> list[str]:
    """Errores en español; lista vacía si las marcas se pueden guardar."""
    errores: list[str] = []
    if not isinstance(marcas, dict) or set(marcas) != {"lateral", "ap"}:
        return ["Los puntos no tienen la forma esperada. Recarga la página y vuelve a marcarlos."]
    lat, ap = marcas["lateral"], marcas["ap"]
    if not isinstance(lat, dict) or not isinstance(lat.get("vertebras"), dict) or not isinstance(lat.get("caderas"), list):
        return ["Los puntos de la lateral no tienen la forma esperada. Recarga la página y vuelve a marcarlos."]
    if not isinstance(ap, dict) or not isinstance(ap.get("vertebras"), dict):
        return ["Los puntos de la AP no tienen la forma esperada. Recarga la página y vuelve a marcarlos."]
    for vista, vertebras, esquinas in (("lateral", lat["vertebras"], ESQUINAS_LATERAL), ("AP", ap["vertebras"], ESQUINAS_AP)):
        for id_, puntos in vertebras.items():
            if id_ not in VERTEBRAS_RX:
                errores.append(f"«{id_}» no es una vértebra que se pueda marcar ({vista}).")
                continue
            if not isinstance(puntos, dict):
                errores.append(f"Los puntos de {id_} ({vista}) no tienen la forma esperada.")
                continue
            for esquina, p in puntos.items():
                if esquina not in esquinas:
                    errores.append(f"{id_} ({vista}) trae un punto que no corresponde: «{esquina}».")
                elif not _punto_valido(p):
                    errores.append(f"Un punto de {id_} ({vista}) está fuera de la imagen o no es un número.")
    if len(lat["caderas"]) > 2:
        errores.append("Se marcan como mucho dos cabezas femorales.")
    if any(not _punto_valido(p) for p in lat["caderas"]):
        errores.append("Un punto de las caderas está fuera de la imagen o no es un número.")
    if not errores and not lat["vertebras"] and not ap["vertebras"]:
        errores.append("No hay puntos marcados. Marca al menos una vértebra antes de guardar.")
    return errores


def validar_calibracion(c: Any, vista: str) -> list[str]:
    if not isinstance(c, dict) or c.get("tipo") not in TIPOS_DE_CALIBRACION:
        return [f"La escala de la {vista} no es válida. Recarga la página."]
    if c["tipo"] == "dicom":
        x, y = c.get("mmPorPxX"), c.get("mmPorPxY")
        if not (_es_numero(x) and _es_numero(y) and 0 < x <= MAXIMO_MM_POR_PIXEL and 0 < y <= MAXIMO_MM_POR_PIXEL):
            return [f"El espaciado del píxel de la {vista} no es válido."]
    if c["tipo"] == "referencia":
        mm = c.get("mm")
        if not (_punto_valido(c.get("a")) and _punto_valido(c.get("b"))):
            return [f"Los extremos de la distancia conocida de la {vista} no son válidos."]
        if not (_es_numero(mm) and 0 < mm <= MAXIMO_MM_REFERENCIA):
            return [f"Escribe la distancia conocida de la {vista} en milímetros (mayor que cero)."]
        if c["a"] == c["b"]:
            return [f"Los dos extremos de la distancia conocida de la {vista} son el mismo punto."]
    return []


def validar_opciones(op: Any) -> list[str]:
    if not isinstance(op, dict) or op.get("derechaDelPaciente") not in ("izquierda", "derecha"):
        return ["Indica de qué lado de la AP queda la derecha del paciente."]
    eleccion = op.get("cobbCoronal")
    if eleccion is not None:
        if not isinstance(eleccion, dict) or eleccion.get("superior") not in VERTEBRAS_RX or eleccion.get("inferior") not in VERTEBRAS_RX:
            return ["Las vértebras límite del Cobb coronal no son válidas."]
    return []
