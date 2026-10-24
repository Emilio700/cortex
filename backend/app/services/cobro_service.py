"""Cobros: la única implementación de "registrar un cobro" (plan 23).

La usan ``POST /payments`` y ``PATCH /appointments/{id}/status`` (finalizar y
cobrar). Si cada uno tuviera su propia versión, la regla anti cobro doble
existiría en uno y no en el otro, que es exactamente como se cobra dos veces.

Las funciones de aquí NO confirman la transacción: agregan y hacen ``flush``.
Quien llama decide cuándo se confirma, porque al finalizar una consulta la cita
y el pago tienen que quedar juntos o no quedar.

Sobre la concurrencia
---------------------
Tres defensas, cada una para un caso distinto:

1. ``client_request_id`` con índice único: el doble clic y el reintento por red
   devuelven el mismo pago.
2. Antes de revisar si la cita ya tiene cobro se bloquea su fila con
   ``SELECT … FOR UPDATE``: si la doctora y la secretaria cobran al mismo
   tiempo, la segunda espera a que la primera confirme y entonces ve su pago.
3. La revisión misma, que responde 409 con el cobro que ya existe.

SQLite (las pruebas) ignora ``FOR UPDATE``; ahí la cobertura la dan 1 y 3, que
son deterministas. El bloqueo sólo se nota con dos conexiones reales a
PostgreSQL.
"""
from decimal import Decimal
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.access_scope import alcance_operativo_acotado
from app.core.hora_local import hoy_local, utc_a_local
from app.core.tenant_scope import scoped_query
from app.models.appointment import Appointment, AppointmentStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.service import Service
from app.models.user import Role, User

ETIQUETA_METODO = {
    PaymentMethod.CASH: "efectivo",
    PaymentMethod.CARD: "tarjeta",
    PaymentMethod.TRANSFER: "transferencia",
    PaymentMethod.OTHER: "otro medio",
}

SIN_DOCTORA = "Sin doctora asignada"


class CobroDobleError(Exception):
    """La cita ya tiene cobro vigente (o se marcó sin cargo).

    Lleva el pago existente ya serializado: el manejador de la aplicación corre
    cuando la sesión de base de datos puede estar cerrada, y el 409 tiene que
    decir quién, cuánto, cómo y cuándo sin otra llamada.
    """

    def __init__(
        self,
        detalle: str,
        cobro_existente: Optional[dict],
        cita_existente: Optional[dict] = None,
    ):
        super().__init__(detalle)
        self.detalle = detalle
        self.cobro_existente = cobro_existente
        # Sólo en la consulta express: la cita del día que hace pensar que es
        # la misma consulta, para que la pantalla pueda preguntar.
        self.cita_existente = cita_existente


def serializar_pago(pago: Payment) -> dict:
    from app.schemas.payment import PaymentResponse

    return PaymentResponse.model_validate(pago).model_dump(mode="json")


def formatear_importe(importe) -> str:
    return f"${Decimal(importe):,.2f}"


def describir_cobro(pago: Payment) -> str:
    """"Ya la cobró Cintia López el 28/09/2026 a las 11:05: $800.00 con tarjeta."

    La hora va en la del consultorio: una hora UTC en el mensaje haría pensar a
    la secretaria que es otro cobro.
    """
    local = utc_a_local(pago.paid_at)
    cuando = (
        f"hoy a las {local:%H:%M}"
        if local.date() == hoy_local()
        else f"el {local:%d/%m/%Y} a las {local:%H:%M}"
    )
    quien = pago.received_by.full_name if pago.received_by else "otra persona"
    metodo = ETIQUETA_METODO.get(pago.method, "otro medio")
    return f"Ya la cobró {quien} {cuando}: {formatear_importe(pago.amount)} con {metodo}."


def pagos_vigentes_de_cita(db: Session, appointment_id: int) -> list[Payment]:
    return (
        db.query(Payment)
        .options(joinedload(Payment.received_by), joinedload(Payment.doctor))
        .filter(
            Payment.appointment_id == appointment_id,
            Payment.status == PaymentStatus.VIGENTE,
        )
        .order_by(Payment.paid_at.asc(), Payment.id.asc())
        .all()
    )


def bloquear_cita(db: Session, appointment_id: int) -> None:
    """``SELECT … FOR UPDATE`` sobre la cita; en SQLite no hace nada.

    Se bloquea sólo la fila de la cita (``of=Appointment``) porque PostgreSQL no
    permite ``FOR UPDATE`` sobre el lado anulable de un join, y las consultas de
    citas del router cargan el triage con uno.
    """
    (
        db.query(Appointment.id)
        .filter(Appointment.id == appointment_id)
        .with_for_update(of=Appointment)
        .first()
    )


