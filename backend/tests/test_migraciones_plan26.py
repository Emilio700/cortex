"""Migraciones de datos del plan 26: 0033 (incidencias) y 0034 (membrete y contacto).

Se corren de verdad, hacia arriba y hacia abajo, sobre SQLite. Van en un
proceso aparte porque desde ``backend/`` la carpeta ``alembic/`` del
repositorio tapa al paquete de Alembic (ver ``test_indices_busqueda.py``).
"""
import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

VERSIONES = Path(__file__).resolve().parent.parent / "alembic" / "versions"

GUION = textwrap.dedent('''
    import importlib.util, json, sys
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    versiones, ruta_db = sys.argv[1], sys.argv[2]
    motor = sa.create_engine(f"sqlite:///{ruta_db}")
    salida = {}

    def cargar(nombre):
        spec = importlib.util.spec_from_file_location(nombre, f"{versiones}/{nombre}.py")
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        return modulo

    def leer(c, sql):
        return [list(f) for f in c.execute(sa.text(sql)).all()]

    with motor.begin() as c:
        for sql in (
            "CREATE TABLE users (id INTEGER PRIMARY KEY)",
            "CREATE TABLE appointments (id INTEGER PRIMARY KEY)",
            "CREATE TABLE doctor_profiles (id INTEGER PRIMARY KEY, order_settings JSON, prescription_settings JSON,"
            " prescription_display_name VARCHAR(150), prescription_accent_color VARCHAR(7),"
            " prescription_signature_style JSON, prescription_footer_text VARCHAR(150))",
            "CREATE TABLE diagnostic_results (id INTEGER PRIMARY KEY, is_critical BOOLEAN, communicated_at DATETIME,"
            " communicated_by_user_id INTEGER)",
        ):
            c.execute(sa.text(sql))
        c.execute(sa.text("INSERT INTO diagnostic_results VALUES (1, 1, '2026-10-01 10:00:00', 5),"
                          " (2, 1, NULL, NULL), (3, 0, NULL, NULL)"))
        c.execute(sa.text(
            "INSERT INTO doctor_profiles VALUES"
            " (1, NULL, NULL, NULL, NULL, NULL, NULL),"
            " (2, NULL, :receta, 'Dra. Yara Gutiérrez', '#00aa00', :estilo, 'Tu salud primero'),"
            " (3, :solo_modo, NULL, NULL, NULL, NULL, NULL),"
            " (4, :con_membrete, :receta, 'No debe copiarse', NULL, NULL, NULL)"
        ), {
            "receta": json.dumps({"mostrar_registro_ssa": False, "mostrar_logo": False, "mostrar_celular": True}),
            "estilo": json.dumps({"fuente": "cursiva", "tamano": 18}),
            "solo_modo": json.dumps({"modo_impresion": "una_hoja", "mostrar_preparacion": False}),
            "con_membrete": json.dumps({"nombre_impreso": "Dra. Ya configurada"}),
        })
        ctx = MigrationContext.configure(c)
        modulos = []
        with Operations.context(ctx):
            for nombre in ("2026_10_03_0032_valoracion_resultado", "2026_10_03_0033_cierre_incidencia_critica",
                           "2026_10_04_0034_membrete_orden_y_contacto"):
                modulo = cargar(nombre)
                modulo.upgrade()
                modulos.append(modulo)
        salida["incidencias"] = leer(c, "SELECT id, incidencia_cerrada_por FROM diagnostic_results ORDER BY id")
        salida["perfiles"] = {
            str(fila[0]): (json.loads(fila[1]) if fila[1] else None)
            for fila in leer(c, "SELECT id, order_settings FROM doctor_profiles ORDER BY id")
        }
        salida["columnas_arriba"] = [f[1] for f in leer(c, "PRAGMA table_info(doctor_profiles)")]
        with Operations.context(ctx):
            for modulo in reversed(modulos):
                modulo.downgrade()
        salida["perfiles_abajo"] = {
            str(fila[0]): (json.loads(fila[1]) if fila[1] is not None else None)
            for fila in leer(c, "SELECT id, order_settings FROM doctor_profiles ORDER BY id")
        }
        salida["nulos_abajo"] = leer(c, "SELECT id FROM doctor_profiles WHERE order_settings IS NULL ORDER BY id")
        salida["columnas_abajo"] = [f[1] for f in leer(c, "PRAGMA table_info(doctor_profiles)")]
        salida["tablas_abajo"] = [f[0] for f in leer(c, "SELECT name FROM sqlite_master WHERE type='table'")]
    print(json.dumps(salida))
''')


@pytest.fixture(scope="module")
def corrida(tmp_path_factory):
    carpeta = tmp_path_factory.mktemp("migraciones")
    guion = carpeta / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), str(carpeta / "base.sqlite")],
        cwd=carpeta, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    return json.loads(proceso.stdout.strip().splitlines()[-1])


def test_0033_deja_abiertos_los_criticos_nunca_comunicados(corrida):
    """Decisión de Emilio: tras desplegar, los críticos sin comunicar SÍ aparecen como incidencia."""
    assert corrida["incidencias"] == [[1, "comunicacion"], [2, None], [3, None]]


