"""Ocupacion de salas entre doctores, y el margen para registrar a toro pasado.

Dos peticiones del consultorio:

1. Yara y Cintia agendan a sus propias pacientes, pero ``GET /appointments``
   acota a cada doctor a SUS citas: no veian que Adolfo ya tenia tomada la
   Sala 1. Para repartirse dos salas entre cuatro doctores hace falta ver la
   ocupacion ajena, sin ver a los pacientes ajenas.
2. Las horas pasadas se ofrecian como ocupadas, pero a veces hay que dejar
   constancia de una consulta que ya ocurrio esa manana.
"""
from datetime import datetime, timedelta

from app.services.availability_service import MOTIVO_PASADO


from app.services.availability_service import _Agenda, _motivo_ocupada


def _agenda_vacia() -> _Agenda:
    """Sin citas, sin bloqueos y sin salas: solo se evalua el tiempo."""
    return _Agenda(citas_doctor=[], bloqueos=[], salas=[], citas_por_sala={})


def _motivo(inicio, ahora):
    return _motivo_ocupada(
        agenda=_agenda_vacia(),
        inicio=inicio,
        duracion=30,
        room_id=None,
        ahora=ahora,
    )


def test_una_hora_pasada_se_marca_ocupada():
    """Sin margen: el consultorio prefiere que se registre con hora posterior
    antes que ver franjas pasadas ofrecidas como libres."""
    ahora = datetime(2026, 9, 21, 12, 0)
    assert _motivo(ahora - timedelta(minutes=1), ahora) == MOTIVO_PASADO
    assert _motivo(ahora - timedelta(hours=2), ahora) == MOTIVO_PASADO


def test_la_hora_en_curso_todavia_vale():
    ahora = datetime(2026, 9, 21, 12, 0)
    assert _motivo(ahora, ahora) != MOTIVO_PASADO


def test_el_futuro_nunca_es_pasado():
    ahora = datetime(2026, 9, 21, 12, 0)
    assert _motivo(ahora + timedelta(hours=1), ahora) != MOTIVO_PASADO
