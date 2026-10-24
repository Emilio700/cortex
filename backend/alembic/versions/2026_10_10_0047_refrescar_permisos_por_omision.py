"""Las sesiones abiertas recargan los permisos nuevos por omisión (plan 32).

La 1.2.0 agrega permisos por omisión a los roles (``clinical_tracking.follow_up``,
``documents.upload`` para la doctora, el alta de pacientes…). Viven en código
(``ROLE_DEFAULT_PERMISSIONS``) y el servidor ya los aplica, pero la pantalla de
una sesión abierta solo recarga sus permisos cuando cambia
``users.permissions_version`` (cabecera ``X-Permissions-Version``). Sin esto,
quien no cierra sesión no ve los botones nuevos hasta que vuelva a entrar.

Sube en 1 la versión de cada usuario activo: la siguiente petición de cada
sesión abierta trae la versión nueva y la pantalla vuelve a pedir sus
permisos. No echa a nadie ni cambia ningún permiso.

Va **al final de la cadena** a propósito: así cubre todos los permisos por
omisión que entraron en la 1.2.0. Si una migración posterior agrega otros,
necesita su propio incremento.

``downgrade`` resta 1 sin bajar de 1. Bajar no revoca nada: lo que decide los
permisos es el código, y una pantalla que recarga de más no hace daño.

Revision ID: 2026_10_10_0047
Revises: 2026_10_10_0046
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_10_0047"
down_revision = "2026_10_10_0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = COALESCE(permissions_version, 1) + 1 WHERE is_active = :activo"
    ), {"activo": True})


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = CASE WHEN permissions_version > 1 "
        "THEN permissions_version - 1 ELSE 1 END WHERE is_active = :activo"
    ), {"activo": True})
