"""Migración 0044: códigos de folio de las sucursales reales, por nombre.

Llena las vacías, no pisa un código ya puesto, no inventa si el nombre no
coincide y un segundo upgrade no cambia nada. Corre en un proceso aparte
porque desde ``backend/`` la carpeta ``alembic/`` tapa al paquete de Alembic
(ver ``test_migracion_0039.py``).
"""
import json
import subprocess
import sys
import textwrap
from pathlib import Path

VERSIONES = Path(__file__).resolve().parent.parent / "alembic" / "versions"

GUION = textwrap.dedent('''
    import importlib.util, json, sys
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    versiones, url = sys.argv[1], sys.argv[2]
    spec = importlib.util.spec_from_file_location("m0044", f"{versiones}/2026_10_09_0044_codigos_folio_iniciales.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    motor = sa.create_engine(url)

    def correr(paso):
        with motor.connect() as c:
            ctx = MigrationContext.configure(c)
            with Operations.context(ctx), ctx.begin_transaction():
                paso()
            c.commit()

    def codigos():
        with motor.connect() as c:
            return {n: k for n, k in c.execute(sa.text("SELECT name, codigo_folio FROM tenants ORDER BY id"))}

    def base(filas):
        with motor.begin() as c:
            c.execute(sa.text("DROP TABLE IF EXISTS tenants"))
            c.execute(sa.text("CREATE TABLE tenants (id INTEGER PRIMARY KEY, name VARCHAR(200), codigo_folio VARCHAR(5))"))
            for i, (nombre, codigo) in enumerate(filas, start=2):
                c.execute(sa.text("INSERT INTO tenants VALUES (:i, :n, :k)"), {"i": i, "n": nombre, "k": codigo})

    salida = {}
    # Producción: los dos nombres reales, sin código.
    base([("G & G GINECOLOGOS", None), ("GEMS - Sucursal San Ignacio", None), ("Otra", None)])
    correr(m.upgrade)
    salida["llena"] = codigos()
    correr(m.upgrade)
    salida["segunda"] = codigos()
    correr(m.downgrade)
    salida["abajo"] = codigos()
    # Un código ya puesto se respeta; el nombre con otras mayúsculas/acentos se reconoce.
    base([("G & G Ginecólogos", "GG"), ("gems -  sucursal san ignacio", None)])
    correr(m.upgrade)
    salida["respeta"] = codigos()
    # Nombre que no coincide: no inventa.
    base([("Clinica Principal", None)])
    correr(m.upgrade)
    salida["sin_coincidencia"] = codigos()
    print(json.dumps(salida))
''')


def _correr(tmp_path):
    guion = tmp_path / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), f"sqlite:///{tmp_path / 'base.sqlite'}"],
        cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    return json.loads(proceso.stdout.strip().splitlines()[-1])


def test_codigos_por_nombre_idempotentes_y_sin_inventar(tmp_path):
    s = _correr(tmp_path)
    esperado = {"G & G GINECOLOGOS": "GYG", "GEMS - Sucursal San Ignacio": "SIG", "Otra": None}
    assert s["llena"] == esperado
    assert s["segunda"] == esperado
    assert s["abajo"] == esperado  # bajar no quita lo que ya se imprimió
    assert s["respeta"] == {"G & G Ginecólogos": "GG", "gems -  sucursal san ignacio": "SIG"}
    assert s["sin_coincidencia"] == {"Clinica Principal": None}


def _cargar():
    import importlib.util
    import types

    spec = importlib.util.spec_from_file_location("m0044", VERSIONES / "2026_10_09_0044_codigos_folio_iniciales.py")
    m = importlib.util.module_from_spec(spec)
    previo = sys.modules.get("alembic")
    sys.modules["alembic"] = types.SimpleNamespace(op=None)
    try:
        spec.loader.exec_module(m)
    finally:
        if previo is None:
            sys.modules.pop("alembic", None)
        else:
            sys.modules["alembic"] = previo
    return m


def test_no_asigna_un_codigo_que_ya_usa_otra_ni_con_nombres_repetidos():
    m = _cargar()
    escribir, avisos = m.asignaciones([(2, "G & G GINECOLOGOS", None), (3, "Otra", "GYG")])
    assert escribir == [] and "ya lo usa otra sucursal" in avisos[0]
    escribir, avisos = m.asignaciones([(2, "GEMS - Sucursal San Ignacio", None), (3, "GEMS - SUCURSAL SAN IGNACIO", None)])
    assert escribir == [] and any("hay varias" in a for a in avisos)
