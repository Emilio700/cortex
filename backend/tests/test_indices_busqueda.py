"""Índices de la búsqueda del mostrador y de las citas por doctora (B-05).

El repositorio no tiene pruebas que corran la cadena completa de Alembic (las
migraciones viejas asumen PostgreSQL), así que aquí se prueba:

* que el modelo declara los mismos índices que la migración, para que un
  ``create_all`` y un ``alembic upgrade`` no diverjan;
* que en PostgreSQL los índices de pacientes son GIN de trigramas, que es lo
  único que acelera un ``ILIKE '%palabra%'``;
* que las columnas indexadas son exactamente las que recorre el buscador, para
  que agregar una columna a la búsqueda obligue a pensar en su índice;
* que la migración sube y baja sobre una base real (SQLite en memoria).

La corrida contra PostgreSQL 15 con ``pg_trgm`` se hizo a mano; ver la bitácora
del agente A.
"""
import importlib.util
import inspect
import re
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from sqlalchemy import Index, MetaData, Table, create_engine, inspect as inspeccionar
from sqlalchemy.dialects import postgresql
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateIndex

from app.db.session import Base
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.routers import patients as router_pacientes

RUTA_MIGRACION = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "2026_09_29_0027_indices_busqueda.py"
)


class _OpSobreConexion:
    """Lo mínimo de ``alembic.op`` que usa la migración, ejecutado de verdad.

    Desde ``backend/`` el paquete ``alembic`` del repositorio (la carpeta de
    migraciones, que trae ``__init__.py``) tapa al de Alembic, así que la
    migración se carga con este ``op`` en su lugar. Crea y borra los índices
    sobre una conexión real, o sólo anota si no hay conexión.
    """

    def __init__(self, conexion=None, dialecto="sqlite"):
        self.conexion = conexion
        self.dialecto = dialecto
        self.creados: list[str] = []
        self.borrados: list[str] = []
        self.sentencias: list[str] = []

    def get_bind(self):
        return self.conexion if self.conexion is not None else SimpleNamespace(dialect=SimpleNamespace(name=self.dialecto))

    def execute(self, sql):
        self.sentencias.append(sql)
        if self.conexion is not None:
            self.conexion.exec_driver_sql(sql)

    def create_index(self, nombre, tabla, columnas, **opciones):
        self.creados.append(nombre)
        if self.conexion is not None:
            t = Table(tabla, MetaData(), autoload_with=self.conexion)
            Index(nombre, *[t.c[c] for c in columnas], **opciones).create(self.conexion)

    def drop_index(self, nombre, table_name):
        self.borrados.append(nombre)
        if self.conexion is not None:
            self.conexion.exec_driver_sql(f"DROP INDEX {nombre}")


def _cargar_migracion(monkeypatch, op):
    falso = ModuleType("alembic")
    falso.op = op
    monkeypatch.setitem(sys.modules, "alembic", falso)
    spec = importlib.util.spec_from_file_location("migracion_indices_busqueda", RUTA_MIGRACION)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.fixture
def migracion(monkeypatch):
    return _cargar_migracion(monkeypatch, _OpSobreConexion())


def _indices(tabla):
    return {indice.name: indice for indice in tabla.indexes}


def test_las_citas_tienen_indice_por_doctora_y_fecha(migracion):
    indice = _indices(Appointment.__table__)[migracion.INDICE_CITAS]

    assert [columna.name for columna in indice.columns] == ["doctor_id", "scheduled_at"]


def test_los_indices_de_pacientes_son_gin_de_trigramas_en_postgresql(migracion):
    indices = _indices(Patient.__table__)

    for columna in migracion.COLUMNAS_BUSQUEDA_PACIENTES:
        indice = indices[migracion.indice_trigramas(columna)]
        ddl = str(CreateIndex(indice).compile(dialect=postgresql.dialect()))
        assert "USING gin" in ddl, ddl
        assert f"{columna} gin_trgm_ops" in ddl, ddl


def test_se_indexan_exactamente_las_columnas_que_recorre_el_buscador(migracion):
    fuente = inspect.getsource(router_pacientes.list_patients)
    buscadas = set(re.findall(r"Patient\.(\w+)\.ilike\(word_pattern\)", fuente))

    assert buscadas == set(migracion.COLUMNAS_BUSQUEDA_PACIENTES)


def test_en_sqlite_no_se_crean_los_indices_de_trigramas():
    """Las pruebas corren en SQLite: ahí no existe ``gin_trgm_ops``."""
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)

    nombres = {indice["name"] for indice in inspeccionar(engine).get_indexes("patients")}

    assert not any(nombre.endswith("_trgm") for nombre in nombres)


def test_la_migracion_baja_y_vuelve_a_subir(monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)

    def indices_de_citas():
        return {indice["name"] for indice in inspeccionar(engine).get_indexes("appointments")}

    with engine.begin() as conexion:
        migracion = _cargar_migracion(monkeypatch, _OpSobreConexion(conexion))
        assert migracion.INDICE_CITAS in indices_de_citas()
        migracion.downgrade()
    assert migracion.INDICE_CITAS not in indices_de_citas()

    with engine.begin() as conexion:
        migracion = _cargar_migracion(monkeypatch, _OpSobreConexion(conexion))
        migracion.upgrade()
    assert migracion.INDICE_CITAS in indices_de_citas()


def test_en_postgresql_baja_exactamente_lo_que_sube(monkeypatch):
    op = _OpSobreConexion(dialecto="postgresql")
    migracion = _cargar_migracion(monkeypatch, op)

    migracion.upgrade()
    migracion.downgrade()

    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in op.sentencias
    assert len(op.creados) == 1 + len(migracion.COLUMNAS_BUSQUEDA_PACIENTES)
    assert sorted(op.creados) == sorted(op.borrados)


def test_la_migracion_sigue_a_la_ultima_cabeza(migracion):
    """Una sola cabeza: si otra rama agrega otra hija de 0026, esta prueba lo avisa.

    No exige que 0027 sea la última: las migraciones que vengan después la
    siguen, y eso es justo lo que se quiere.
    """
    versiones = RUTA_MIGRACION.parent
    revisiones, hijas_de = set(), {}
    for archivo in versiones.glob("*.py"):
        texto = archivo.read_text(encoding="utf-8")
        revision = re.search(r'^revision\s*=\s*"([^"]+)"', texto, re.M)
        previa = re.search(r'^down_revision\s*=\s*"([^"]+)"', texto, re.M)
        if revision:
            revisiones.add(revision.group(1))
        if previa:
            hijas_de.setdefault(previa.group(1), []).append(archivo.name)

    assert migracion.down_revision == "2026_09_28_0026"
    assert hijas_de["2026_09_28_0026"] == [RUTA_MIGRACION.name]
    assert all(len(hijas) == 1 for hijas in hijas_de.values()), hijas_de
    assert len(revisiones - set(hijas_de)) == 1
