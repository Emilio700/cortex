"""Migración 0035: valor «en_consulta» en el enum de citas (plan 28, D-3).

El enum nativo solo existe en PostgreSQL. La prueba de ida y vuelta corre si
``GEMS_PG_PRUEBA_URL`` apunta a una base **desechable**, p. ej.::

    docker run -d --rm --name pg0035 -e POSTGRES_PASSWORD=prueba \
        -e POSTGRES_USER=prueba -e POSTGRES_DB=prueba -p 55435:5432 postgres:16
    GEMS_PG_PRUEBA_URL=postgresql://prueba:prueba@localhost:55435/prueba pytest tests/test_migracion_0035.py

Sin esa variable se salta (las pruebas normales corren sobre SQLite). La de
SQLite sí corre siempre: ahí la migración no debe hacer nada.

Va en un proceso aparte porque desde ``backend/`` la carpeta ``alembic/`` del
repositorio tapa al paquete de Alembic (ver ``test_migraciones_plan26.py``).
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
    spec = importlib.util.spec_from_file_location("m0035", f"{versiones}/2026_10_04_0035_cita_en_consulta.py")
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)
    motor = sa.create_engine(url)
    salida = {}

    def leer(c, sql):
        return [list(f) for f in c.execute(sa.text(sql)).all()]

    def etiquetas(c):
        return [f[0] for f in leer(c, "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                                      "WHERE t.typname = 'appointmentstatus' ORDER BY e.enumsortorder")]

    def correr(paso):
        # Como ``alembic upgrade``: dentro de la transacción de la migración,
        # que ``autocommit_block`` suspende para el ALTER TYPE.
        with motor.connect() as c:
            ctx = MigrationContext.configure(c)
            with Operations.context(ctx), ctx.begin_transaction():
                paso()
            c.commit()

    es_pg = motor.dialect.name == "postgresql"
    with motor.begin() as c:
        if es_pg:
            c.execute(sa.text("DROP TABLE IF EXISTS appointments"))
            c.execute(sa.text("DROP TYPE IF EXISTS appointmentstatus"))
            c.execute(sa.text("DROP TYPE IF EXISTS appointmentstatus_sin_en_consulta"))
            # Como está producción: las etiquetas en minúscula (2026-07-22).
            c.execute(sa.text("CREATE TYPE appointmentstatus AS ENUM "
                              "('agendada', 'confirmada', 'en_sala', 'cancelada', 'atendida')"))
            c.execute(sa.text("CREATE TABLE appointments (id INTEGER PRIMARY KEY, status appointmentstatus NOT NULL)"))
            c.execute(sa.text("CREATE INDEX ix_appointments_status ON appointments (status)"))
            c.execute(sa.text("INSERT INTO appointments VALUES (1, 'en_sala'), (2, 'atendida'), (4, 'confirmada')"))
        else:
            c.execute(sa.text("CREATE TABLE appointments (id INTEGER PRIMARY KEY, status VARCHAR(11) NOT NULL)"))
    def columnas(c):
        return [col["name"] for col in sa.inspect(c).get_columns("appointments")]

    if not es_pg:
        correr(migracion.upgrade)
        with motor.begin() as c:
            arriba = columnas(c)
        correr(migracion.downgrade)
        with motor.begin() as c:
            abajo = columnas(c)
        print(json.dumps({"sqlite": {"arriba": arriba, "abajo": abajo}}))
        sys.exit(0)

    correr(migracion.upgrade)
    with motor.begin() as c:
        salida["arriba"] = etiquetas(c)
        salida["columnas_arriba"] = columnas(c)
        c.execute(sa.text("INSERT INTO appointments (id, status) VALUES (3, 'en_consulta')"))
        # Entró a consulta desde confirmada: al bajar vuelve ahí, no a sala.
        c.execute(sa.text("UPDATE appointments SET status = 'en_consulta', estado_antes_de_consulta = 'confirmada' WHERE id = 4"))
    correr(migracion.downgrade)
    with motor.begin() as c:
        salida["abajo"] = etiquetas(c)
        salida["columnas_abajo"] = columnas(c)
        salida["filas"] = leer(c, "SELECT id, status::text FROM appointments ORDER BY id")
        salida["indice"] = leer(c, "SELECT indexname FROM pg_indexes WHERE tablename = 'appointments' "
                                  "AND indexname = 'ix_appointments_status'")
    correr(migracion.upgrade)
    with motor.begin() as c:
        salida["de_nuevo"] = etiquetas(c)
        c.execute(sa.text("DROP TABLE appointments"))
        c.execute(sa.text("DROP TYPE appointmentstatus"))
    print(json.dumps(salida))
''')


def _correr(tmp_path, url):
    guion = tmp_path / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), url],
        cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    return json.loads(proceso.stdout.strip().splitlines()[-1])


def test_en_sqlite_no_hace_nada(tmp_path):
    """En SQLite no hay enum nativo: solo la columna del estado previo."""
    salida = _correr(tmp_path, f"sqlite:///{tmp_path / 'base.sqlite'}")["sqlite"]

    assert salida["arriba"] == ["id", "status", "estado_antes_de_consulta"]
    assert salida["abajo"] == ["id", "status"]


@pytest.mark.skipif(not os.environ.get("GEMS_PG_PRUEBA_URL"), reason="sin PostgreSQL desechable (GEMS_PG_PRUEBA_URL)")
def test_ida_y_vuelta_en_postgresql(tmp_path):
    salida = _correr(tmp_path, os.environ["GEMS_PG_PRUEBA_URL"])

    assert salida["arriba"] == ["agendada", "confirmada", "en_sala", "en_consulta", "cancelada", "atendida"]
    # Bajar no pierde la cita: la que estaba en consulta regresa a sala.
    assert salida["abajo"] == ["agendada", "confirmada", "en_sala", "cancelada", "atendida"]
    assert salida["filas"] == [[1, "en_sala"], [2, "atendida"], [3, "en_sala"], [4, "confirmada"]]
    assert "estado_antes_de_consulta" in salida["columnas_arriba"]
    assert "estado_antes_de_consulta" not in salida["columnas_abajo"]
    assert salida["indice"] == [["ix_appointments_status"]]
    assert salida["de_nuevo"] == salida["arriba"]
