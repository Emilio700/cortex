"""Aviso de sistema al admin cuando un servicio del servidor cae (plan 32, punto 0).

Por qué existe
--------------
En la 1.1.0 el antivirus (``clamav``) llevaba días ``unhealthy`` y nadie lo
supo hasta que el despliegue se detuvo a la mitad. La salud de los contenedores
solo se revisaba al arrancar. ``scripts/production/healthcheck.sh`` lo revisa
cada vez que corre y llama a este script dentro del contenedor del backend:

    python -m scripts.aviso_de_sistema caido clamav
    python -m scripts.aviso_de_sistema sano clamav

Reglas
------
- **Un aviso por admin y por caída**, no uno por corrida: la ``dedupe_key``
  evita que el healthcheck periódico le llene la campana.
- **Cuando el servicio vuelve se resuelve solo** (``sano``). Si vuelve a caer
  después, es una caída nueva y un aviso nuevo.
- Va a toda cuenta activa de admin o master, de todas las sucursales: el
  servidor es uno solo.
"""
from __future__ import annotations

import sys

from sqlalchemy.orm import Session

from app.models.notification import NotificationResolution, NotificationType
from app.models.user import Role, User
from app.services import notification_service

# El aviso apunta a una entidad para poder resolverse; los servicios no son
# filas de la base, así que cada uno lleva un id fijo de este catálogo.
SERVICIOS: dict[str, tuple[int, str, str]] = {
    "clamav": (
        1,
        "El antivirus del servidor no responde",
        "Mientras siga así no se pueden subir archivos y el próximo despliegue "
        "se detendrá. Hay que reiniciar el contenedor clamav en el servidor.",
    ),
}

ENTIDAD = "servicio"


def _admins(db: Session) -> list[User]:
    return (
        db.query(User)
        .filter(User.is_active.is_(True), User.role.in_([Role.ADMIN, Role.MASTER]))
        .order_by(User.id)
        .all()
    )


def avisar_caida(db: Session, servicio: str) -> int:
    """Escribe el aviso a cada admin que aún no lo tenga abierto. Confirma."""
    entidad_id, titulo, mensaje = SERVICIOS[servicio]
    escritos = 0
    for admin in _admins(db):
        aviso = notification_service.notify(
            db,
            tenant_id=admin.tenant_id,
            user_id=admin.id,
            type=NotificationType.SYSTEM_ALERT,
            title=titulo,
            message=mensaje,
            entity_type=ENTIDAD,
            entity_id=entidad_id,
            dedupe_key=f"servicio_caido:{servicio}",
        )
        escritos += aviso is not None
    db.commit()
    return escritos


def resolver_caida(db: Session, servicio: str) -> int:
    """El servicio volvió: cierra los avisos abiertos. Confirma."""
    entidad_id = SERVICIOS[servicio][0]
    cerrados = notification_service.resolver(
        db,
        tipos=[NotificationType.SYSTEM_ALERT],
        entity_type=ENTIDAD,
        entity_id=entidad_id,
        resolucion=NotificationResolution.AUTO,
    )
    db.commit()
    return cerrados


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[0] not in ("caido", "sano") or argv[1] not in SERVICIOS:
        print("Uso: python -m scripts.aviso_de_sistema caido|sano " + "|".join(SERVICIOS), file=sys.stderr)
        return 2
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        if argv[0] == "caido":
            n = avisar_caida(db, argv[1])
            print(f"Aviso de {argv[1]} caído: {n} admin(s) avisados (los demás ya lo tenían abierto)")
        else:
            n = resolver_caida(db, argv[1])
            print(f"{argv[1]} sano: {n} aviso(s) resueltos")
    finally:
        db.close()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
