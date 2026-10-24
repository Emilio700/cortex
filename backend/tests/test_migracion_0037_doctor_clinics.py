"""Migración 0037: crea ``doctor_clinics`` sólo si no existe (plan 29, T-8).

Se corre de verdad en SQLite y en un proceso aparte, como las otras pruebas de
migraciones (desde ``backend/`` la carpeta ``alembic/`` tapa al paquete).

Dos casos: la instalación nueva (no hay tabla: se crea igual que el modelo y el
downgrade la quita) y producción (la tabla ya está con datos: no se toca, y el
downgrade tampoco la borra).
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

    versiones, carpeta = sys.argv[1], sys.argv[2]
    spec = importlib.util.spec_from_file_location("m", f"{versiones}/2026_10_04_0037_doctor_clinics.py")
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)
    salida = {}

    def base(nombre, con_tabla):
        motor = sa.create_engine(f"sqlite:///{carpeta}/{nombre}.sqlite")
        with motor.begin() as c:
            c.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
            c.execute(sa.text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            c.execute(sa.text("INSERT INTO users VALUES (1)"))
            c.execute(sa.text("INSERT INTO tenants VALUES (1)"))
            if con_tabla:
                c.execute(sa.text(
                    "CREATE TABLE doctor_clinics (id INTEGER PRIMARY KEY, doctor_id INTEGER NOT NULL,"
                    " tenant_id INTEGER NOT NULL, is_active BOOLEAN NOT NULL, created_at DATETIME NOT NULL,"
                    " CONSTRAINT uq_doctor_tenant UNIQUE (doctor_id, tenant_id))"
                ))
                c.execute(sa.text("INSERT INTO doctor_clinics VALUES (7, 1, 1, 1, '2026-09-01 10:00:00')"))
        return motor

    def correr(motor, paso):
        with motor.begin() as c:
            with Operations.context(MigrationContext.configure(c)):
                getattr(migracion, paso)()

    def foto(motor):
        insp = sa.inspect(motor)
        if not insp.has_table("doctor_clinics"):
            return None
        with motor.connect() as c:
            filas = [list(f) for f in c.execute(sa.text("SELECT id, doctor_id, tenant_id FROM doctor_clinics"))]
        return {
            "columnas": sorted(col["name"] for col in insp.get_columns("doctor_clinics")),
            "indices": sorted(i["name"] for i in insp.get_indexes("doctor_clinics")),
            "unicas": sorted(u["name"] for u in insp.get_unique_constraints("doctor_clinics")),
            "filas": filas,
        }

    nueva = base("nueva", con_tabla=False)
    correr(nueva, "upgrade")
    salida["nueva_arriba"] = foto(nueva)
    with nueva.connect() as c:
        c.execute(sa.text("INSERT INTO doctor_clinics (doctor_id, tenant_id, is_active, created_at) VALUES (1, 1, 1, '2026-10-04')"))
        try:
            c.execute(sa.text("INSERT INTO doctor_clinics (doctor_id, tenant_id, is_active, created_at) VALUES (1, 1, 1, '2026-10-04')"))
            salida["duplicado"] = "entro"
        except sa.exc.IntegrityError:
            salida["duplicado"] = "rechazado"
        c.rollback()
    correr(nueva, "upgrade")  # dos veces: idempotente
    salida["nueva_otra_vez"] = foto(nueva)
    correr(nueva, "downgrade")
    salida["nueva_abajo"] = foto(nueva)

    prod = base("prod", con_tabla=True)
    correr(prod, "upgrade")
    salida["prod_arriba"] = foto(prod)
    correr(prod, "downgrade")
    salida["prod_abajo"] = foto(prod)
    print(json.dumps(salida))
''')


@pytest.fixture(scope="module")
def corrida(tmp_path_factory):
    carpeta = tmp_path_factory.mktemp("migracion_0037")
    guion = carpeta / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), str(carpeta)],
        cwd=carpeta, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    return json.loads(proceso.stdout.strip().splitlines()[-1])


def test_en_una_instalacion_nueva_la_crea_igual_que_el_modelo(corrida):
    from app.models.doctor_clinic import DoctorClinic

    tabla = DoctorClinic.__table__
    creada = corrida["nueva_arriba"]

    assert creada["columnas"] == sorted(c.name for c in tabla.columns)
    assert creada["indices"] == sorted(i.name for i in tabla.indexes)
    assert creada["unicas"] == ["uq_doctor_tenant"]
    assert corrida["duplicado"] == "rechazado"


def test_correrla_dos_veces_no_cambia_nada(corrida):
    assert corrida["nueva_otra_vez"]["indices"] == corrida["nueva_arriba"]["indices"]


def test_el_downgrade_quita_la_que_ella_creo(corrida):
    assert corrida["nueva_abajo"] is None


def test_si_ya_existia_no_la_toca_ni_la_borra(corrida):
    assert corrida["prod_arriba"]["filas"] == [[7, 1, 1]]
    assert corrida["prod_abajo"]["filas"] == [[7, 1, 1]]