def exigir_cita_sin_cobro(db: Session, cita: Appointment, *, cobro_adicional: bool) -> None:
    """409 si la cita ya está cobrada o marcada sin cargo, salvo cobro adicional.

    Llamar DESPUÉS de ``bloquear_cita``: revisar antes de bloquear deja la
    ventana por la que entran los dos cobros simultáneos.
    """
    if cobro_adicional:
        return
    exigir_sin_pagos_vigentes(db, cita)
    if cita.cobro_sin_cargo_motivo:
        quien = cita.cobro_sin_cargo_por.full_name if cita.cobro_sin_cargo_por else "La doctora"
        raise CobroDobleError(
            f"{quien} marcó esta consulta sin cargo: {cita.cobro_sin_cargo_motivo}. "
            "Si de todos modos hay algo que cobrar, regístralo como cobro adicional.",
            None,
        )


def exigir_sin_pagos_vigentes(db: Session, cita: Appointment) -> None:
    """409 si la cita ya tiene un pago vigente, con ese pago en la respuesta."""
    vigentes = pagos_vigentes_de_cita(db, cita.id)
    if vigentes:
        primero = vigentes[0]
        raise CobroDobleError(
            describir_cobro(primero)
            + " Si es un servicio extra, regístralo como cobro adicional.",
            serializar_pago(primero),
        )


def buscar_por_solicitud(db: Session, client_request_id: Optional[str]) -> Optional[Payment]:
    if not client_request_id:
        return None
    return (
        db.query(Payment)
        .options(joinedload(Payment.received_by), joinedload(Payment.doctor))
        .filter(Payment.client_request_id == client_request_id)
        .first()
    )


def exigir_misma_solicitud(pago: Payment, user: User) -> Payment:
    """Un reintento sólo recupera el pago si es de quien lo registró.

    Con UUIDs una colisión real no pasa; si pasa, es otra persona reusando un
    identificador y no se le entrega un pago ajeno.
    """
    if pago.received_by_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ese identificador de cobro ya se usó en otro pago. Vuelve a abrir el formulario e inténtalo de nuevo.",
        )
    return pago


def quien_atendio(cita: Appointment, quien_cierra: User) -> int:
    """Quien cierra la consulta la atendió, si es doctora; si cierra recepción, la titular."""
    if alcance_operativo_acotado(quien_cierra):
        return quien_cierra.id
    return cita.doctor_id


def puede_anular(pago: Payment, user: User) -> bool:
    """Anula quien registró el cobro, el mismo día local; administración, siempre.

    Quien lo registró es quien sabe que se equivocó, y el mismo día el corte
    todavía no se entrega. Después, o sobre cobros ajenos, hace falta
    supervisión: mover un corte ya entregado descuadra la caja de otro día.
    """
    if user.role in (Role.ADMIN, Role.MASTER):
        return True
    return (
        pago.received_by_user_id == user.id
        and utc_a_local(pago.created_at).date() == hoy_local()
    )


def doctora_de_la_cita(cita: Appointment) -> int:
    """El ingreso de una cita es de quien la atendió; si aún no se atiende, de la titular."""
    return cita.attended_by_user_id or cita.doctor_id


def resolver_doctora_del_cobro_suelto(
    db: Session, user: User, doctor_id: Optional[int], tenant_id: int
) -> int:
    """Cobro sin cita: la doctora que cobra es la dueña del ingreso, sin excepción.

    Recepción tiene que decir de quién es: un cobro sin doctora no aparece en
    el corte de nadie y el total por doctora deja de cuadrar con la sucursal.
    """
    if alcance_operativo_acotado(user):
        return user.id
    if doctor_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indica a qué doctora pertenece este cobro.",
        )
    doctora = (
        db.query(User)
        .filter(
            User.id == doctor_id,
            User.tenant_id == tenant_id,
            User.role == Role.DOCTOR,
        )
        .first()
    )
    if not doctora:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró a la doctora en esta sucursal. Actualiza la lista de doctoras.",
        )
    return doctora.id


def validar_servicio(db: Session, service_id: Optional[int], user: User) -> None:
    if service_id is None:
        return
    servicio = scoped_query(db.query(Service), Service, user).filter(Service.id == service_id).first()
    if not servicio:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró el servicio. Revisa el catálogo de servicios.",
        )


