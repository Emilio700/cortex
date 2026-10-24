"""Índices para la búsqueda de pacientes del mostrador y las citas por doctora.

Acción B-05 del backlog de auditoría (``docs/auditoria/10_acciones_de_mejora.md``,
hallazgo ``06`` M3).

Qué se indexa y por qué así:

* ``appointments (doctor_id, scheduled_at)``. «Mis consultas» filtra por
  doctora y ordena por fecha sobre más de 25 000 citas históricas, y la agenda
  filtra por doctora y rango. Un índice compuesto sirve a las dos cosas —y a
  filtrar sólo por doctora—; uno sólo en ``doctor_id`` obligaría a ordenar
  después todas las citas de esa doctora.
* ``patients.first_name``, ``last_name``, ``phone``, ``cell_phone`` y ``email``
  con **GIN de trigramas** (``pg_trgm``). El buscador hace
  ``ILIKE '%palabra%'`` en esas cinco columnas: con el comodín al inicio un
  índice btree no sirve de nada, y uno de trigramas sí.

``pg_trgm``: producción corre la imagen oficial ``postgres:15-alpine``, que
trae las extensiones de contrib, y el backend se conecta con el usuario
``POSTGRES_USER`` del contenedor, que es superusuario; además, desde
PostgreSQL 13 ``pg_trgm`` es extensión «de confianza» y basta con ser dueño de
la base. Por eso se crea aquí con ``IF NOT EXISTS``. Si la extensión no se
pudiera crear, la migración falla entera y sin dejar nada a medias (corre en
una transacción), en vez de dejar la búsqueda con la mitad de sus índices.

Sin ``CREATE INDEX CONCURRENTLY``: ninguna migración del repositorio lo usa
(``env.py`` corre cada una dentro de una transacción, donde CONCURRENTLY no se
permite) y con 8 219 pacientes y 25 227 citas cada índice se construye en
menos de un segundo. El bloqueo de escritura dura eso; conviene de todas formas
aplicarla fuera del horario de consulta, como el resto de los despliegues.

Fuera de PostgreSQL (SQLite de las pruebas) sólo se crea el índice de citas:
los trigramas no existen ahí.

Reversible: ``downgrade`` quita los seis índices. La extensión ``pg_trgm`` se
deja instalada a propósito: pudo existir antes de esta migración y quitarla
rompería a quien la use; sin índices que la usen no estorba.

Revision ID: 2026_09_29_0027
Revises: 2026_09_28_0026
"""
from alembic import op

revision = "2026_09_29_0027"
down_revision = "2026_09_28_0026"
branch_labels = None
depends_on = None

INDICE_CITAS = "ix_appointments_doctor_id_scheduled_at"

# Las columnas que recorre ``GET /patients?search=`` (``routers/patients.py``).
# Si el buscador agrega una columna, su índice va en una migración nueva.
COLUMNAS_BUSQUEDA_PACIENTES = ("first_name", "last_name", "phone", "cell_phone", "email")


def indice_trigramas(columna: str) -> str:
    return f"ix_patients_{columna}_trgm"


def _es_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    op.create_index(INDICE_CITAS, "appointments", ["doctor_id", "scheduled_at"])

    if not _es_postgresql():
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for columna in COLUMNAS_BUSQUEDA_PACIENTES:
        op.create_index(
            indice_trigramas(columna),
            "patients",
            [columna],
            postgresql_using="gin",
            postgresql_ops={columna: "gin_trgm_ops"},
        )


def downgrade() -> None:
    if _es_postgresql():
        for columna in COLUMNAS_BUSQUEDA_PACIENTES:
            op.drop_index(indice_trigramas(columna), table_name="patients")
    op.drop_index(INDICE_CITAS, table_name="appointments")
