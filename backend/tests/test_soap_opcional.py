"""La nota clínica no debe bloquear la emisión de la receta.

El doctor puede documentar la nota después: las cuatro secciones son
opcionales y se guardan vacías, no se rechaza la petición.
"""
import pytest
from pydantic import ValidationError

from app.schemas.soap_note import SOAPNoteCreate, SOAPNoteUpdate


def test_nota_vacia_es_valida():
    """Emitir receta sin documentar nada todavía."""
    nota = SOAPNoteCreate(appointment_id=1)
    assert nota.subjective == ""
    assert nota.objective == ""
    assert nota.assessment == ""
    assert nota.plan == ""


def test_nota_parcial_es_valida():
    """El doctor anota solo el plan y guarda."""
    nota = SOAPNoteCreate(appointment_id=1, plan="REPOSO RELATIVO")
    assert nota.plan == "REPOSO RELATIVO"
    assert nota.subjective == ""


def test_nulos_se_guardan_como_cadena_vacia():
    """Las columnas son NOT NULL: un None del cliente no debe reventar."""
    nota = SOAPNoteCreate(appointment_id=1, subjective=None, plan=None)
    assert nota.subjective == ""
    assert nota.plan == ""


def test_nota_completa_sigue_funcionando():
    nota = SOAPNoteCreate(
        appointment_id=1,
        subjective="DOLOR ABDOMINAL",
        objective="ABDOMEN BLANDO",
        assessment="DISMENORREA",
        plan="ANALGESICO",
    )
    assert nota.assessment == "DISMENORREA"


def test_appointment_id_sigue_siendo_obligatorio():
    """Aflojar las secciones no debe aflojar el vínculo con la cita."""
    with pytest.raises(ValidationError):
        SOAPNoteCreate()


def test_update_parcial_no_se_ve_afectado():
    actualizacion = SOAPNoteUpdate(plan="CONTROL EN 15 DIAS")
    assert actualizacion.plan == "CONTROL EN 15 DIAS"
    assert actualizacion.subjective is None
