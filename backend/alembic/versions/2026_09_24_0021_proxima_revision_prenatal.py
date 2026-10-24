"""Fecha de la proxima revision prenatal, guardada en el servidor.

Hasta hoy la proxima revision se calculaba en el navegador
(``frontend/src/modules/doctor/utils/embarazo.ts``) y no se guardaba en
ningun lado. Eso rompia dos cosas que Emilio pidio: la doctora no podia
ajustar la fecha y que el ajuste sobreviviera a recargar la pantalla, y el
recordatorio de "ya casi toca revision" no podia existir, porque los jobs
corren en el servidor y el servidor no conocia la fecha.

Se guardan DOS fechas, no una: ``next_review_on`` es la que vale (la que la
doctora acepto o movio) y ``next_review_suggested_on`` es la que propuso la
regla de intervalos. Con una sola columna no habria forma de saber despues
si la sugerencia se respeto o se corrigio, que es justo lo que hay que mirar
antes de cambiarle los intervalos a la regla.

Revision ID: 2026_09_24_0021
Revises: 2026_09_24_0020
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_24_0021"
down_revision = "2026_09_24_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pregnancies", sa.Column("next_review_on", sa.Date(), nullable=True))
    op.add_column(
        "pregnancies", sa.Column("next_review_suggested_on", sa.Date(), nullable=True)
    )
    op.add_column(
        "pregnancies",
        sa.Column("next_review_adjusted_by_user_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "pregnancies", sa.Column("next_review_adjusted_at", sa.DateTime(), nullable=True)
    )
    op.create_foreign_key(
        "fk_pregnancies_next_review_adjusted_by",
        "pregnancies",
        "users",
        ["next_review_adjusted_by_user_id"],
        ["id"],
    )
    # El job de recordatorio barre por fecha sobre todos los embarazos activos,
    # no por paciente; sin indice ese barrido crece con la tabla entera.
    op.create_index(
        "ix_pregnancies_next_review_on", "pregnancies", ["next_review_on"]
    )


def downgrade() -> None:
    op.drop_index("ix_pregnancies_next_review_on", table_name="pregnancies")
    op.drop_constraint(
        "fk_pregnancies_next_review_adjusted_by", "pregnancies", type_="foreignkey"
    )
    op.drop_column("pregnancies", "next_review_adjusted_at")
    op.drop_column("pregnancies", "next_review_adjusted_by_user_id")
    op.drop_column("pregnancies", "next_review_suggested_on")
    op.drop_column("pregnancies", "next_review_on")
