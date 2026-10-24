"""Avisarle a la asistente de los controles prenatales que se vienen sin cita.

Qué problema resuelve
---------------------
La fecha de la próxima revisión ya se guarda (``pregnancies.next_review_on``),
pero guardarla no hace que nadie la mire. Una paciente que sale de consulta sin
agendar el siguiente control se pierde en silencio: no hay pantalla que la
reclame y el embarazo sigue su curso igual.

Quién recibe el aviso, y por qué no la doctora ni la paciente
-------------------------------------------------------------
La asistente. Decisión de Emilio, textual: el recordatorio a la paciente lo hace
un humano; el sistema se encarga de que ese humano no se le pase. Las pacientes
no son usuarias del sistema —``notify()`` despacha a un ``user_id``, o sea a
personal— así que avisarles directo ni siquiera es posible por aquí.

A la doctora no se le avisa a propósito: lo que ella necesita saber cabe en una
lista que se consulta (el tablero de ``clinical_tracking``), y un aviso que sólo
dice "entérate" es lo que tiene su campanita llena de cosas sin leer. Una
notificación significa "haz algo"; llamar a la paciente lo es, enterarse no.

Las dos cosas que este trabajo tiene que no romper
--------------------------------------------------
**Idempotencia.** El trabajo corre todos los días sobre los mismos embarazos. Lo
que evita el reenvío no es la hora a la que corre sino
``pregnancies.next_review_reminded_on``: guarda **de qué fecha** ya se avisó, no
que se avisó. Si la corrida se repite diez veces, la comparación falla diez
veces y no sale nada; si la doctora mueve la revisión, la comparación vuelve a
dar distinto y el aviso se rearma solo, que es justo lo que hay que hacer con
una fecha nueva.

**El freno.** En producción hay del orden de 223 embarazos activos. La primera
corrida sobre una columna recién poblada puede encontrarse decenas de embarazos
a la vez, y la destinataria es una sola persona: un buzón con cien avisos no se
lee, se ignora, y entonces el trabajo empeora justo lo que venía a arreglar. Por
eso, igual que el espejo del legacy, si la corrida fuera a mandar más avisos que
``PRENATAL_TOPE_AVISOS`` **no escribe ninguno** y lo reporta en la bitácora. Que
haga falta subirlo a mano una vez es el punto: obliga a mirar qué va a salir.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.hora_local import hoy_local
from app.models.appointment import Appointment, AppointmentStatus
from app.models.notification import NotificationType
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.user import User
from app.services.notification_service import destinatarios_de_recepcion, notify

log = logging.getLogger(__name__)

# Con cuántos días de anticipación se avisa. Emilio pidió "de 5 días a una
# semana": se toma el extremo largo porque el aviso no cuesta nada extra y le
# deja a la asistente una semana hábil completa para localizar a la paciente.
ANTICIPACION_DIAS = 7

# Cuánto después de la revisión se sigue considerando que una cita "es" ese
# control. Una paciente citada tres días después de la fecha sugerida no está
# perdida, está agendada: avisar de ella sería ruido, y el ruido es lo que hace
# que se dejen de leer los avisos que sí importan.
HOLGURA_CITA_DIAS = 7

# Freno. Si una corrida fuera a mandar más avisos que esto, no manda ninguno.
TOPE_AVISOS = int(os.getenv("PRENATAL_TOPE_AVISOS", "40"))


@dataclass
class Resumen:
    """Qué hizo la corrida. Se devuelve para que la bitácora lo pueda contar."""

    candidatos: int = 0
    ya_avisados: int = 0
    con_cita: int = 0
    avisados: int = 0
    destinatarios: int = 0
    sin_destinatario: int = 0
    bloqueados_por_tope: int = 0
    tenants_sin_asistente: set[int] = field(default_factory=set)


def _asistentes_de(db: Session, embarazo: Pregnancy) -> list[User]:
    """Quién de recepción recibe el aviso de este embarazo.

    Por permiso de agendar (un perfil personalizado de recepción también
    cuenta) y, si la doctora del embarazo tiene asistentes asignadas, sólo
    ellas (plan 27, D-a y D-5). Es el mismo criterio que el resto de los avisos
    a recepción, en ``destinatarios_de_recepcion``.
    """
    return destinatarios_de_recepcion(
        db, tenant_id=embarazo.tenant_id, permiso="appointments.create", doctor_id=embarazo.doctor_id
    )


def _ventana_de_cita(embarazo: Pregnancy, hoy: date) -> tuple[datetime, datetime]:
    """La ventana en la que una cita cuenta como que la paciente va a pasar por
    este control: de hoy hasta la revisión más la holgura (y no de la revisión
    en adelante, para que una cita ya agendada para antes también cuente).

    Es la ÚNICA definición de la ventana; la comparten la comprobación de a una
    (``_tiene_cita``) y la de a lotes (``_embarazos_ya_citados``), para que el
    tablero de revisión prenatal y este aviso nunca difieran en qué es "ya está
    citada".
    """
    inicio = datetime.combine(hoy, datetime.min.time())
    hasta = embarazo.next_review_on + timedelta(days=HOLGURA_CITA_DIAS)
    fin = datetime.combine(hasta + timedelta(days=1), datetime.min.time())
    return inicio, fin


def _tiene_cita(db: Session, embarazo: Pregnancy, hoy: date) -> bool:
    """¿La paciente ya está citada para este control?"""
    inicio, fin = _ventana_de_cita(embarazo, hoy)
    return (
        db.query(Appointment.id)
        .filter(
            Appointment.patient_id == embarazo.patient_id,
            Appointment.status != AppointmentStatus.CANCELADA,
            Appointment.scheduled_at >= inicio,
            Appointment.scheduled_at < fin,
        )
        .first()
        is not None
    )


def _embarazos_ya_citados(db: Session, embarazos: list[Pregnancy], hoy: date) -> set[int]:
    """Cuáles de estos embarazos ya tienen a la paciente citada, en UNA consulta.

    Misma ventana que ``_tiene_cita`` (comparten ``_ventana_de_cita``), pero
    resuelta a lotes para el tablero (B-07): antes era una consulta por embarazo.
    Devuelve el conjunto de ``pregnancy_id`` que ya están citados.
    """
    embarazos = [e for e in embarazos if e.next_review_on is not None]
    if not embarazos:
        return set()
    patient_ids = {e.patient_id for e in embarazos}
    inicio = datetime.combine(hoy, datetime.min.time())
    # Cota superior común: la ventana más lejana de todo el lote. Se trae de una
    # y luego cada embarazo se compara contra SU ventana en memoria.
    fin_max = max(_ventana_de_cita(e, hoy)[1] for e in embarazos)
    filas = (
        db.query(Appointment.patient_id, Appointment.scheduled_at)
        .filter(
            Appointment.patient_id.in_(patient_ids),
            Appointment.status != AppointmentStatus.CANCELADA,
            Appointment.scheduled_at >= inicio,
            Appointment.scheduled_at < fin_max,
        )
        .all()
    )
    citas_por_paciente: dict[int, list[datetime]] = {}
    for pid, cuando in filas:
        citas_por_paciente.setdefault(pid, []).append(cuando)
    citados: set[int] = set()
    for embarazo in embarazos:
        ini, fin = _ventana_de_cita(embarazo, hoy)
        for cuando in citas_por_paciente.get(embarazo.patient_id, ()):
            if ini <= cuando < fin:
                citados.add(embarazo.id)
                break
    return citados


def _nombre(db: Session, patient_id: int) -> str:
    paciente = db.query(Patient).filter(Patient.id == patient_id).first()
    if not paciente:
        return "la paciente"
    return " ".join(filter(None, [paciente.first_name, paciente.last_name])) or "la paciente"


def ejecutar(db: Session, *, aplicar: bool = True, hoy: date | None = None) -> Resumen:
    """Barre los embarazos con revisión próxima sin cita y avisa a recepción.

    ``aplicar=False`` deja ver qué saldría sin escribir nada, que es la forma de
    revisar el freno antes de subirlo.
    """
    hoy = hoy or hoy_local()
    resumen = Resumen()

    candidatos = (
        db.query(Pregnancy)
        .filter(
            Pregnancy.status == PregnancyStatus.ACTIVE.value,
            Pregnancy.next_review_on.isnot(None),
            Pregnancy.next_review_on >= hoy,
            Pregnancy.next_review_on <= hoy + timedelta(days=ANTICIPACION_DIAS),
        )
        .all()
    )
    resumen.candidatos = len(candidatos)

    pendientes: list[Pregnancy] = []
    for embarazo in candidatos:
        # Primero la marca: es una comparación en memoria y descarta la inmensa
        # mayoría sin pegarle a la tabla de citas una vez por embarazo.
        if embarazo.next_review_reminded_on == embarazo.next_review_on:
            resumen.ya_avisados += 1
            continue
        if _tiene_cita(db, embarazo, hoy):
            resumen.con_cita += 1
            continue
        pendientes.append(embarazo)

    if len(pendientes) > TOPE_AVISOS:
        # No se escribe nada, ni siquiera parcialmente: media corrida aplicada
        # dejaría marcados unos embarazos y otros no, y la siguiente corrida
        # tendría un tope distinto del que alguien revisó.
        resumen.bloqueados_por_tope = len(pendientes)
        log.warning(
            "Aviso de revision prenatal: %s embarazos darian aviso (tope %s); "
            "no se manda ninguno. Revisar el listado y subir PRENATAL_TOPE_AVISOS "
            "a sabiendas si es la carga inicial.",
            len(pendientes),
            TOPE_AVISOS,
        )
        return resumen

    for embarazo in pendientes:
        destinatarios = _asistentes_de(db, embarazo)
        if not destinatarios:
            # No se marca como avisado: si mañana existe una cuenta de recepción,
            # el aviso tiene que salir. Marcarlo aquí lo perdería para siempre.
            resumen.sin_destinatario += 1
            resumen.tenants_sin_asistente.add(embarazo.tenant_id)
            continue

        if not aplicar:
            resumen.avisados += 1
            resumen.destinatarios += len(destinatarios)
            continue

        nombre = _nombre(db, embarazo.patient_id)
        for cuenta in destinatarios:
            notify(
                db,
                tenant_id=embarazo.tenant_id,
                user_id=cuenta.id,
                type=NotificationType.PRENATAL_REVIEW_DUE,
                title="Control prenatal sin cita",
                message=(
                    f"{nombre} tiene revisión prenatal el "
                    f"{embarazo.next_review_on.strftime('%d/%m/%Y')} y no tiene cita "
                    "agendada. Contáctala para programarla."
                ),
                entity_type="patient",
                entity_id=embarazo.patient_id,
                dedupe_key=f"prenatal_review_due:patient:{embarazo.patient_id}:{embarazo.next_review_on.isoformat()}",
            )
        # Los avisos y la marca de «ya se avisó» se confirman juntos: o quedan
        # los dos o ninguno, y la corrida de mañana no repite ni se salta nada.
        embarazo.next_review_reminded_on = embarazo.next_review_on
        db.add(embarazo)
        db.commit()
        resumen.avisados += 1
        resumen.destinatarios += len(destinatarios)

    return resumen


def lineas_resumen(resumen: Resumen, *, aplicar: bool = True) -> list[str]:
    """El resumen en texto, para que la corrida no quede en silencio.

    El programador corría a ciegas hasta hoy; un trabajo que decide no mandar
    nada tiene que poder distinguirse de uno que no corrió.
    """
    verbo = "se avisó de" if aplicar else "se avisaría de"
    lineas = [
        f"Aviso de revision prenatal: {resumen.candidatos} embarazos en la ventana "
        f"de {ANTICIPACION_DIAS} dias",
        f"  {resumen.ya_avisados} ya avisados para esa misma fecha",
        f"  {resumen.con_cita} ya tienen cita agendada",
        f"  {verbo} {resumen.avisados} ({resumen.destinatarios} avisos a recepcion)",
    ]
    if resumen.sin_destinatario:
        lineas.append(
            f"  !!! {resumen.sin_destinatario} sin cuenta de recepcion activa a quien "
            f"avisar (sucursales {sorted(resumen.tenants_sin_asistente)}); se "
            "reintenta en la siguiente corrida"
        )
    if resumen.bloqueados_por_tope:
        lineas.append(
            f"  !!! FRENO: {resumen.bloqueados_por_tope} avisos superaban el tope de "
            f"{TOPE_AVISOS}; NO se mando ninguno. Subir PRENATAL_TOPE_AVISOS a "
            "sabiendas si es la carga inicial."
        )
    return lineas


if __name__ == "__main__":  # pragma: no cover
    import argparse

    from app.db.session import SessionLocal

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Manda los avisos; sin esto solo reporta que saldria.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    sesion = SessionLocal()
    try:
        for linea in lineas_resumen(
            ejecutar(sesion, aplicar=args.aplicar), aplicar=args.aplicar
        ):
            print(linea)
    finally:
        sesion.close()
