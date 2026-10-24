"""Los tipos del modelo tienen que concordar con los de los schemas.

Motivo real: ``pregnancies.is_multiple_gestation`` se creo como INTEGER
mientras los schemas lo declaraban ``bool``. PostgreSQL rechazaba el INSERT
con DatatypeMismatch, asi que **registrar un embarazo nunca funciono en
produccion** — durante mas de un mes, sin que nadie lo notara.

Las pruebas de extremo a extremo no lo detectan porque corren sobre SQLite,
que acepta un booleano en una columna entera. Solo PostgreSQL es estricto.
De ahi esta comprobacion, que mira los tipos directamente.
"""
import pytest
from sqlalchemy import Boolean, Integer

from app.models.clinical_image import ClinicalImage
from app.models.consultation_room import ConsultationRoom
from app.models.doctor_profile import DoctorProfile
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy
from app.models.tenant import Tenant
from app.models.user import User

# Modelos cuyos campos booleanos conviene fijar: los que ya mordieron o los
# que viajan en formularios y acabarian igual.
MODELOS = [
    Pregnancy,
    Patient,
    User,
    Tenant,
    ClinicalImage,
    ConsultationRoom,
    DoctorProfile,
]


def _columnas_con_pinta_de_booleano(modelo):
    for columna in modelo.__table__.columns:
        nombre = columna.name
        # "mostrar_"/"show_" cubren los interruptores de la receta: hoy viven
        # en un JSON, pero si manana alguien los saca a columnas sueltas, que
        # no las cree Integer.
        if nombre.startswith(("is_", "has_", "mostrar_", "show_")) or nombre in {
            "must_change_password"
        }:
            yield columna


@pytest.mark.parametrize("modelo", MODELOS, ids=lambda m: m.__name__)
def test_los_campos_booleanos_son_columnas_booleanas(modelo):
    """Un campo 'is_algo' guardado como Integer revienta en PostgreSQL."""
    for columna in _columnas_con_pinta_de_booleano(modelo):
        assert isinstance(columna.type, Boolean), (
            f"{modelo.__name__}.{columna.name} es {columna.type!r}; "
            "un campo booleano debe ser Boolean o PostgreSQL rechaza el INSERT"
        )


def test_el_caso_que_rompio_produccion():
    """Regresion explicita de is_multiple_gestation."""
    columna = Pregnancy.__table__.columns["is_multiple_gestation"]
    assert isinstance(columna.type, Boolean)
    assert not isinstance(columna.type, Integer)


def test_un_entero_de_verdad_sigue_siendo_entero():
    """La comprobacion no debe convertir en booleano lo que si es un numero."""
    assert isinstance(Pregnancy.__table__.columns["fetus_count"].type, Integer)
