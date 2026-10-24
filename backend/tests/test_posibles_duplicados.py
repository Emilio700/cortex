"""Advertencia de posible paciente duplicada (B-06 parte API y S-06).

Expedientes gemelos parten el historial: el médico decide con la mitad de la
información. Decisión de Emilio (3.5): **sólo advertir**. El sistema enseña
quién podría ser la mismo paciente y deja continuar; no bloquea el alta, no
agrega índices únicos y no fusiona.

Se comprueba que encuentra a la mismo paciente aunque el teléfono o el nombre
estén escritos distinto, que devuelve sólo lo necesario para reconocerla, que
respeta el alcance de quien pregunta y que el alta sigue pasando.
"""
from datetime import date

import pytest

from app.models.patient import Patient
from app.utils.telefono import enmascarar_telefono, normalizar_telefono_mx

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)

RUTA = f"{PREFIX}/patients/possible-duplicates"


def _paciente(db, tenant, **datos):
    paciente = Patient(tenant_id=tenant.id, is_active=True, **datos)
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


def _preguntar(client, db_session, quien, **consulta):
    respuesta = client.post(RUTA, json=consulta, headers=_auth_headers(db_session, quien))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _ids(cuerpo):
    return [c["patient_id"] for c in cuerpo["candidatos"]]


# ---------------------------------------------------------------------------
# Teléfonos de México
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("capturado", [
    "6691112233", "669 111 2233", "(669) 111-22-33", "669.111.22.33",
    "+52 669 111 2233", "+52 1 669 111 2233", "521 669 111 2233", "044 669 111 2233", "01 669 111 2233",
])
def test_un_telefono_de_mexico_se_reduce_a_sus_diez_digitos(capturado):
    assert normalizar_telefono_mx(capturado) == "6691112233"


@pytest.mark.parametrize("capturado", ["", None, "669 111", "12345678901", "+1 555 123 4567 8", "sin número"])
def test_lo_que_no_es_un_telefono_de_diez_digitos_no_se_normaliza(capturado):
    assert normalizar_telefono_mx(capturado) is None


def test_el_telefono_se_muestra_solo_con_los_ultimos_cuatro_digitos():
    assert enmascarar_telefono("+52 1 669 111 2233") == "•••-•••-2233"
    assert enmascarar_telefono(None) is None


# ---------------------------------------------------------------------------
# Qué encuentra
# ---------------------------------------------------------------------------

def test_encuentra_a_la_misma_paciente_por_el_telefono_escrito_distinto(client, db_session, escenario):
    guardada = _paciente(db_session, escenario["tenant"], first_name="ANA", last_name="RUIZ", cell_phone="669 111 22 33")

    cuerpo = _preguntar(client, db_session, escenario["secretaria"], first_name="Rosa", last_name="Soto",
                        phone="+52 1 (669) 111-2233")

    assert cuerpo["telefonos"] == [{"campo": "phone", "normalizado": "6691112233", "valido": True}]
    candidatos = {c["patient_id"]: c for c in cuerpo["candidatos"]}
    assert candidatos[guardada.id]["motivos"] == ["telefono"]
    assert candidatos[guardada.id]["coincidencia"] == "alta"
    assert candidatos[guardada.id]["telefono_enmascarado"] == "•••-•••-2233"
    # El paciente del escenario tiene el mismo número en ``phone``.
    assert escenario["paciente"].id in candidatos


def test_encuentra_por_nombre_sin_importar_acentos_ni_mayusculas(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], first_name="maria", last_name="LOPEZ")

    (candidata,) = cuerpo["candidatos"]
    assert candidata["patient_id"] == escenario["paciente"].id
    assert candidata["full_name"] == "María López Pérez"
    assert candidata["motivos"] == ["nombre"]
    assert candidata["coincidencia"] == "media"


def test_nombre_y_fecha_de_nacimiento_juntos_son_coincidencia_alta(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], first_name="María José", last_name="López",
                        date_of_birth="1990-05-20")

    (candidata,) = cuerpo["candidatos"]
    assert candidata["motivos"] == ["nombre", "fecha_de_nacimiento"]
    assert candidata["coincidencia"] == "alta"
    assert candidata["date_of_birth"] == "1990-05-20"


def test_apellido_y_fecha_de_nacimiento_encuentran_aunque_el_nombre_venga_abreviado(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], first_name="Ma.", last_name="Lopez Perez",
                        date_of_birth="1990-05-20")

    (candidata,) = cuerpo["candidatos"]
    assert candidata["motivos"] == ["fecha_de_nacimiento"]
    assert candidata["coincidencia"] == "media"