def test_0034_copia_el_membrete_de_una_receta_personalizada(corrida):
    copiado = corrida["perfiles"]["2"]

    assert copiado["nombre_impreso"] == "Dra. Yara Gutiérrez"
    assert copiado["color_acento"] == "#00AA00"
    assert copiado["estilo_firma"] == {"fuente": "cursiva", "tamano": 18}
    assert copiado["leyenda_pie"] == "Tu salud primero"
    assert copiado["mostrar_registro_ssa"] is False
    assert copiado["mostrar_logo"] is False
    assert copiado["mostrar_celular"] is True
    # Lo propio de la orden, de fábrica.
    assert copiado["modo_impresion"] == "separado"
    assert copiado["mostrar_preparacion"] is True
    assert "mostrar_cedula_profesional" not in copiado


def test_0034_con_una_receta_de_fabrica(corrida):
    copiado = corrida["perfiles"]["1"]

    assert copiado["nombre_impreso"] is None
    assert copiado["color_acento"] is None
    assert copiado["leyenda_pie"] is None
    # La receta de fábrica apaga la especialidad; la orden la conserva.
    assert copiado["mostrar_especialidad"] is True
    assert copiado["mostrar_registro_ssa"] is True
    # El contacto de la orden no se apaga por el «apagado» de fábrica de la receta.
    assert copiado["mostrar_correo"] is True and copiado["mostrar_celular"] is True


def test_0034_conserva_lo_propio_de_la_orden_y_no_toca_un_membrete_ya_configurado(corrida):
    assert corrida["perfiles"]["3"]["modo_impresion"] == "una_hoja"
    assert corrida["perfiles"]["3"]["mostrar_preparacion"] is False
    assert corrida["perfiles"]["4"] == {"nombre_impreso": "Dra. Ya configurada"}
    assert {"contact_email", "mobile_phone"} <= set(corrida["columnas_arriba"])


def test_0034_se_revierte_a_lo_que_habia(corrida):
    assert corrida["perfiles_abajo"]["3"] == {"modo_impresion": "una_hoja", "mostrar_preparacion": False}
    assert corrida["perfiles_abajo"]["4"] == {"nombre_impreso": "Dra. Ya configurada"}
    # Nulo si era nulo (SQL NULL, no el JSON «null»).
    assert corrida["nulos_abajo"] == [[1], [2]]
    assert "contact_email" not in corrida["columnas_abajo"]
    assert "order_settings_antes_0034" not in corrida["tablas_abajo"]


def test_0034_usa_la_misma_regla_que_copiar_de_mi_receta():
    """La regla congelada en la migración tiene que coincidir hoy con la de la aplicación.

    (La letra de la firma se guarda tal cual en la migración; la aplicación la
    normaliza al leer, así que el caso con estilo no se compara aquí.)
    """
    import importlib.util
    from types import ModuleType, SimpleNamespace

    from app.utils.orden_config import ajustes_desde_receta

    falso = ModuleType("alembic")
    falso.op = None
    respaldo = sys.modules.get("alembic")
    sys.modules["alembic"] = falso
    try:
        spec = importlib.util.spec_from_file_location("m0034", VERSIONES / "2026_10_04_0034_membrete_orden_y_contacto.py")
        migracion = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migracion)
    finally:
        if respaldo is not None:
            sys.modules["alembic"] = respaldo
        else:
            del sys.modules["alembic"]

    casos = [
        dict(order_settings=None, prescription_settings=None, prescription_display_name=None,
             prescription_accent_color=None, prescription_signature_style=None, prescription_footer_text=None),
        # Una receta guardada completa con la especialidad en su valor de fábrica.
        dict(order_settings={"mostrar_especialidad": True, "mostrar_universidad": False},
             prescription_settings={"mostrar_especialidad": False, "mostrar_logo": True, "mostrar_nombre": False},
             prescription_display_name=None, prescription_accent_color=None, prescription_signature_style=None,
             prescription_footer_text=None),
        dict(order_settings={"modo_impresion": "una_hoja"},
             prescription_settings={"mostrar_logo": False, "mostrar_correo": True, "mostrar_especialidad": False,
                                    "mostrar_celular": False, "mostrar_registro_ssa": True, "mostrar_consejo": False},
             prescription_display_name="  Dra. Yara  ", prescription_accent_color="1a5c3a",
             prescription_signature_style=None, prescription_footer_text="CUIDAMOS TU SALUD, ACOMPAÑAMOS TU VIDA."),
    ]
    for caso in casos:
        perfil = SimpleNamespace(user=None, **caso)
        esperado = ajustes_desde_receta(perfil)
        obtenido = migracion.membrete_desde_receta(
            caso["order_settings"], caso["prescription_settings"], caso["prescription_display_name"],
            caso["prescription_accent_color"], caso["prescription_signature_style"], caso["prescription_footer_text"],
        )
        assert obtenido == esperado
