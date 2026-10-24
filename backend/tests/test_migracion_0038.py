"""Migración 0038: columnas de corrección de documentos (plan 29, lote 7).

Ida, vuelta e ida en SQLite siempre; en PostgreSQL si ``GEMS_PG_PRUEBA_URL``
apunta a una base desechable (ver ``test_migracion_0035.py``). Va en un
proceso aparte porque desde ``backend/`` la carpeta ``alembic/`` tapa al
paquete de Alembic.
"""
import json
import os
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

    versiones, url = sys.argv[1], sys.argv[2]
    spec = importlib.util.spec_from_file_location("m0038", f"{versiones}/2026_10_04_0038_correccion_documentos.py")
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)
    motor = sa.create_engine(url)

    def correr(paso):
        with motor.connect() as c:
            ctx = MigrationContext.configure(c)
            with Operations.context(ctx), ctx.begin_transaction():
                paso()
            c.commit()

    def columnas():
        with motor.connect() as c:
            return sorted(col["name"] for col in sa.inspect(c).get_columns("patient_documents"))

    with motor.begin() as c:
        for tabla in ("patient_documents", "patients", "users"):
            c.execute(sa.text(f"DROP TABLE IF EXISTS {tabla}"))
        c.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE patients (id INTEGER PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE patient_documents (id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL "
                          "REFERENCES patients(id), title VARCHAR(255) NOT NULL)"))
        c.execute(sa.text("INSERT INTO users VALUES (1)"))
        c.execute(sa.text("INSERT INTO patients VALUES (10), (11)"))
        c.execute(sa.text("INSERT INTO patient_documents VALUES (5, 10, 'Ultrasonido')"))

    salida = {"antes": columnas()}
    correr(migracion.upgrade)
    salida["arriba"] = columnas()
    with motor.begin() as c:
        salida["fila"] = [list(f) for f in c.execute(sa.text(
            "SELECT id, patient_id, title, anulado_at, movido_desde_patient_id FROM patient_documents"))]
        c.execute(sa.text("UPDATE patient_documents SET movido_desde_patient_id = 10, patient_id = 11, "
                          "anulado_por_user_id = 1 WHERE id = 5"))
    correr(migracion.downgrade)
    salida["abajo"] = columnas()
    with motor.begin() as c:
        salida["fila_abajo"] = [list(f) for f in c.execute(sa.text("SELECT id, patient_id, title FROM patient_documents"))]
    correr(migracion.upgrade)
    salida["de_nuevo"] = columnas()
    with motor.begin() as c:
        for tabla in ("patient_documents", "patients", "users"):
            c.execute(sa.text(f"DROP TABLE IF EXISTS {tabla}"))
    print(json.dumps(salida, default=str))
''')

NUEVAS = {
    "anulado_at", "anulado_por_user_id", "anulado_motivo",
    "movido_desde_patient_id", "movido_at", "movido_por_user_id", "movido_motivo",
}


def _correr(tmp_path, url):
    guion = tmp_path / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), url],
        cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    return json.loads(proceso.stdout.strip().splitlines()[-1])


def _verificar(salida):
    assert set(salida["arriba"]) == set(salida["antes"]) | NUEVAS
    # Un documento existente queda vigente y sin movimientos.
    assert salida["fila"] == [[5, 10, "Ultrasonido", None, None]]
    assert salida["abajo"] == salida["antes"]
    # Bajar no borra el documento (se queda con la paciente a la que se movió).
    assert salida["fila_abajo"] == [[5, 11, "Ultrasonido"]]
    assert salida["de_nuevo"] == salida["arriba"]


def test_ida_y_vuelta_en_sqlite(tmp_path):
    _verificar(_correr(tmp_path, f"sqlite:///{tmp_path / 'base.sqlite'}"))


@pytest.mark.skipif(not os.environ.get("GEMS_PG_PRUEBA_URL"), reason="sin PostgreSQL desechable (GEMS_PG_PRUEBA_URL)")
def test_ida_y_vuelta_en_postgresql(tmp_path):
    _verificar(_correr(tmp_path, os.environ["GEMS_PG_PRUEBA_URL"]))
