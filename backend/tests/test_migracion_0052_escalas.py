"""Migración 0052: tabla de escalas aplicadas, de ida y de vuelta.

Sube: crea ``escalas_aplicadas`` con sus columnas y sube en 1 la versión de
permisos de los usuarios activos (para que una sesión abierta vea la sección
nueva). Baja: quita la tabla y regresa la versión, sin bajar de 1.

Corre en un proceso aparte porque desde ``backend/`` la carpeta ``alembic/``
tapa al paquete de Alembic (ver ``test_migracion_0039.py``).
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
    spec = importlib.util.spec_from_file_location("m0052", f"{versiones}/2026_10_26_0052_escalas_aplicadas.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    motor = sa.create_engine(url)

    def correr(paso):
        with motor.connect() as c:
            ctx = MigrationContext.configure(c)
            with Operations.context(ctx), ctx.begin_transaction():
                paso()
            c.commit()

    def estado():
        insp = sa.inspect(motor)
        with motor.connect() as c:
            versiones = dict(c.execute(sa.text("SELECT id, permissions_version FROM users ORDER BY id")).all())
        tabla = "escalas_aplicadas" in insp.get_table_names()
        columnas = sorted(col["name"] for col in insp.get_columns("escalas_aplicadas")) if tabla else []
        return {"tabla": tabla, "columnas": columnas, "versiones": versiones}

    with motor.begin() as c:
        for t in ("tenants", "patients", "appointments"):
            c.execute(sa.text(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY, is_active BOOLEAN, permissions_version INTEGER)"))
        c.execute(sa.text("INSERT INTO users VALUES (1, 1, 3), (2, 0, 1), (3, 1, NULL)"))

    salida = {}
    correr(m.upgrade)
    salida["arriba"] = estado()
    correr(m.downgrade)
    salida["abajo"] = estado()
    print(json.dumps(salida))
''')


def test_sube_y_baja_sin_dejar_rastro(tmp_path):
    guion = tmp_path / "correr.py"
    guion.write_text(GUION, encoding="utf-8")
    proceso = subprocess.run(
        [sys.executable, str(guion), str(VERSIONES), f"sqlite:///{tmp_path / 'base.sqlite'}"],
        cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
    )
    assert proceso.returncode == 0, proceso.stderr
    s = json.loads(proceso.stdout.strip().splitlines()[-1])

    assert s["arriba"]["tabla"] is True
    assert {
        "patient_id", "appointment_id", "doctor_id", "tenant_id", "escala", "version_escala",
        "respuestas", "puntaje", "interpretacion", "aplicada_en", "created_by_user_id",
        "anulado_at", "anulado_por_user_id", "anulado_motivo",
    } <= set(s["arriba"]["columnas"])
    # Solo los activos recargan permisos; un NULL cuenta como 1.
    assert s["arriba"]["versiones"] == {"1": 4, "2": 1, "3": 2}

    assert s["abajo"]["tabla"] is False
    assert s["abajo"]["versiones"] == {"1": 3, "2": 1, "3": 1}
