"""La ficha de la paciente para recepción, sin lo clínico (opción C, plan 32).

Decisión de Emilio: recepción ve y captura nombre, contacto, fecha de
nacimiento, alergias y FUR. No ve ni captura antecedentes personales,
familiares ni ginecológicos, datos obstétricos ni las notas de referencia de
la doctora. Lo que importa de verdad: que al guardar recepción la ficha, los
antecedentes que capturó la doctora queden intactos.
"""
from datetime import date

from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import Role
from app.schemas.patient import CAMPOS_CLINICOS_DE_FICHA

from _cobros_base import PREFIX, client, db_session, headers, usuario  # noqa: F401

ANTECEDENTES = {
    "personal_history": "ASMA LEVE",
    "family_history": "MADRE CON DIABETES",
    "gynecological_history": "MENARCA 12",
    "menarca_age": 12,
    "ivsa_age": 18,
    "menstrual_rhythm": "28X5",
    "birth_control": "DIU",
    "expected_delivery_date": date(2027, 1, 10),
    "notas_referencia": "LA RECOMENDÓ LA DRA. RUIZ",
    "gestas": 2,
    "paras": 1,
    "cesareas": 1,
    "abortos": 0,
}


def _escenario(db):
    tenant = Tenant(name="Consultorio", is_active=True)
    otra = Tenant(name="Otra sucursal", is_active=True)
    db.add_all([tenant, otra])
    db.commit()
    recepcion = usuario(db, tenant, "Lupita Recepcion", Role.SECRETARIA)
    doctora = usuario(db, tenant, "Dra Cintia", Role.DOCTOR)
    recepcion_otra = usuario(db, otra, "Recepcion Otra", Role.SECRETARIA)
    paciente = Patient(
        tenant_id=tenant.id, first_name="ANA", last_name="LÓPEZ", cell_phone="6691112233",
        owner_doctor_id=doctora.id, allergies="PENICILINA", **ANTECEDENTES,
    )
    db.add(paciente)
    db.commit()
    return recepcion, doctora, recepcion_otra, paciente


def test_recepcion_guarda_la_ficha_y_los_antecedentes_quedan_intactos(client, db_session):
    recepcion, _, _, paciente = _escenario(db_session)

    r = client.put(
        f"{PREFIX}/patients/{paciente.id}",
        headers=headers(db_session, recepcion),
        # Un formulario viejo podría mandarlos vacíos: no deben borrar nada.
        json={
            "cell_phone": "6699998877",
            "allergies": "penicilina, látex",
            "last_menstrual_period": "2026-09-20",
            "date_of_birth": "1990-05-20",
            "personal_history": "",
            "family_history": None,
            "gestas": 0,
            "notas_referencia": "",
        },
    )

    assert r.status_code == 200, r.text
    db_session.refresh(paciente)
    assert paciente.cell_phone == "6699998877"
    assert paciente.allergies == "PENICILINA, LÁTEX"
    assert paciente.last_menstrual_period == date(2026, 9, 20)
    assert paciente.date_of_birth == date(1990, 5, 20)
    for campo, valor in ANTECEDENTES.items():
        assert getattr(paciente, campo) == valor, campo


def test_recepcion_no_recibe_lo_clinico_ni_en_la_ficha_ni_en_la_lista(client, db_session):
    recepcion, _, _, paciente = _escenario(db_session)
    h = headers(db_session, recepcion)

    ficha = client.get(f"{PREFIX}/patients/{paciente.id}", headers=h).json()
    lista = client.get(f"{PREFIX}/patients", headers=h).json()

    for datos in (ficha, lista[0]):
        assert datos["antecedentes_visibles"] is False
        for campo in CAMPOS_CLINICOS_DE_FICHA:
            assert datos[campo] is None, campo
        # Lo que sí le toca.
        assert datos["allergies"] == "PENICILINA"
        assert datos["first_name"] == "ANA"


def test_la_doctora_si_ve_los_antecedentes(client, db_session):
    _, doctora, _, paciente = _escenario(db_session)

    ficha = client.get(f"{PREFIX}/patients/{paciente.id}", headers=headers(db_session, doctora)).json()

    assert ficha["antecedentes_visibles"] is True
    assert ficha["personal_history"] == "ASMA LEVE"
    assert ficha["gestas"] == 2
    assert ficha["notas_referencia"] == "LA RECOMENDÓ LA DRA. RUIZ"


def test_la_doctora_si_los_puede_editar(client, db_session):
    _, doctora, _, paciente = _escenario(db_session)

    r = client.put(
        f"{PREFIX}/patients/{paciente.id}",
        headers=headers(db_session, doctora),
        json={"personal_history": "asma controlada"},
    )

    assert r.status_code == 200, r.text
    db_session.refresh(paciente)
    assert paciente.personal_history == "ASMA CONTROLADA"


def test_recepcion_de_otra_sucursal_no_la_ve(client, db_session):
    _, _, recepcion_otra, paciente = _escenario(db_session)
    h = headers(db_session, recepcion_otra)

    assert client.get(f"{PREFIX}/patients/{paciente.id}", headers=h).status_code == 404
    assert client.put(f"{PREFIX}/patients/{paciente.id}", headers=h, json={"allergies": "X"}).status_code == 404
    assert client.get(f"{PREFIX}/patients", headers=h).json() == []