def test_las_particulas_del_apellido_no_cuentan(client, db_session, escenario):
    cruz = _paciente(db_session, escenario["tenant"], first_name="LUISA", last_name="DE LA CRUZ")
    _paciente(db_session, escenario["tenant"], first_name="LUISA", last_name="DE LEÓN")

    cuerpo = _preguntar(client, db_session, escenario["secretaria"], first_name="Luisa", last_name="de la Cruz")

    assert _ids(cuerpo) == [cruz.id]


def test_encuentra_por_correo_sin_importar_mayusculas(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], email="MARIA@Correo.com")

    assert _ids(cuerpo) == [escenario["paciente"].id]
    assert cuerpo["candidatos"][0]["motivos"] == ["email"]


def test_un_comodin_en_el_correo_no_trae_a_todas(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], email="%@%")

    assert cuerpo["candidatos"] == []


def test_solo_el_nombre_de_pila_o_solo_el_apellido_no_basta(client, db_session, escenario):
    assert _preguntar(client, db_session, escenario["secretaria"], first_name="María")["candidatos"] == []
    assert _preguntar(client, db_session, escenario["secretaria"], last_name="López")["candidatos"] == []


def test_un_telefono_incompleto_se_marca_invalido_y_no_busca(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], phone="669 111", cell_phone="6691112233")

    assert cuerpo["telefonos"] == [
        {"campo": "phone", "normalizado": None, "valido": False},
        {"campo": "cell_phone", "normalizado": "6691112233", "valido": True},
    ]


def test_sin_datos_no_hay_candidatos(client, db_session, escenario):
    assert _preguntar(client, db_session, escenario["secretaria"]) == {"telefonos": [], "candidatos": []}


def test_devuelve_solo_lo_necesario_para_reconocerla(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], phone="6691112233")

    (candidata,) = cuerpo["candidatos"]
    assert set(candidata) == {
        "patient_id", "full_name", "date_of_birth", "telefono_enmascarado", "motivos", "coincidencia",
    }
    for dato in ("6691112233", "maria@correo.com", "PENICILINA", "HIPERTENSI"):
        assert dato not in str(cuerpo["candidatos"])


def test_al_editar_la_paciente_no_es_su_propio_duplicado(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria"], phone="6691112233",
                        exclude_patient_id=escenario["paciente"].id)

    assert cuerpo["candidatos"] == []


def test_no_cuenta_a_las_pacientes_desactivadas(client, db_session, escenario):
    escenario["paciente"].is_active = False
    db_session.commit()

    assert _preguntar(client, db_session, escenario["secretaria"], phone="6691112233")["candidatos"] == []


def test_la_coincidencia_alta_sale_primero(client, db_session, escenario):
    homonima = _paciente(db_session, escenario["tenant"], first_name="MARÍA", last_name="LÓPEZ", date_of_birth=date(1985, 1, 1))

    cuerpo = _preguntar(client, db_session, escenario["secretaria"], first_name="María", last_name="López",
                        phone="669 111 2233")

    assert _ids(cuerpo) == [escenario["paciente"].id, homonima.id]
    assert cuerpo["candidatos"][0]["motivos"] == ["telefono", "nombre"]


# ---------------------------------------------------------------------------
# Alcance y que no bloquea
# ---------------------------------------------------------------------------

def test_otra_sucursal_no_ve_a_la_paciente(client, db_session, escenario):
    cuerpo = _preguntar(client, db_session, escenario["secretaria_ajena"], phone="6691112233")

    assert cuerpo["candidatos"] == []


def test_la_doctora_solo_ve_a_sus_pacientes(client, db_session, escenario):
    assert _ids(_preguntar(client, db_session, escenario["doctora"], phone="6691112233")) == [escenario["paciente"].id]
    assert _preguntar(client, db_session, escenario["colega"], phone="6691112233")["candidatos"] == []


def test_sin_permiso_de_leer_pacientes_no_pregunta(client, db_session, escenario):
    from app.models.permission import Permission

    secretaria = escenario["secretaria"]
    db_session.add(Permission(role="secretaria", action="patients.read", is_granted=False, user_id=secretaria.id))
    db_session.commit()

    respuesta = client.post(RUTA, json={"phone": "6691112233"}, headers=_auth_headers(db_session, secretaria))

    assert respuesta.status_code == 403


def test_la_advertencia_no_impide_dar_de_alta_a_la_paciente(client, db_session, escenario):
    """Sólo advertir: con candidatos a la vista, el alta sigue pasando."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    assert _preguntar(client, db_session, escenario["secretaria"], first_name="María", last_name="López",
                      phone="6691112233")["candidatos"]

    alta = client.post(f"{PREFIX}/patients", headers=headers, json={
        "first_name": "María", "last_name": "López Pérez", "cell_phone": "669 111 2233",
    })

    assert alta.status_code == 201
    assert db_session.query(Patient).filter(Patient.last_name.ilike("%P_REZ")).count() == 2