def crear_pago(
    db: Session,
    user: User,
    *,
    tenant_id: int,
    patient_id: int,
    doctor_id: int,
    amount,
    method: PaymentMethod,
    appointment_id: Optional[int] = None,
    service_id: Optional[int] = None,
    description: Optional[str] = None,
    notes: Optional[str] = None,
    referencia: Optional[str] = None,
    client_request_id: Optional[str] = None,
) -> Payment:
    """Agrega el pago a la sesión y hace ``flush``; no confirma.

    Sin concepto escrito, el concepto es el nombre del servicio: un cobro al
    finalizar con "CONSULTA GINECOLÓGICA" elegida salía con concepto "-" y en
    el corte no se sabía de qué fue.
    """
    if not (description or "").strip() and service_id is not None:
        servicio = db.get(Service, service_id)
        if servicio is not None:
            description = servicio.name[:255]
    pago = Payment(
        tenant_id=tenant_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        service_id=service_id,
        received_by_user_id=user.id,
        doctor_id=doctor_id,
        amount=amount,
        method=method,
        description=description,
        notes=notes,
        referencia=referencia,
        client_request_id=client_request_id,
        status=PaymentStatus.VIGENTE,
    )
    db.add(pago)
    db.flush()
    return pago


def corregir_doctora_al_atender(db: Session, cita: Appointment, atendio_id: int) -> None:
    """Cobros anticipados de recepción: el ingreso pasa a quien atendió.

    Sólo se llama la primera vez que la cita se finaliza (cuando se sabe quién
    atendió). Después queda fija: reabrir o reasignar la cita no mueve dinero
    de un corte ya hecho.
    """
    (
        db.query(Payment)
        .filter(
            Payment.appointment_id == cita.id,
            Payment.status == PaymentStatus.VIGENTE,
        )
        .update({Payment.doctor_id: atendio_id}, synchronize_session="fetch")
    )


# ---------------------------------------------------------------------------
# Estado de cobro de una cita (lo que ve la agenda y el modal de recepción)
# ---------------------------------------------------------------------------

# «En consulta» se cobra igual que «en sala»: la paciente ya llegó y puede
# pagar antes de que la doctora cierre (plan 28, D-3).
ESTADOS_QUE_SE_COBRAN = (AppointmentStatus.ATENDIDA, AppointmentStatus.EN_SALA, AppointmentStatus.EN_CONSULTA)


def estado_de_cobro(cita: Appointment, vigentes: list[Payment]) -> Optional[str]:
    """``cobrada`` | ``sin_cargo`` | ``pendiente`` | ``None``.

    Un pago vigente gana sobre la exención: si hubo cobro adicional, la
    consulta sí se cobró. ``None`` para las citas que aún no toca cobrar
    (agendadas, confirmadas, canceladas sin pago): decir "pendiente" ahí
    llenaría la pantalla de recepción de falsas alarmas.
    """
    if vigentes:
        return "cobrada"
    if cita.cobro_sin_cargo_motivo:
        return "sin_cargo"
    if cita.status in ESTADOS_QUE_SE_COBRAN:
        return "pendiente"
    return None


def resumen_de_cobros(db: Session, citas: Iterable[Appointment]) -> dict[int, dict]:
    """Estado, total y pagos vigentes por cita, con UNA consulta para toda la lista."""
    citas = list(citas)
    ids = [c.id for c in citas]
    por_cita: dict[int, list[Payment]] = {i: [] for i in ids}
    if ids:
        filas = (
            db.query(Payment)
            .options(joinedload(Payment.received_by), joinedload(Payment.doctor))
            .filter(
                Payment.appointment_id.in_(ids),
                Payment.status == PaymentStatus.VIGENTE,
            )
            .order_by(Payment.paid_at.asc(), Payment.id.asc())
            .all()
        )
        for pago in filas:
            por_cita[pago.appointment_id].append(pago)

    resultado = {}
    for cita in citas:
        vigentes = por_cita.get(cita.id, [])
        resultado[cita.id] = {
            "estado_cobro": estado_de_cobro(cita, vigentes),
            "total_cobrado": sum((Decimal(p.amount) for p in vigentes), Decimal("0.00")),
            "cobro_resumen": [
                {
                    "id": p.id,
                    "amount": p.amount,
                    "method": p.method,
                    "received_by_name": p.received_by_name,
                    "doctor_name": p.doctor_name,
                    "referencia": p.referencia,
                    "paid_at": p.paid_at,
                }
                for p in vigentes
            ],
        }
    return resultado
