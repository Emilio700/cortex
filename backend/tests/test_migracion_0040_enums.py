"""0040: una base nueva recibe los enums en minúscula; producción no cambia.

La decisión de qué renombrar es pura y se prueba aquí. El ``ALTER TYPE`` se
ensayó en un PostgreSQL desechable: desde cero con ``upgrade head`` más una cita
en cada estado, y otra vez sobre una base que ya estaba en minúscula.
"""
import importlib.util
import sys
import types
from pathlib import Path

RUTA = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "2026_10_09_0040_enums_en_minuscula.py"
_spec = importlib.util.spec_from_file_location("migracion_0040", RUTA)
m = importlib.util.module_from_spec(_spec)
# Desde backend/ la carpeta alembic/ tapa al paquete de Alembic; la función que
# se prueba no lo usa, así que basta un ``op`` de mentira mientras se carga.
_previo = sys.modules.get("alembic")
sys.modules["alembic"] = types.SimpleNamespace(op=None)
try:
    _spec.loader.exec_module(m)
finally:
    if _previo is None:
        sys.modules.pop("alembic", None)
    else:
        sys.modules["alembic"] = _previo


def test_base_nueva_mezclada_pasa_todo_a_minuscula():
    etiquetas = ["AGENDADA", "CONFIRMADA", "EN_SALA", "CANCELADA", "ATENDIDA", "en_consulta"]
    assert m.renombres_pendientes(etiquetas, m.ESPERADAS["appointmentstatus"]) == [
        ("AGENDADA", "agendada"), ("CONFIRMADA", "confirmada"), ("EN_SALA", "en_sala"),
        ("CANCELADA", "cancelada"), ("ATENDIDA", "atendida"),
    ]


def test_produccion_ya_en_minuscula_no_cambia():
    for tipo, esperadas in m.ESPERADAS.items():
        assert m.renombres_pendientes(list(esperadas), esperadas) == [], tipo


def test_no_toca_lo_que_no_conoce_ni_choca_con_una_minuscula_existente():
    # Si ya existen las dos, renombrar fallaría: se deja como está.
    assert m.renombres_pendientes(["PENDING", "pending", "RARO"], m.ESPERADAS["preregistrationstatus"]) == []


def test_cubre_los_tres_tipos_que_nacieron_en_mayuscula():
    assert set(m.ESPERADAS) == {"appointmentstatus", "certificatetype", "preregistrationstatus"}
    assert m.down_revision == "2026_10_04_0039"
