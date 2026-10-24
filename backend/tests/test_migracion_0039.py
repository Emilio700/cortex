"""Migración 0039: anulación de resultados de orden (plan 29, lote 9).

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
    spec = importlib.util.spec_from_file_location("m0039", f"{versiones}/2026_10_04_0039_anular_resultado.py")
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
            return sorted(col["name"] for col in sa.inspect(c).get_columns("diagnostic_results"))

    with motor.begin() as c:
        for tabla in ("diagnostic_results", "users"):
            c.execute(sa.text(f"DROP TABLE IF EXISTS {tabla}"))
        c.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE diagnostic_results (id INTEGER PRIMARY KEY, "
                          "diagnostic_order_id INTEGER NOT NULL, review_status VARCHAR(40) NOT NULL)"))
        c.execute(sa.text("INSERT INTO users VALUES (1)"))
        c.execute(sa.text("INSERT INTO diagnostic_results VALUES (5, 20, 'received')"))

    salida = {"antes": columnas()}
    correr(migracion.upgrade)
    salida["arriba"] = columnas()
    with motor.begin() as c:
        salida["fila"] = [list(f) for f in c.execute(sa.text(
            "SELECT id, diagnostic_order_id, review_status, anulado_at FROM diagnostic_results"))]
        c.execute(sa.text("UPDATE diagnostic_results SET anulado_por_user_id = 1, anulado_motivo = 'x' WHERE id = 5"))
    correr(migracion.downgrade)
    salida["abajo"] = columnas()
    with motor.begin() as c:
        salida["fila_abajo"] = [list(f) for f in c.execute(sa.text(
            "SELECT id, diagnostic_order_id, review_status FROM diagnostic_results"))]
    correr(migracion.upgrade)
    salida["de_nuevo"] = columnas()
    with motor.begin() as c:
        for tabla in ("diagnostic_results", "users"):
            c.execute(sa.text(f"DROP TABLE IF EXISTS {tabla}"))
    print(json.dumps(salida, default=str))
''')

NUEVAS = {"anulado_at", "anulado_por_user_id", "anulado_motivo"}


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
    # Un resultado existente queda vigente.
    assert salida["fila"] == [[5, 20, "received", None]]
    assert salida["abajo"] == salida["antes"]
    # Bajar no borra el resultado.
    assert salida["fila_abajo"] == [[5, 20, "received"]]
    assert salida["de_nuevo"] == salida["arriba"]


def test_ida_y_vuelta_en_sqlite(tmp_path):
    _verificar(_correr(tmp_path, f"sqlite:///{tmp_path / 'base.sqlite'}"))


@pytest.mark.skipif(not os.environ.get("GEMS_PG_PRUEBA_URL"), reason="sin PostgreSQL desechable (GEMS_PG_PRUEBA_URL)")
def test_ida_y_vuelta_en_postgresql(tmp_path):
    _verificar(_correr(tmp_path, os.environ["GEMS_PG_PRUEBA_URL"]))
