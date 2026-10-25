"""Migración 0051: tabla ``tenant_modulos`` (base-modulos-extra).

Ida, vuelta e ida en SQLite siempre; en PostgreSQL si ``GEMS_PG_PRUEBA_URL``
apunta a una base desechable (ver ``test_migracion_0035.py``). Va en un proceso
aparte porque desde ``backend/`` la carpeta ``alembic/`` tapa al paquete de Alembic.
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
    spec = importlib.util.spec_from_file_location("m0051", f"{versiones}/2026_10_26_0051_modulos_opcionales.py")
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)
    motor = sa.create_engine(url)

    def correr(paso):
        with motor.connect() as c:
            ctx = MigrationContext.configure(c)
            with Operations.context(ctx), ctx.begin_transaction():
                paso()
            c.commit()

    def tablas():
        with motor.connect() as c:
            return sorted(sa.inspect(c).get_table_names())

    def columnas():
        with motor.connect() as c:
            return sorted(col["name"] for col in sa.inspect(c).get_columns("tenant_modulos"))

    with motor.begin() as c:
        for tabla in ("tenant_modulos", "users", "tenants"):
            c.execute(sa.text(f"DROP TABLE IF EXISTS {tabla}"))
        c.execute(sa.text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        c.execute(sa.text("INSERT INTO tenants VALUES (1)"))
        c.execute(sa.text("INSERT INTO users VALUES (7)"))

    salida = {"antes": tablas()}
    correr(migracion.upgrade)
    salida["arriba"] = tablas()
    salida["columnas"] = columnas()
    with motor.begin() as c:
        c.execute(sa.text("INSERT INTO tenant_modulos (tenant_id, modulo, activado_por, activado_en) "
                          "VALUES (1, 'tareas', 7, '2026-10-26 10:00:00')"))
        salida["activo_por_omision"] = [list(f) for f in c.execute(sa.text(
            "SELECT modulo, activo FROM tenant_modulos"))]
    try:
        with motor.begin() as c:
            c.execute(sa.text("INSERT INTO tenant_modulos (tenant_id, modulo, activo, activado_en) "
                              "VALUES (1, 'tareas', true, '2026-10-26 11:00:00')"))
        salida["duplicado"] = "aceptado"
    except sa.exc.IntegrityError:
        salida["duplicado"] = "rechazado"
    correr(migracion.downgrade)
    salida["abajo"] = tablas()
    correr(migracion.upgrade)
    salida["de_nuevo"] = tablas()
    with motor.begin() as c:
        for tabla in ("tenant_modulos", "users", "tenants"):
            c.execute(sa.text(f"DROP TABLE IF EXISTS {tabla}"))
    print(json.dumps(salida, default=str))
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


def _verificar(salida):
    assert set(salida["arriba"]) == set(salida["antes"]) | {"tenant_modulos"}
    assert salida["columnas"] == sorted(
        ["id", "tenant_id", "modulo", "activo", "activado_por", "activado_en"]
    )
    # Una fila sin ``activo`` explícito nace apagada.
    assert [m for m, _ in salida["activo_por_omision"]] == ["tareas"]
    assert not salida["activo_por_omision"][0][1]
    # Un módulo no puede tener dos estados en el mismo consultorio.
    assert salida["duplicado"] == "rechazado"
    assert salida["abajo"] == salida["antes"]
    assert salida["de_nuevo"] == salida["arriba"]


def test_ida_y_vuelta_en_sqlite(tmp_path):
    _verificar(_correr(tmp_path, f"sqlite:///{tmp_path / 'base.sqlite'}"))


@pytest.mark.skipif(not os.environ.get("GEMS_PG_PRUEBA_URL"), reason="sin PostgreSQL desechable (GEMS_PG_PRUEBA_URL)")
def test_ida_y_vuelta_en_postgresql(tmp_path):
    _verificar(_correr(tmp_path, os.environ["GEMS_PG_PRUEBA_URL"]))
