"""Los routers ya migrados no vuelven a decidir el alcance por su cuenta (B6).

Por qué una prueba estática y no de integración: el defecto que motivó el B6 no
fue un endpoint que fallara, fue que dos endpoints **se contradijeran**. La nota
de consulta aceptaba al médico que cubría a una colega y la receta le devolvía
403 sobre la misma consulta. Ninguna prueba por endpoint detecta eso, porque cada
uno pasaba la suya: lo que hay que vigilar es que la regla siga viviendo en un
solo sitio.

El candado es por eso sobre el código fuente, igual que el de
``test_esquemas_vs_modelos.py``: un ``if current_user.role == Role.DOCTOR`` nuevo
en un router ya migrado falla aquí el mismo día que se escribe, y no dentro de
seis meses cuando un médico reporte que ve la nota pero no la receta.

La lista de migrados es explícita a propósito. Hay routers que todavía deciden
por rol (``tenants.py`` resuelve a qué sucursales puede cambiarse un médico,
que es otro eje) y no queremos que esta prueba los dé por buenos ni que falle por
ellos: cuando alguno se migre, se agrega aquí y el candado empieza a cuidarlo.
"""
import ast
from pathlib import Path

import pytest

ROUTERS = Path(__file__).resolve().parents[1] / "app" / "routers"

# Routers cuyo alcance de datos ya se resuelve en ``app.core.access_scope``.
ROUTERS_MIGRADOS = (
    "appointments.py",
    "clinical_consents.py",
    "clinical_episodes.py",
    "clinical_images.py",
    "clinical_tracking.py",
    "doctor_schedule.py",
    "medical_certificates.py",
    "patient_documents.py",
    "patients.py",
    # Plan 23: el alcance de pagos vive en ``filtrar_pagos_del_alcance``.
    "payments.py",
    "prenatal.py",
    "prescriptions.py",
    "soap_notes.py",
)

# Nombres con los que los routers reciben a quien hace la petición. Comparar el
# rol de ESTE usuario es decidir alcance; comparar ``User.role`` en un filtro o
# ``member.role`` al validar a un tercero no lo es, y por eso no entran aquí.
QUIEN_PIDE = {"current_user", "user"}

# El rol MASTER sigue siendo una excepción declarada del plan (bypass
# supervisorio) y se resuelve en ``tenant_scope``/``deps``, no en el eje de
# alcance. Comparar contra MASTER en un router es otra cosa que comparar contra
# DOCTOR, así que no se persigue aquí.
ROL_EXENTO = "MASTER"


def _comparaciones_de_rol(ruta: Path) -> list[tuple[int, str]]:
    """Devuelve (línea, rol) por cada vez que el router mira el rol de quien pide."""
    arbol = ast.parse(ruta.read_text(encoding="utf-8"))
    hallazgos: list[tuple[int, str]] = []

    for nodo in ast.walk(arbol):
        if not isinstance(nodo, ast.Compare):
            continue
        izquierda = nodo.left
        if not (
            isinstance(izquierda, ast.Attribute)
            and izquierda.attr == "role"
            and isinstance(izquierda.value, ast.Name)
            and izquierda.value.id in QUIEN_PIDE
        ):
            continue
        for comparado in nodo.comparators:
            rol = None
            if isinstance(comparado, ast.Attribute):  # Role.DOCTOR
                rol = comparado.attr
            elif isinstance(comparado, ast.Constant):  # "doctor"
                rol = str(comparado.value).upper()
            if rol and rol != ROL_EXENTO:
                hallazgos.append((nodo.lineno, rol))
    return hallazgos


@pytest.mark.parametrize("nombre", ROUTERS_MIGRADOS)
def test_un_router_migrado_no_vuelve_a_decidir_el_alcance_por_rol(nombre):
    sueltas = _comparaciones_de_rol(ROUTERS / nombre)

    assert sueltas == [], (
        f"{nombre} volvió a decidir el alcance mirando el rol en las líneas "
        f"{[linea for linea, _ in sueltas]}. Esa decisión va en "
        "app/core/access_scope.py, que es lo que impide que la nota y la receta "
        "vuelvan a contradecirse."
    )


def test_la_lista_de_routers_migrados_no_nombra_archivos_que_ya_no_existen():
    """Un nombre mal escrito dejaría de vigilar un router sin que nadie lo note."""
    faltantes = [n for n in ROUTERS_MIGRADOS if not (ROUTERS / n).exists()]

    assert faltantes == [], f"Routers listados como migrados que no existen: {faltantes}"


def test_el_modulo_de_alcance_ofrece_las_variantes_que_el_codigo_necesita():
    """Las variantes son un hecho del dominio, no una simplificación pendiente.

    El inventario del B6 encontró reglas distintas y deliberadas: dueña del
    expediente, dueña-o-equipo, relación asistencial estricta y autoría del
    registro. Si alguien borra una "para simplificar", los routers que la usaban
    caen en otra y alguien gana o pierde acceso en silencio.
    """
    from app.core import access_scope

    for variante in (
        "resolver_paciente_de_su_duena",
        "resolver_paciente_con_relacion_asistencial",
        "exigir_relacion_asistencial",
        "filtrar_pacientes_del_alcance",
        "exigir_autoria_clinica",
        "filtrar_por_autoria_clinica",
        "exigir_agenda_propia",
        "filtrar_citas_del_alcance",
    ):
        assert hasattr(access_scope, variante), f"Desapareció la variante {variante}"


def test_los_dos_dominios_de_alcance_siguen_separados():
    """Clínico y operativo hoy coinciden, pero no son el mismo eje.

    El plan 20 los separa por razones legales: ampliar el operativo (cobrar y
    agendar para toda la clínica) es administrativo; ampliar el clínico toca
    datos sensibles. Fundirlos en un solo predicado "porque devuelven lo mismo"
    haría que el día que un médico reciba recepción se lleve de regalo los
    expedientes de sus colegas.
    """
    from app.core import access_scope

    assert access_scope.alcance_clinico_acotado is not access_scope.alcance_operativo_acotado
