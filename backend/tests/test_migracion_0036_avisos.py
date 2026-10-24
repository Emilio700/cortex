"""Migración 0036 (plan 27, Fase 1): prioridad y cierre de los avisos que ya existen.

Se corre de verdad, hacia arriba y hacia abajo, sobre SQLite y en un proceso
aparte, como ``test_migraciones_plan26.py`` (desde ``backend/`` la carpeta
``alembic/`` tapa al paquete de Alembic).

Lo que importa: no estrenar el centro de avisos con pendientes que ya no lo
son, y no volver accionable lo que sólo informaba.
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

    def leer(c, sql):
        return [list(f) for f in c.execute(sa.text(sql)).all()]

    spec = importlib.util.spec_from_file_location("m", f"{versiones}/2026_10_04_0036_avisos_prioridad.py")
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)

    with motor.begin() as c:
        for sql in (
            "CREATE TABLE users (id INTEGER PRIMARY KEY)",
            "CREATE TABLE appointments (id INTEGER PRIMARY KEY, status VARCHAR(20), cobro_sin_cargo_motivo VARCHAR(255))",
            "CREATE TABLE diagnostic_orders (id INTEGER PRIMARY KEY, status VARCHAR(30))",
            "CREATE TABLE payments (id INTEGER PRIMARY KEY, appointment_id INTEGER, status VARCHAR(20))",
            "CREATE TABLE notifications (id INTEGER PRIMARY KEY, tenant_id INTEGER, user_id INTEGER,"
            " type VARCHAR(50), title VARCHAR(255), message VARCHAR(500), entity_type VARCHAR(50),"
            " entity_id INTEGER, is_read BOOLEAN NOT NULL DEFAULT 0, created_at DATETIME NOT NULL)",
        ):
            c.execute(sa.text(sql))
        c.execute(sa.text(
            "INSERT INTO appointments VALUES (1, 'en_sala', NULL), (2, 'atendida', NULL),"
            " (3, 'atendida', NULL), (4, 'atendida', 'Cortesía'), (5, 'atendida', NULL)"
        ))
        c.execute(sa.text("INSERT INTO diagnostic_orders VALUES (1, 'result_received'), (2, 'reviewed')"))
        c.execute(sa.text("INSERT INTO payments VALUES (1, 3, 'vigente')"))
        ahora = "datetime('now')"
        viejo = "datetime('now', '-10 days')"
        for fila in (
            (1, "patient_arrived", "x", "appointment", 1, ahora),          # sigue en sala: abierto
            (2, "patient_arrived", "x", "appointment", 2, ahora),          # ya atendida: se cierra
            (3, "diagnostic_result_received", "x", "diagnostic_order", 1, ahora),  # abierto
            (4, "diagnostic_result_received", "x", "diagnostic_order", 2, ahora),  # ya revisada
            (5, "consultation_completed", "Consulta finalizada — pendiente de cobro", "appointment", 3, ahora),  # cobrada
            (6, "consultation_completed", "Consulta finalizada — pendiente de cobro", "appointment", 4, ahora),  # sin cargo
            (7, "consultation_completed", "Consulta finalizada — pendiente de cobro", "appointment", 5, ahora),  # abierto
            (8, "consultation_completed", "Consulta finalizada — ya cobrada", "appointment", 5, ahora),  # informativo
            (9, "prenatal_review_due", "x", "patient", 1, viejo),          # viejo: se cierra
            (10, "appointment_today", "x", None, None, ahora),             # informativo
        ):
            c.execute(sa.text(
                f"INSERT INTO notifications (id, tenant_id, user_id, type, title, message, entity_type, entity_id,"
                f" created_at) VALUES ({fila[0]}, 1, 1, :tipo, :titulo, 'm', :et, :ei, {fila[5]})"
            ), {"tipo": fila[1], "titulo": fila[2], "et": fila[3], "ei": fila[4]})

        ctx = MigrationContext.configure(c)
        with Operations.context(ctx):
            migracion.upgrade()
        salida["arriba"] = leer(
            c, "SELECT id, priority, resolution, is_read FROM notifications ORDER BY id"
        )
        salida["tablas_arriba"] = [f[0] for f in leer(c, "SELECT name FROM sqlite_master WHERE type='table'")]
        with Operations.context(ctx):
            migracion.downgrade()
        salida["columnas_abajo"] = [f[1] for f in leer(c, "PRAGMA table_info(notifications)")]
        salida["tablas_abajo"] = [f[0] for f in leer(c, "SELECT name FROM sqlite_master WHERE type='table'")]
    print(json.dumps(salida))
''')


@pytest.fixture(scope="module")
def corrida(tmp_path_factory):
    carpeta = tmp_path_factory.mktemp("migracion_0036")
    guion = carpeta / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), str(carpeta / "base.sqlite")],
        cwd=carpeta, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    return json.loads(proceso.stdout.strip().splitlines()[-1])


def _fila(corrida, aviso_id):
    return next(f for f in corrida["arriba"] if f[0] == aviso_id)


def test_lo_que_sigue_pendiente_queda_accionable_y_abierto(corrida):
    for aviso_id in (1, 3, 7):
        _, prioridad, resolucion, _ = _fila(corrida, aviso_id)
        assert (prioridad, resolucion) == ("accionable", None), aviso_id


def test_lo_que_ya_paso_se_cierra_por_migracion(corrida):
    # Ya atendida, ya revisada, ya cobrada, sin cargo, y más de 7 días.
    for aviso_id in (2, 4, 5, 6, 9):
        _, prioridad, resolucion, leido = _fila(corrida, aviso_id)
        assert (prioridad, resolucion) == ("accionable", "migracion"), aviso_id
        assert leido in (1, True)


def test_lo_que_solo_informaba_no_se_vuelve_accionable(corrida):
    assert _fila(corrida, 8)[1:3] == ["informativo", None]
    assert _fila(corrida, 10)[1:3] == ["informativo", None]


def test_crea_las_preferencias_y_se_revierte(corrida):
    assert "notification_preferences" in corrida["tablas_arriba"]
    assert "notification_preferences" not in corrida["tablas_abajo"]
    assert not {"priority", "resolved_at", "resolution", "dedupe_key"} & set(corrida["columnas_abajo"])
