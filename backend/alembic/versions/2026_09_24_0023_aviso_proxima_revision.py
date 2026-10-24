"""Marca de hasta cuando ya se aviso de una proxima revision prenatal.

El trabajo que avisa a la asistente corre en el programador, cada dia. Sin una
marca persistida, "ya avise de esta paciente" tendria que deducirse de la tabla
de avisos, y eso se rompe en cuanto la doctora mueve la fecha: o se avisa otra
vez de algo que no cambio, o no se avisa de una fecha nueva.

Por eso la marca no es un booleano ni una fecha de envio, sino **la fecha de
revision de la que ya se aviso**. Con eso la regla queda en una comparacion:
se avisa cuando `next_review_on` no coincide con `next_review_reminded_on`.
Mover la revision vuelve a armar el aviso, que es lo correcto; volver a correr
el trabajo diez veces el mismo dia no manda nada, que es lo que hay que
garantizar cuando la destinataria es una sola persona.

Revision ID: 2026_09_24_0023
Revises: 2026_09_24_0022
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_24_0023"
down_revision = "2026_09_24_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pregnancies", sa.Column("next_review_reminded_on", sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("pregnancies", "next_review_reminded_on")
