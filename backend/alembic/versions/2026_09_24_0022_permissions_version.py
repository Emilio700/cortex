"""Version de permisos por usuario, para que un cambio surta efecto sin volver a entrar.

Hasta hoy cambiar los permisos de alguien se guardaba bien en la base, pero la
pantalla que esa persona ya tenia abierta seguia con los permisos viejos hasta
que cerraba sesion. Desde que el menu y los guards del frontend se gobiernan por
permisos, eso se lee como "otorgar un permiso no hizo nada": la pantalla de
Master decia que si y la de la usuaria decia que no.

El contador es la forma barata de detectarlo: cada escritura de permisos lo
sube, cada respuesta del API lo devuelve en ``X-Permissions-Version`` y el
frontend, si no coincide con el suyo, recarga su perfil. Se eligio esto en vez
de revocar la sesion porque revocarla a media consulta perderia la nota que la
doctora esta capturando.

Arranca en 1 y no en 0 a proposito: un 0 en la base y un 0 "por defecto" en
codigo son indistinguibles, y no poder distinguirlos es justo lo que hace falta
para saber si una sesion vieja trae version o no.

Revision ID: 2026_09_24_0022
Revises: 2026_09_24_0021
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_24_0022"
down_revision = "2026_09_24_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "permissions_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "permissions_version")
