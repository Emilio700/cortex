"""El médico puede completar el expediente de sus pacientes.

Durante el interrogatorio el médico levanta datos que muchas veces no se
capturaron en recepción: la fecha de nacimiento, un teléfono, las alergias,
los antecedentes. Sin ``patients.update`` el rol doctor sólo podía leer, así
que para corregir un dato tenía que salirse de la consulta al perfil de la
paciente — y salirse de la consulta es, literalmente, perder lo capturado.

El alcance no se amplió al conceder el permiso: leer y escribir pacientes
pasan por el mismo filtro de relación asistencial, de modo que el médico
sólo puede editar a las que ya podía ver.
"""
import pytest

from app.models.permission import ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS


def test_la_doctora_puede_editar_pacientes():
    assert "patients.update" in ROLE_DEFAULT_PERMISSIONS["doctor"]


def test_leer_y_editar_pacientes_van_juntos():
    """Poder editar sin poder leer no tendría sentido, y al revés era el bug."""
    permisos = ROLE_DEFAULT_PERMISSIONS["doctor"]
    assert "patients.read" in permisos


@pytest.mark.parametrize(
    "prohibido",
    [
        # Dar de alta y dar de baja pacientes es de recepción: el médico
        # completa expedientes, no administra el padrón.
        "patients.create",
        "patients.delete",
    ],
)
def test_la_doctora_no_administra_el_padron(prohibido):
    assert prohibido not in ROLE_DEFAULT_PERMISSIONS["doctor"]


def test_todos_los_permisos_del_rol_doctor_existen():
    """Un permiso mal escrito no falla: simplemente nunca concede nada.

    Es la misma familia de fallo silencioso que nos costó dos meses de notas
    perdidas, así que conviene que un dedazo salga aquí y no en consulta.
    """
    desconocidos = [p for p in ROLE_DEFAULT_PERMISSIONS["doctor"] if p not in ALL_PERMISSIONS]
    assert not desconocidos, f"El rol doctor declara permisos inexistentes: {desconocidos}"


def test_la_doctora_no_reasigna_la_dueña_del_expediente():
    """Reasignar cambia quién puede abrir la historia clínica, no un dato más.

    Antes lo impedía un ``if role in (...)`` dentro del router, invisible para la
    pantalla de permisos. Ahora es un permiso propio que el médico no trae.
    """
    assert "patients.reassign_owner" not in ROLE_DEFAULT_PERMISSIONS["doctor"]


@pytest.mark.parametrize("rol", ["secretaria", "admin"])
def test_recepcion_y_administracion_conservan_la_reasignacion(rol):
    """Exactamente los roles que autorizaba el gate duro que se retiró."""
    assert "patients.reassign_owner" in ROLE_DEFAULT_PERMISSIONS[rol]


def test_la_doctora_agenda_la_proxima_revision():
    """Agendar el seguimiento sin salir de la consulta.

    Antes tenía que pedírselo a recepción o salirse de la consulta —y salirse es
    perder lo capturado, el mismo fallo que ya nos costó notas.
    """
    assert "appointments.create" in ROLE_DEFAULT_PERMISSIONS["doctor"]


def test_el_permiso_de_agendar_no_viaja_solo():
    """El permiso dice que puede crear citas, no para quién.

    Sin el guard de ``create_appointment`` que ata al médico a su propia
    agenda, concederlo le abriría la agenda de sus cuatro colegas. Esta prueba
    existe para que quitar el guard no pase inadvertido.
    """
    import inspect

    from app.routers import appointments

    codigo = inspect.getsource(appointments.create_appointment)
    # El guard sigue siendo el mismo; lo que cambió (B6) es dónde se decide.
    # Antes se comparaba el rol aquí mismo; ahora la comparación vive en
    # ``access_scope`` para que la agenda y el expediente no puedan divergir.
    # Se sigue exigiendo que el guard esté puesto y que sea sobre el doctor de
    # la cita, que es lo que esta prueba cuida.
    assert "exigir_agenda_propia" in codigo
    assert "appointment_data.doctor_id" in codigo
