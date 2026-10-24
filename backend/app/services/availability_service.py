"""Huecos libres de la agenda: qué franjas de un día y qué días de un mes
admiten de verdad una cita.

Por qué existe
--------------
El modal de cita promete "Horarios disponibles" y pinta días como
"No disponible". Hasta ahora nadie calculaba eso: la pantalla habría ofrecido
horas que el servidor rechaza al guardar, que es peor que no ofrecer ninguna.

Este módulo **no inventa reglas nuevas**: compone exactamente las mismas que
aplica ``POST /appointments`` antes de guardar:

1. Empalme con otra cita del doctor  (``check_appointment_collision``)
2. Bloqueo de agenda del doctor      (``check_schedule_block_collision``)
3. Horario de atención del doctor    (``check_outside_working_hours``)
4. Choque de sala                    (``find_room_collision``)

El criterio de solapamiento es **uno solo** para todos: ``se_solapa`` /
``se_solapa_rango`` de ``appointment_service``. Aquí se reutiliza esa función
sobre filas ya cargadas en memoria en vez de llamar a los ``check_*`` una vez
por franja, porque un mes son ~1 500 franjas y serían miles de consultas; lo
que NO se duplica es la aritmética del solape, que es donde dos implementaciones
acabarían discrepando. ``tests/test_disponibilidad.py`` comprueba franja a
franja que esto y ``POST /appointments`` responden lo mismo.

Decisiones que conviene conocer
-------------------------------
* **Día sin horario de atención configurado.** ``check_outside_working_hours``
  trata "este doctor no tiene ventanas ese día" como "sin restricción", así que
  hoy el servidor acepta cualquier hora. Es un fallo conocido y aquí NO se
  corrige. Lo que se hace es mostrar ese día como disponible con la **jornada
  por defecto del consultorio (07:00–20:00)**, la misma que dibuja la agenda:
  todo lo que se ofrece es agendable, simplemente no se ofrecen las 3 de la
  madrugada. La respuesta lo dice con ``jornada_por_defecto: true`` para que la
  pantalla pueda avisar.
* **Horas ya pasadas.** El servidor sí deja agendar en el pasado (se usa para
  registrar citas a toro pasado). El modal, en cambio, no debe ofrecerlas: se
  devuelven como no disponibles con motivo propio. Es la **única** divergencia
  deliberada, y va en esa dirección (nunca se ofrece algo que se rechazaría).
  Se compara contra ``ahora_local()``: ``scheduled_at`` guarda hora local del
  consultorio, no UTC.
* **Sala.** Con ``room_id`` se mira esa sala. Sin él, la franja está libre si
  queda **alguna** sala activa libre (o si la sucursal no tiene salas). Que la
  sala sea obligatoria al crear es una validación del formulario, no del
  horario.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.hora_local import ahora_local
from app.models.appointment import Appointment
from app.models.consultation_room import ConsultationRoom
from app.models.doctor_schedule import DoctorWorkingHours, ScheduleBlock
from app.services.appointment_service import (
    ESTADOS_QUE_OCUPAN,
    active_rooms,
    se_solapa,
    se_solapa_rango,
)

# Jornada visible de la agenda (docs/DESIGN.md §6). Se usa como horario de
# atención supuesto cuando el doctor no tiene ninguno configurado ese día.
JORNADA_POR_DEFECTO_INICIO = time(7, 0)
JORNADA_POR_DEFECTO_FIN = time(20, 0)

#: Cada cuántos minutos se ofrece una franja.
PASO_POR_DEFECTO = 15

# Los motivos son los MISMOS textos que devuelve el backend al rechazar el
# POST, para que la pantalla y el error digan lo mismo.
MOTIVO_CITA = "El doctor ya tiene otra cita a esa hora. Elige un horario libre."
MOTIVO_BLOQUEO = "El doctor no está disponible en ese horario (tiene un bloqueo en su agenda)."
MOTIVO_FUERA_HORARIO = "Ese horario está fuera del horario de atención del doctor."
MOTIVO_SALAS = "No queda ninguna sala libre a esa hora."
MOTIVO_SALA = "Esa sala ya está ocupada a esa hora."
MOTIVO_PASADO = "Esa hora ya pasó."


# ─────────────────────────── funciones puras ───────────────────────────


@dataclass(frozen=True)
class Ventana:
    """Un tramo continuo de horario de atención dentro de un día."""

    inicio: time
    fin: time


def generar_franjas(
    dia: date,
    ventanas: list[Ventana],
    duracion_minutos: int,
    paso_minutos: int = PASO_POR_DEFECTO,
) -> list[datetime]:
    """Inicios de franja que **caben enteros** dentro de alguna ventana.

    Pura y sin base de datos a propósito: es la aritmética que decide qué
    horas se ofrecen, y se prueba sola. Que la franja quepa entera es lo que
    garantiza que ``check_outside_working_hours`` no la rechazará después.
    """
    if duracion_minutos <= 0 or paso_minutos <= 0:
        return []

    inicios: set[datetime] = set()
    for ventana in ventanas:
        if ventana.fin <= ventana.inicio:
            continue
        actual = datetime.combine(dia, ventana.inicio)
        limite = datetime.combine(dia, ventana.fin)
        while actual + timedelta(minutes=duracion_minutos) <= limite:
            inicios.add(actual)
            actual += timedelta(minutes=paso_minutos)

    return sorted(inicios)


def meridiano_de(momento: datetime) -> str:
    """``"am"`` antes de las 12:00, ``"pm"`` a partir de las 12:00.

    El conmutador del modal reparte por esto. Las 12:00 en punto es p. m.,
    que es como lo lee cualquiera en el mostrador.
    """
    return "am" if momento.hour < 12 else "pm"


def etiqueta_hora(momento: datetime) -> str:
    """``"09:00"``. La rejilla la muestra en 24 h, como el resto del sistema."""
    return momento.strftime("%H:%M")


# ─────────────────────── horario de atención del día ───────────────────────


def ventanas_del_dia(
    db: Session,
    doctor_id: int,
    dia: date,
) -> tuple[list[Ventana], bool]:
    """Ventanas de atención de ese día y si son la jornada por defecto.

    Devuelve ``(ventanas, jornada_por_defecto)``. Sin filas configuradas para
    ese día de la semana el servidor no restringe nada, así que se supone la
    jornada del consultorio en vez de ofrecer las 24 horas.
    """
    filas = (
        db.query(DoctorWorkingHours)
        .filter(
            DoctorWorkingHours.doctor_id == doctor_id,
            DoctorWorkingHours.weekday == dia.weekday(),
        )
        .order_by(DoctorWorkingHours.start_time)
        .all()
    )
    if not filas:
        return [Ventana(JORNADA_POR_DEFECTO_INICIO, JORNADA_POR_DEFECTO_FIN)], True

    return [Ventana(f.start_time, f.end_time) for f in filas], False


# ─────────────────────────── evaluación ───────────────────────────


@dataclass
class _Agenda:
    """Todo lo que ocupa agenda, cargado una vez para no consultar por franja."""

    citas_doctor: list[tuple[datetime, int]]
    bloqueos: list[tuple[datetime, datetime]]
    salas: list[ConsultationRoom]
    citas_por_sala: dict[int, list[tuple[datetime, int]]]


def _cargar_agenda(
    db: Session,
    doctor_id: int,
    tenant_id: int,
    desde: datetime,
    hasta: datetime,
    excluir_cita_id: Optional[int],
) -> _Agenda:
    """Citas, bloqueos y salas del rango. Mismos filtros que los ``check_*``:
    sólo los estados que ocupan de verdad (una cita **cancelada** no reserva)."""
    margen = timedelta(days=1)

    def _citas(query):
        query = query.filter(
            Appointment.status.in_(ESTADOS_QUE_OCUPAN),
            Appointment.scheduled_at >= desde - margen,
            Appointment.scheduled_at <= hasta + margen,
        )
        if excluir_cita_id:
            query = query.filter(Appointment.id != excluir_cita_id)
        return query

    citas_doctor = [
        (c.scheduled_at, c.duration_minutes)
        for c in _citas(db.query(Appointment).filter(Appointment.doctor_id == doctor_id)).all()
    ]

    bloqueos = [
        (b.start_at, b.end_at)
        for b in db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.doctor_id == doctor_id,
            ScheduleBlock.end_at >= desde - margen,
            ScheduleBlock.start_at <= hasta + margen,
        )
        .all()
    ]

    salas = active_rooms(db, tenant_id)
    citas_por_sala: dict[int, list[tuple[datetime, int]]] = {s.id: [] for s in salas}
    if salas:
        ocupacion = _citas(
            db.query(Appointment).filter(Appointment.room_id.in_([s.id for s in salas]))
        ).all()
        for cita in ocupacion:
            citas_por_sala[cita.room_id].append((cita.scheduled_at, cita.duration_minutes))

    return _Agenda(citas_doctor, bloqueos, salas, citas_por_sala)


def _motivo_ocupada(
    agenda: _Agenda,
    inicio: datetime,
    duracion: int,
    room_id: Optional[int],
    ahora: Optional[datetime],
) -> Optional[str]:
    """``None`` si la franja está libre; si no, el porqué, en español.

    El orden de comprobación replica el de ``POST /appointments`` para que el
    motivo que se enseña sea el mismo error que se recibiría al guardar.
    """
    if ahora is not None and inicio < ahora:
        return MOTIVO_PASADO

    for otro_inicio, otra_duracion in agenda.citas_doctor:
        if se_solapa(inicio, duracion, otro_inicio, otra_duracion):
            return MOTIVO_CITA

    for bloque_inicio, bloque_fin in agenda.bloqueos:
        if se_solapa_rango(inicio, duracion, bloque_inicio, bloque_fin):
            return MOTIVO_BLOQUEO

    if not agenda.salas:
        # Sucursal sin salas configuradas: la sala no restringe nada.
        return None

    if room_id is not None:
        ocupadas = agenda.citas_por_sala.get(room_id, [])
        if any(se_solapa(inicio, duracion, i, d) for i, d in ocupadas):
            return MOTIVO_SALA
        return None

    # Sin sala elegida: basta con que quede una libre.
    for sala in agenda.salas:
        ocupadas = agenda.citas_por_sala.get(sala.id, [])
        if not any(se_solapa(inicio, duracion, i, d) for i, d in ocupadas):
            return None

    return MOTIVO_SALAS


@dataclass
class Franja:
    inicio: datetime
    hora: str
    meridiano: str
    disponible: bool
    motivo: Optional[str]


def franjas_del_dia(
    db: Session,
    doctor_id: int,
    tenant_id: int,
    dia: date,
    duracion_minutos: int,
    paso_minutos: int = PASO_POR_DEFECTO,
    room_id: Optional[int] = None,
    excluir_cita_id: Optional[int] = None,
    ocultar_pasado: bool = True,
) -> tuple[list[Franja], bool]:
    """Todas las franjas del día, cada una con si se puede agendar y por qué no.

    Se devuelven también las ocupadas: la asistente necesita ver que las 10:00
    existen y están tomadas, no que desaparezcan de la rejilla.
    """
    ventanas, jornada_por_defecto = ventanas_del_dia(db, doctor_id, dia)
    inicios = generar_franjas(dia, ventanas, duracion_minutos, paso_minutos)
    if not inicios:
        return [], jornada_por_defecto

    agenda = _cargar_agenda(
        db,
        doctor_id,
        tenant_id,
        datetime.combine(dia, time.min),
        datetime.combine(dia, time.max),
        excluir_cita_id,
    )
    ahora = ahora_local() if ocultar_pasado else None

    franjas = []
    for inicio in inicios:
        motivo = _motivo_ocupada(agenda, inicio, duracion_minutos, room_id, ahora)
        franjas.append(
            Franja(
                inicio=inicio,
                hora=etiqueta_hora(inicio),
                meridiano=meridiano_de(inicio),
                disponible=motivo is None,
                motivo=motivo,
            )
        )
    return franjas, jornada_por_defecto


@dataclass
class DiaConHuecos:
    fecha: date
    disponible: bool
    huecos: int


def dias_del_mes(
    db: Session,
    doctor_id: int,
    tenant_id: int,
    anio: int,
    mes: int,
    duracion_minutos: int,
    paso_minutos: int = PASO_POR_DEFECTO,
    room_id: Optional[int] = None,
    excluir_cita_id: Optional[int] = None,
    ocultar_pasado: bool = True,
) -> list[DiaConHuecos]:
    """Qué días del mes admiten al menos una cita: la leyenda del calendario.

    Toda la agenda del mes se carga de una vez; después es aritmética en
    memoria con el mismo ``se_solapa`` de siempre.
    """
    primero = date(anio, mes, 1)
    ultimo = date(anio + (mes == 12), (mes % 12) + 1, 1) - timedelta(days=1)

    agenda = _cargar_agenda(
        db,
        doctor_id,
        tenant_id,
        datetime.combine(primero, time.min),
        datetime.combine(ultimo, time.max),
        excluir_cita_id,
    )
    ahora = ahora_local() if ocultar_pasado else None

    # El horario de atención es semanal: se resuelve una vez por día de la
    # semana y no una vez por cada día del mes.
    ventanas_por_weekday: dict[int, list[Ventana]] = {}

    resultado: list[DiaConHuecos] = []
    dia = primero
    while dia <= ultimo:
        if dia.weekday() not in ventanas_por_weekday:
            ventanas_por_weekday[dia.weekday()] = ventanas_del_dia(db, doctor_id, dia)[0]
        ventanas = ventanas_por_weekday[dia.weekday()]
        huecos = sum(
            1
            for inicio in generar_franjas(dia, ventanas, duracion_minutos, paso_minutos)
            if _motivo_ocupada(agenda, inicio, duracion_minutos, room_id, ahora) is None
        )
        resultado.append(DiaConHuecos(fecha=dia, disponible=huecos > 0, huecos=huecos))
        dia += timedelta(days=1)

    return resultado
