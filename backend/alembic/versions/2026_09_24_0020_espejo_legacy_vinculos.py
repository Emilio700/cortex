"""Correspondencia entre los registros del sistema anterior y los de GEMS.

El Dr. Adolfo sigue trabajando en el sistema viejo mientras empieza a usar
GEMS, y un job copia de alla para aca cada media hora. Las pacientes ya tenian
donde anotar de que expediente venian (``patients.expediente_legacy``,
migracion 2026_09_18_0013); las citas no.

Sin ese rastro el espejo no puede saber que ya reflejo y duplicaria en cada
corrida. El caso grave no es hipotetico: la migracion original de julio ya
subio ~25 658 citas del legacy SIN dejar constancia de su fila de origen, asi
que el espejo tiene que poder reconciliarlas una por una y dejarlo anotado.

Va en tabla aparte y no en columnas de ``appointments`` / ``prescriptions``
porque es contabilidad de la migracion, no un dato clinico: se puede espejar
una entidad nueva sin otra migracion sobre tablas de decenas de miles de
renglones, y borrar esta tabla desactiva el espejo sin tocar nada clinico.

Revision ID: 2026_09_24_0020
Revises: 2026_09_20_0019
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_24_0020"
down_revision = "2026_09_20_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "espejo_legacy_vinculos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        # 'citas', 'recetas'. Las pacientes no se anotan aqui: su vinculo es
        # patients.expediente_legacy, que el buscador ya usa.
        sa.Column("tabla_legacy", sa.String(length=20), nullable=False),
        sa.Column("clave_legacy", sa.Integer(), nullable=False),
        sa.Column("entidad", sa.String(length=30), nullable=False),
        sa.Column("entidad_id", sa.Integer(), nullable=False),
        # 'alta' = lo creo el espejo (es lo unico que puede volver a tocar).
        # 'reconciliado' = ya existia en GEMS; el vinculo solo evita duplicarlo.
        sa.Column(
            "origen", sa.String(length=15), nullable=False, server_default="alta"
        ),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        # El ancla de la idempotencia del job.
        sa.UniqueConstraint(
            "tenant_id", "tabla_legacy", "clave_legacy", name="uq_espejo_legacy_origen"
        ),
    )
    op.create_index("ix_espejo_legacy_vinculos_id", "espejo_legacy_vinculos", ["id"])
    op.create_index(
        "ix_espejo_legacy_vinculos_tenant_id", "espejo_legacy_vinculos", ["tenant_id"]
    )
    # Para ir en el otro sentido: de una cita de GEMS a su fila del legacy.
    op.create_index(
        "ix_espejo_legacy_destino", "espejo_legacy_vinculos", ["entidad", "entidad_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_espejo_legacy_destino", table_name="espejo_legacy_vinculos")
    op.drop_index(
        "ix_espejo_legacy_vinculos_tenant_id", table_name="espejo_legacy_vinculos"
    )
    op.drop_index("ix_espejo_legacy_vinculos_id", table_name="espejo_legacy_vinculos")
    op.drop_table("espejo_legacy_vinculos")
