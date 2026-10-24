"""Pruebas del espejo legacy -> GEMS.

El espejo escribe sobre expedientes reales de pacientes, así que lo que se fija
aquí no es que "funcione" sino lo que NO puede hacer nunca: duplicar, pisar lo
que se capturó en GEMS, tocar pacientes de otra doctora, o tumbar el backend
cuando el hosting del sistema anterior no contesta.

El legacy es MySQL y no se toca ni para mirar: la conexión se sustituye por un
doble que entrega las filas que le pasamos. GEMS corre sobre SQLite en memoria,
mismo patrón que ``test_appointments_creacion.py``.
"""
from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.espejo_legacy import ORIGEN_ALTA, ORIGEN_RECONCILIADO, VinculoLegacy
from app.models.patient import Patient
from app.models.prescription import Prescription
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.schemas.prescription import PrescriptionResponse
from app.services.folio_service import generate_prescription_folio
from scripts import espejo_legacy
from scripts.espejo_legacy import DOCTOR_ESPEJO, ejecutar_espejo, folio_espejo

TENANT_GYG = 2
TENANT_SI = 3

FILA_BASE = {
    "clave": 8300,
    "tipo": 1,
    "nombre": "azucena",
    "apepat": "sanchez",
    "apemat": "garcia",
    "email": "azucena@gmail.com",
    "religion": "catolica",
    "fec_nac": date(1990, 10, 23),
    "tel_casa": 0,
    "tel_cel": 6691112233,
    "domicilio": "calle luna 123",
    "menarca": "12",
    "ritmo": "28x4",
    "iusa": "XXX",
    "cfertil": "OTB",
    "observa": "penicilina",
    "feul_reg": None,
    "fe_parto": None,
    "gestas": 2,
    "paras": 1,
    "cesar": 1,
    "aborto": 0,
    "sta": "A",
}


def fila(**cambios):
    return dict(FILA_BASE, **cambios)


AYER = date.today() - timedelta(days=5)
MANANA = date.today() + timedelta(days=5)

# ``cita`` es el consecutivo de consulta de esa paciente; la hora real va en
# ``hora``, un char(5) que viene poblado en casi todas las filas.
FILA_CITA = {
    "id_cita": 5001,
    "clave": 8300,
    "cita": 3,
    "hora": "18:00",
    "fecha": None,
    "fec_cita": AYER,
    "efectiva": AYER,
    "peso": "58,400 KG",
    "t_a": "110/70",
    "fu": "24",
    "eda_ult": "",
    "usg": "PRODUCTO UNICO VIVO, CORAZON FETAL 148 LPM",
    "tipo": 1,
    "sta": "A",
}


def cita(**cambios):
    return dict(FILA_CITA, **cambios)


FILA_RECETA = {
    "id_receta": 40123,
    "paciente": 8300,
    "cita": 3,  # el consecutivo de consulta, que la ata a FILA_CITA
    "receta": 1,
    "fecha": AYER,
    "descrip": (
        "GINOTRAN OVULOS\r\nAplicarse 1 por las noches\r\n7 dias\r\n\r\n"
        "DESPAMEN AMP.\r\nAplicarse 1 amp. I.M. cada mes\r\n3 meses"
    ),
    "sta": "A",
}


def receta(**cambios):
    return dict(FILA_RECETA, **cambios)


# --------------------------------------------------------------------------
# Dobles del legacy: no se abre ninguna conexión de verdad
# --------------------------------------------------------------------------
class _CursorFalso:
    """Reparte según la tabla que pide el SQL, igual que haría MySQL."""

    def __init__(self, tablas):
        self._tablas = tablas
        self._filas = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, consulta, parametros=None):
        self.consulta = consulta
        self.parametros = parametros
        for tabla in ("citas", "recetas"):
            if "FROM " + tabla in consulta:
                break
        else:
            tabla = "paciente"
        self._filas = self._tablas.get(tabla, [])

    def fetchall(self):
        return list(self._filas)


class _ConexionFalsa:
    def __init__(self, tablas):
        self._tablas = tablas
        self.cerrada = False

    def cursor(self):
        return _CursorFalso(self._tablas)

    def close(self):
        self.cerrada = True


def legacy_con(pacientes=None, citas=None, recetas=None):
    """Un ``abrir_conexion`` que entrega esas filas por clínica.

    Los tres son ``{tenant_id: [filas]}``.
    """
    pacientes = pacientes or {}
    citas = citas or {}
    recetas = recetas or {}
    conexiones = []

    def abrir(clinica):
        tenant = clinica["tenant_id"]
        con = _ConexionFalsa(
            {
                "paciente": pacientes.get(tenant, []),
                "citas": citas.get(tenant, []),
                "recetas": recetas.get(tenant, []),
            }
        )
        conexiones.append(con)
        return con

    abrir.conexiones = conexiones
    return abrir


def legacy_caido(excepcion=None):
    """Un legacy que no contesta: es el caso normal de un hosting ajeno."""
    fallo = excepcion or OSError("Can't connect to MySQL server on 'vikingos.me'")

    def abrir(clinica):
        raise fallo

    return abrir


# --------------------------------------------------------------------------
# Harness de GEMS
# --------------------------------------------------------------------------
@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sesion = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

    for tenant_id, nombre in ((TENANT_GYG, "G & G"), (TENANT_SI, "San Ignacio")):
        sesion.add(Tenant(id=tenant_id, name=nombre, is_active=True))
    sesion.add(
        User(
            id=DOCTOR_ESPEJO,
            email="adolfo@gems.com",
            hashed_password="no-usado-en-estas-pruebas",
            full_name="Adolfo Gutiérrez",
            role=Role.DOCTOR,
            tenant_id=TENANT_GYG,
            is_active=True,
        )
    )
    sesion.add(
        User(
            id=99,
            email="otra.doctora@gems.com",
            hashed_password="no-usado-en-estas-pruebas",
            full_name="Otra Doctora",
            role=Role.DOCTOR,
            tenant_id=TENANT_GYG,
            is_active=True,
        )
    )
    sesion.commit()
    try:
        yield sesion
    finally:
        sesion.close()
        Base.metadata.drop_all(engine)


def alta_en_gems(db, **campos):
    paciente = Patient(**campos)
    db.add(paciente)
    db.commit()
    return paciente


def paciente_espejada(db, clave=8300, tenant_id=TENANT_GYG, **campos):
    """La paciente tal como la dejó una corrida anterior del espejo."""
    campos.setdefault("first_name", "AZUCENA")
    campos.setdefault("last_name", "SANCHEZ GARCIA")
    campos.setdefault("owner_doctor_id", DOCTOR_ESPEJO)
    return alta_en_gems(
        db, id=clave, tenant_id=tenant_id, expediente_legacy=clave, **campos
    )


def cita_en_gems(db, paciente, dia, **campos):
    campos.setdefault("status", AppointmentStatus.AGENDADA)
    campos.setdefault("appointment_type", AppointmentType.CONSULTA)
    registro = Appointment(
        tenant_id=paciente.tenant_id,
        patient_id=paciente.id,
        doctor_id=DOCTOR_ESPEJO,
        scheduled_at=datetime.combine(dia, time(9, 30)),
        **campos,
    )
    db.add(registro)
    db.commit()
    return registro


# --------------------------------------------------------------------------
# Pruebas
# --------------------------------------------------------------------------
def test_paciente_nueva_del_legacy_se_crea_con_su_tenant_y_su_doctor(db):
    """Es la razón de ser del job: lo que el doctor da de alta en el sistema
    viejo tiene que aparecer en GEMS, en la sucursal correcta y a su nombre."""
    abrir = legacy_con(pacientes={TENANT_SI: [fila(clave=250, nombre="beatriz")]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.altas == 1
    creada = db.query(Patient).one()
    assert creada.id == 10250  # San Ignacio conserva el desfase de la migración
    assert creada.expediente_legacy == 250
    assert creada.tenant_id == TENANT_SI
    assert creada.owner_doctor_id == DOCTOR_ESPEJO
    assert creada.first_name == "BEATRIZ"
    assert creada.cell_phone == "6691112233"


def test_paciente_dada_de_baja_en_el_legacy_entra_desactivada(db):
    """``sta='B'`` es la baja del sistema anterior: el expediente se conserva,
    pero no ensucia las listas del consultorio."""
    abrir = legacy_con(pacientes={TENANT_GYG: [fila(sta="B")]})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert db.query(Patient).one().is_active is False


def test_dos_corridas_seguidas_no_duplican_a_la_paciente(db):
    """El job corre cada media hora: la segunda corrida no puede volver a dar
    de alta a la misma paciente ni tocar nada."""
    abrir = legacy_con(pacientes={TENANT_GYG: [fila()]})

    primera = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)
    segunda = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert primera.altas == 1
    assert segunda.altas == 0
    assert segunda.actualizados == 0
    assert segunda.omitidos["sin cambios"] == 1
    assert db.query(Patient).count() == 1


def test_lo_capturado_en_gems_no_lo_pisa_el_legacy(db):
    """GEMS es la fuente de verdad de lo que ya se capturó aquí: si el celular
    se corrigió en GEMS, el del legacy no manda. La diferencia se reporta para
    que no se pierda en silencio, pero no se escribe."""
    alta_en_gems(
        db,
        id=8300,
        tenant_id=TENANT_GYG,
        first_name="AZUCENA",
        last_name="SANCHEZ GARCIA",
        cell_phone="6690000000",
        owner_doctor_id=DOCTOR_ESPEJO,
    )

    resumen = ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(pacientes={TENANT_GYG: [fila()]})
    )

    paciente = db.get(Patient, 8300)
    assert paciente.cell_phone == "6690000000"
    assert resumen.diferencias["cell_phone"] == 1
    assert resumen.campos_rellenados["cell_phone"] == 0


def test_el_legacy_si_rellena_los_huecos_que_gems_no_tiene(db):
    """Lo que GEMS no tiene no se le quita a nadie: ahí el legacy es la única
    fuente y sí se copia. También se deja marcado el expediente."""
    alta_en_gems(
        db,
        id=8300,
        tenant_id=TENANT_GYG,
        first_name="AZUCENA",
        last_name="SANCHEZ GARCIA",
        owner_doctor_id=DOCTOR_ESPEJO,
    )

    resumen = ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(pacientes={TENANT_GYG: [fila()]})
    )

    paciente = db.get(Patient, 8300)
    assert paciente.cell_phone == "6691112233"
    assert paciente.address == "CALLE LUNA 123"
    assert paciente.expediente_legacy == 8300
    assert resumen.actualizados == 1
    assert resumen.expedientes_marcados == 1


def test_las_alergias_limpiadas_a_mano_no_se_vuelven_a_llenar(db):
    """``limpiar_alergias`` y ``mover_referencias`` vaciaron lo que no era una
    alergia. Volver a copiar ``observa`` sobre ese hueco devolvería la basura
    al campo que se imprime en las recetas."""
    alta_en_gems(
        db,
        id=8300,
        tenant_id=TENANT_GYG,
        first_name="AZUCENA",
        last_name="SANCHEZ GARCIA",
        owner_doctor_id=DOCTOR_ESPEJO,
        allergies=None,
    )

    ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(pacientes={TENANT_GYG: [fila()]})
    )

    assert db.get(Patient, 8300).allergies is None


def test_la_paciente_de_otra_doctora_no_se_toca(db):
    """Las demás doctoras ya trabajan en GEMS: su verdad está aquí y el espejo
    no la hace retroceder, ni siquiera para rellenar un hueco."""
    alta_en_gems(
        db,
        id=8300,
        tenant_id=TENANT_GYG,
        first_name="AZUCENA",
        last_name="SANCHEZ GARCIA",
        owner_doctor_id=99,
    )

    resumen = ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(pacientes={TENANT_GYG: [fila()]})
    )

    paciente = db.get(Patient, 8300)
    assert paciente.cell_phone is None
    assert paciente.address is None
    assert paciente.expediente_legacy is None
    assert resumen.omitidos["es de otra doctora"] == 1
    assert resumen.actualizados == 0


def test_un_id_ocupado_por_otra_paciente_no_la_pisa_sino_que_la_reubica(db):
    """Los ids de GEMS son globales: el que le tocaría a esta clave puede ser
    de una paciente recapturada a mano en la otra sucursal."""
    alta_en_gems(
        db,
        id=8300,
        tenant_id=TENANT_SI,
        first_name="OTRA",
        last_name="PACIENTE",
        owner_doctor_id=DOCTOR_ESPEJO,
    )

    resumen = ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(pacientes={TENANT_GYG: [fila()]})
    )

    intrusa = db.get(Patient, 8300)
    assert intrusa.first_name == "OTRA"  # intacta
    assert resumen.altas == 1
    assert resumen.reubicados == 1
    nueva = (
        db.query(Patient).filter(Patient.expediente_legacy == 8300).one()
    )
    assert nueva.id != 8300
    assert nueva.tenant_id == TENANT_GYG


def test_si_el_legacy_no_contesta_el_job_lo_registra_y_no_revienta(db):
    """El sistema anterior vive en un hosting ajeno. Que se caiga no puede
    tumbar el scheduler ni el backend: se anota y se reintenta a la próxima."""
    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=legacy_caido())

    assert len(resumen.errores) == 2  # una por clínica
    assert resumen.altas == 0
    assert db.query(Patient).count() == 0


def test_una_clinica_caida_no_impide_espejar_la_otra(db):
    """Las dos bases son independientes; perder San Ignacio no puede dejar sin
    espejo a G & G, que es la grande."""
    caido = legacy_caido()
    sana = legacy_con(pacientes={TENANT_GYG: [fila()]})

    def abrir(clinica):
        return sana(clinica) if clinica["tenant_id"] == TENANT_GYG else caido(clinica)

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.altas == 1
    assert len(resumen.errores) == 1
    assert db.query(Patient).count() == 1


def test_la_simulacion_no_escribe_absolutamente_nada(db):
    """Modo por omisión, igual que ``importar_legacy``: reporta lo que haría
    para poder revisarlo antes de dejarlo escribir."""
    alta_en_gems(
        db,
        id=8300,
        tenant_id=TENANT_GYG,
        first_name="AZUCENA",
        last_name="SANCHEZ GARCIA",
        owner_doctor_id=DOCTOR_ESPEJO,
    )
    abrir = legacy_con(pacientes={TENANT_GYG: [fila(), fila(clave=8301, nombre="carmen")]})

    resumen = ejecutar_espejo(db=db, abrir_conexion=abrir)

    assert resumen.altas == 1
    assert resumen.actualizados == 1
    assert db.query(Patient).count() == 1
    intacta = db.get(Patient, 8300)
    assert intacta.cell_phone is None
    assert intacta.expediente_legacy is None


def test_la_conexion_al_legacy_siempre_se_cierra(db):
    """Son 48 corridas al día contra un MySQL compartido: una conexión colgada
    por corrida acaba agotando el cupo del hosting."""
    abrir = legacy_con(pacientes={TENANT_GYG: [fila()], TENANT_SI: []})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert abrir.conexiones and all(con.cerrada for con in abrir.conexiones)


def test_dos_expedientes_del_legacy_de_la_misma_paciente_no_la_duplican(db):
    """El consultorio reabrió expedientes a la misma paciente con otra clave.
    Dentro de una sola corrida eso tampoco puede acabar en dos pacientes."""
    abrir = legacy_con(pacientes={TENANT_GYG: [fila(clave=8300), fila(clave=8301)]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.altas == 1
    assert resumen.omitidos["repetida dentro del legacy"] == 1
    assert db.query(Patient).count() == 1


def test_una_fila_sin_nombre_se_omite_en_vez_de_reventar(db):
    """first_name y last_name son NOT NULL en GEMS: una fila así sólo puede
    reportarse, nunca darse de alta a medias."""
    abrir = legacy_con(pacientes={TENANT_GYG: [fila(nombre="  ", apepat="", apemat="")]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.altas == 0
    assert resumen.omitidos["sin nombre utilizable en el legacy"] == 1
    assert db.query(Patient).count() == 0


# --------------------------------------------------------------------------
# Citas
# --------------------------------------------------------------------------
def test_cita_nueva_del_legacy_se_crea_atendida_y_con_su_vinculo(db):
    """La consulta que el doctor dio en el sistema viejo tiene que quedar en el
    expediente de GEMS, con lo que el legacy guardó de ese día."""
    paciente = paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.citas.altas == 1
    creada = db.query(Appointment).one()
    assert creada.patient_id == paciente.id
    assert creada.doctor_id == DOCTOR_ESPEJO
    assert creada.tenant_id == TENANT_GYG
    # La hora es la real del legacy, no una convencional.
    assert creada.scheduled_at == datetime.combine(AYER, time(18, 0))
    assert creada.status == AppointmentStatus.ATENDIDA
    assert creada.motivo_extra == "SISTEMA ANTERIOR"
    # El contenido clínico del día se transcribe literal: el legacy no tiene
    # tabla de notas y esto es todo lo que existe de esa consulta.
    assert "110/70" in creada.notes
    assert "CORAZON FETAL 148 LPM" in creada.notes

    vinculo = db.query(VinculoLegacy).one()
    assert (vinculo.tabla_legacy, vinculo.clave_legacy) == ("citas", 5001)
    assert vinculo.entidad_id == creada.id
    assert vinculo.origen == ORIGEN_ALTA


def test_dos_corridas_seguidas_no_duplican_la_cita(db):
    """Lo mismo que con las pacientes: esto corre cada media hora."""
    paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)
    segunda = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert segunda.citas.altas == 0
    assert db.query(Appointment).count() == 1
    assert db.query(VinculoLegacy).count() == 1


def test_una_cita_que_ya_esta_en_gems_se_reconcilia_y_no_se_duplica(db):
    """La migración de julio subió ~25 658 citas del legacy sin dejar rastro de
    qué fila eran, y la secretaria agenda aquí. Si esa cita ya existe, se
    reconoce por paciente y día, se anota el vínculo y NO se toca."""
    paciente = paciente_espejada(db)
    ya_estaba = cita_en_gems(
        db, paciente, AYER, status=AppointmentStatus.ATENDIDA, notes="Nota de GEMS"
    )
    abrir = legacy_con(citas={TENANT_GYG: [cita()]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.citas.reconciliadas == 1
    assert resumen.citas.altas == 0
    assert db.query(Appointment).count() == 1
    db.refresh(ya_estaba)
    assert ya_estaba.notes == "Nota de GEMS"  # intacta
    assert ya_estaba.scheduled_at.time() == time(9, 30)  # su hora, no la del espejo
    assert db.query(VinculoLegacy).one().origen == ORIGEN_RECONCILIADO


def test_una_cita_reconciliada_no_la_modifica_el_espejo_nunca(db):
    """Aunque el legacy diga que se celebró: esa cita es de GEMS, no del espejo."""
    paciente = paciente_espejada(db)
    ya_estaba = cita_en_gems(db, paciente, AYER, status=AppointmentStatus.AGENDADA)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)  # reconcilia
    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)  # reintenta

    db.refresh(ya_estaba)
    assert ya_estaba.status == AppointmentStatus.AGENDADA
    assert resumen.citas.actualizadas == 0
    assert resumen.citas.omitidas["ya estaba en GEMS, no se toca"] == 1


def test_una_cita_de_gems_que_no_esta_en_el_legacy_no_se_toca(db):
    """La secretaria agenda en GEMS citas que el sistema viejo no conoce."""
    paciente = paciente_espejada(db)
    propia = cita_en_gems(db, paciente, MANANA, notes="Agendada en GEMS")
    abrir = legacy_con(citas={TENANT_GYG: []})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    db.refresh(propia)
    assert propia.notes == "Agendada en GEMS"
    assert propia.status == AppointmentStatus.AGENDADA
    assert db.query(VinculoLegacy).count() == 0


def test_el_espejo_marca_atendida_solo_la_cita_que_el_creo(db):
    """Si el doctor cierra la consulta en el sistema viejo, la cita espejada
    deja de decir que sigue agendada."""
    paciente_espejada(db)
    pendiente = cita(efectiva=None, fec_cita=MANANA)
    ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(citas={TENANT_GYG: [pendiente]})
    )
    creada = db.query(Appointment).one()
    assert creada.status == AppointmentStatus.AGENDADA

    celebrada = cita(efectiva=MANANA, fec_cita=MANANA)
    resumen = ejecutar_espejo(
        aplicar=True, db=db, abrir_conexion=legacy_con(citas={TENANT_GYG: [celebrada]})
    )

    db.refresh(creada)
    assert creada.status == AppointmentStatus.ATENDIDA
    assert resumen.citas.actualizadas == 1


def test_una_cita_pasada_que_no_se_celebro_no_se_espeja(db):
    """Sin ``efectiva`` la consulta no ocurrió. No se inventa un estado para
    ella: el legacy no dice si se canceló o si la paciente no llegó."""
    paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita(efectiva=None)]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.citas.altas == 0
    assert resumen.citas.omitidas["no se celebró en el sistema anterior"] == 1
    assert db.query(Appointment).count() == 0


def test_una_cita_futura_se_espeja_con_su_hora_real(db):
    """Es la más útil para la transición: la cita que el doctor ya agendó en el
    sistema viejo aparece aquí a la hora que de verdad le dio."""
    paciente_espejada(db)
    abrir = legacy_con(
        citas={TENANT_GYG: [cita(efectiva=None, fec_cita=MANANA, hora="13:30")]}
    )

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    creada = db.query(Appointment).one()
    assert creada.status == AppointmentStatus.AGENDADA
    assert creada.scheduled_at == datetime.combine(MANANA, time(13, 30))
    assert creada.motivo_extra == "SISTEMA ANTERIOR"


def test_la_cita_sin_hora_en_el_legacy_cae_al_mediodia_y_queda_rotulada(db):
    """Sólo 47 de 26 103 filas vienen así. Para ésas se pone una hora
    convencional y se rotula, en vez de inventarle una plausible que nadie
    sabría que es inventada."""
    paciente_espejada(db)
    abrir = legacy_con(
        citas={TENANT_GYG: [cita(efectiva=None, fec_cita=MANANA, hora="")]}
    )

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    creada = db.query(Appointment).one()
    assert creada.scheduled_at == datetime.combine(MANANA, time(12, 0))
    assert "HORA POR CONFIRMAR" in creada.motivo_extra
    assert "no registró la hora" in creada.notes


def test_una_hora_imposible_del_legacy_se_trata_como_ausente(db):
    """``hora`` es texto tecleado a mano: '25:00' no puede tumbar la corrida."""
    paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita(hora="25:00")]})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert db.query(Appointment).one().scheduled_at.time() == time(12, 0)


def test_las_citas_de_paciente_de_otra_doctora_no_se_espejan(db):
    paciente_espejada(db, owner_doctor_id=99)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.citas.altas == 0
    assert resumen.citas.omitidas["es de otra doctora"] == 1
    assert db.query(Appointment).count() == 0


def test_dos_citas_del_mismo_dia_reconcilian_con_dos_citas_distintas(db):
    """Una cita de GEMS se consume una sola vez: si no, la segunda del legacy
    reconciliaría con la misma y perderíamos una consulta."""
    paciente = paciente_espejada(db)
    cita_en_gems(db, paciente, AYER)
    cita_en_gems(db, paciente, AYER)
    abrir = legacy_con(citas={TENANT_GYG: [cita(id_cita=5001), cita(id_cita=5002)]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.citas.reconciliadas == 2
    assert resumen.citas.altas == 0
    assert db.query(Appointment).count() == 2
    assert {v.entidad_id for v in db.query(VinculoLegacy)} == {
        c.id for c in db.query(Appointment)
    }


def test_la_simulacion_no_escribe_ninguna_cita(db):
    paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]})

    resumen = ejecutar_espejo(db=db, abrir_conexion=abrir)

    assert resumen.citas.altas == 1
    assert db.query(Appointment).count() == 0
    assert db.query(VinculoLegacy).count() == 0


def test_el_freno_de_mano_no_escribe_ninguna_cita_si_se_disparan(db):
    """Si la reconciliación falla, el espejo crearía miles de citas duplicadas
    en un sistema en uso. Media importación es peor que ninguna: se detiene
    entero y lo grita en el resumen."""
    paciente_espejada(db)
    abrir = legacy_con(
        citas={TENANT_GYG: [cita(id_cita=5001), cita(id_cita=5002), cita(id_cita=5003)]}
    )

    original = espejo_legacy.TOPE_ALTAS_CITAS
    espejo_legacy.TOPE_ALTAS_CITAS = 2
    try:
        resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)
    finally:
        espejo_legacy.TOPE_ALTAS_CITAS = original

    assert resumen.citas.altas == 0
    assert resumen.citas.bloqueadas_por_tope == 3
    assert db.query(Appointment).count() == 0


# --------------------------------------------------------------------------
# Recetas
# --------------------------------------------------------------------------
def test_la_base_impide_vincular_dos_veces_la_misma_fila_del_legacy(db):
    """La idempotencia no descansa sólo en que el código se acuerde: la
    restricción única de ``espejo_legacy_vinculos`` es la que la garantiza si
    dos corridas llegaran a encimarse."""
    paciente_espejada(db)
    cita_gems = cita_en_gems(db, paciente_espejada(db, clave=8301), AYER)
    for _ in range(2):
        db.add(
            VinculoLegacy(
                tenant_id=TENANT_GYG,
                tabla_legacy="citas",
                clave_legacy=5001,
                entidad="appointment",
                entidad_id=cita_gems.id,
                origen=ORIGEN_ALTA,
            )
        )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def _espejar_receta(db, **cambios):
    """Corrida completa con una paciente, su cita y su receta."""
    paciente_espejada(db)
    abrir = legacy_con(
        citas={TENANT_GYG: [cita()]}, recetas={TENANT_GYG: [receta(**cambios)]}
    )
    return ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)


def test_receta_nueva_del_legacy_se_crea_colgada_de_su_cita_espejada(db):
    """``prescriptions.appointment_id`` es NOT NULL: la receta sólo existe si
    su consulta ya está en GEMS. El enlace es (paciente, consulta), NO el
    ``recetas.id_cita`` del legacy, que está roto."""
    resumen = _espejar_receta(db)

    assert resumen.recetas.altas == 1
    creada = db.query(Prescription).one()
    assert creada.appointment_id == db.query(Appointment).one().id
    assert creada.patient_id == 8300
    assert creada.doctor_id == DOCTOR_ESPEJO
    assert creada.tenant_id == TENANT_GYG
    assert creada.folio_number == "LEGACY-40123"

    vinculo = db.query(VinculoLegacy).filter_by(tabla_legacy="recetas").one()
    assert vinculo.clave_legacy == 40123
    assert vinculo.entidad_id == creada.id
    assert vinculo.origen == ORIGEN_ALTA


def test_los_medicamentos_se_transcriben_sin_interpretar_la_indicacion(db):
    """``descrip`` es prosa de un médico. Lo único que se decide es dónde
    termina un medicamento y empieza el otro; qué parte es la dosis y cuál la
    frecuencia NO se deduce, porque un parser equivocado deja en el expediente
    una indicación que él no dio."""
    _espejar_receta(db)

    creada = db.query(Prescription).one()
    assert [m["name"] for m in creada.medications] == [
        "GINOTRAN OVULOS",
        "DESPAMEN AMP.",
    ]
    assert creada.medications[0]["notes"] == "Aplicarse 1 por las noches\n7 dias"
    assert creada.medications[1]["notes"] == "Aplicarse 1 amp. I.M. cada mes\n3 meses"
    # El texto íntegro del médico se conserva aparte del corte en bloques.
    assert "GINOTRAN OVULOS" in creada.instructions
    assert "3 meses" in creada.instructions


def test_la_receta_espejada_se_puede_leer_por_la_api_sin_reventar(db):
    """``PrescriptionResponse`` revalida ``medications`` al serializar y exige
    name/dosage/frequency en cada renglón: sin ellos, leer la receta devolvería
    500. Por eso los dos que no se pueden deducir llevan un puntero fijo."""
    _espejar_receta(db)

    respuesta = PrescriptionResponse.model_validate(db.query(Prescription).one())

    assert respuesta.medications[0]["name"] == "GINOTRAN OVULOS"


def test_una_receta_que_ya_subio_la_migracion_de_julio_se_reconcilia(db):
    """Julio dejó las recetas de G & G con folio ``LEGACY-{id_receta}``, así que
    son reconocibles una por una. Sin esto, la corrida duplicaría 24 mil
    documentos clínicos."""
    paciente = paciente_espejada(db)
    cita_gems = cita_en_gems(db, paciente, AYER)
    db.add(
        Prescription(
            tenant_id=TENANT_GYG,
            appointment_id=cita_gems.id,
            doctor_id=DOCTOR_ESPEJO,
            patient_id=paciente.id,
            folio_number="LEGACY-40123",
            medications=[{"name": "LO QUE SUBIO JULIO"}],
        )
    )
    db.commit()

    abrir = legacy_con(citas={TENANT_GYG: [cita()]}, recetas={TENANT_GYG: [receta()]})
    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.recetas.reconciliadas == 1
    assert resumen.recetas.altas == 0
    assert db.query(Prescription).count() == 1
    # Y no se toca: una receta es un documento clínico.
    assert db.query(Prescription).one().medications == [{"name": "LO QUE SUBIO JULIO"}]
    assert (
        db.query(VinculoLegacy).filter_by(tabla_legacy="recetas").one().origen
        == ORIGEN_RECONCILIADO
    )


def test_dos_corridas_seguidas_no_duplican_la_receta(db):
    paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]}, recetas={TENANT_GYG: [receta()]})

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)
    segunda = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert segunda.recetas.altas == 0
    assert segunda.recetas.omitidas["ya reflejada"] == 1
    assert db.query(Prescription).count() == 1


def test_san_ignacio_lleva_su_propio_prefijo_de_folio(db):
    """Sus id_receta van del 1 al 487 y chocarían con los LEGACY-1..487 que
    G & G ya tiene; ``folio_number`` es único en toda la base, no por
    sucursal."""
    paciente_espejada(db, clave=246, tenant_id=TENANT_SI)
    abrir = legacy_con(
        citas={TENANT_SI: [cita(clave=246)]},
        recetas={TENANT_SI: [receta(id_receta=12, paciente=246)]},
    )

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert db.query(Prescription).one().folio_number == "LEGACY-SI-12"
    assert folio_espejo(TENANT_GYG, 12) == "LEGACY-12"


def test_el_folio_del_espejo_no_contamina_la_serie_de_recetas_de_gems(db):
    """El consecutivo de las recetas de GEMS sale de su propia serie
    (``folios_emitidos``, plan 32). Una receta espejada no debe correrlo."""
    _espejar_receta(db)

    siguiente = generate_prescription_folio(db, TENANT_GYG)

    # La serie propia arranca en 1: la receta espejada no cuenta para ella.
    assert siguiente.startswith("S2-REC-")
    assert siguiente.endswith("-0001")


def test_una_receta_sin_su_consulta_se_reporta_en_vez_de_colgarse_de_otra(db):
    """(paciente, consulta) casa de más porque unas pocas pacientes repiten
    número de consulta. Si el desempate por fecha no deja una sola candidata,
    mejor reportarla que atarla a la consulta equivocada."""
    paciente_espejada(db)
    abrir = legacy_con(
        citas={TENANT_GYG: [cita()]},
        recetas={TENANT_GYG: [receta(cita=99)]},  # consulta que no existe
    )

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.recetas.altas == 0
    assert resumen.recetas.omitidas["no se pudo ubicar su consulta en el legacy"] == 1
    assert db.query(Prescription).count() == 0


def test_el_desempate_por_fecha_resuelve_el_numero_de_consulta_repetido(db):
    """Dos citas de la misma paciente con el mismo consecutivo: la fecha de la
    receta dice de cuál de las dos cuelga."""
    paciente_espejada(db)
    otro_dia = AYER - timedelta(days=30)
    abrir = legacy_con(
        citas={
            TENANT_GYG: [
                cita(id_cita=5001, fec_cita=otro_dia, efectiva=otro_dia),
                cita(id_cita=5002),
            ]
        },
        recetas={TENANT_GYG: [receta()]},  # fecha = AYER, la de la cita 5002
    )

    ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    la_del_dia = (
        db.query(Appointment)
        .filter(Appointment.scheduled_at >= datetime.combine(AYER, time(0, 0)))
        .one()
    )
    assert db.query(Prescription).one().appointment_id == la_del_dia.id


def test_las_recetas_de_paciente_de_otra_doctora_no_se_espejan(db):
    paciente_espejada(db, owner_doctor_id=99)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]}, recetas={TENANT_GYG: [receta()]})

    resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)

    assert resumen.recetas.altas == 0
    assert resumen.recetas.omitidas["es de otra doctora"] == 1
    assert db.query(Prescription).count() == 0


def test_una_receta_sin_medicamentos_se_reporta(db):
    """Una receta vacía no se puede guardar (``medications`` es NOT NULL y el
    esquema exige al menos un renglón), y tampoco se le inventa uno."""
    resumen = _espejar_receta(db, descrip="   ")

    assert resumen.recetas.altas == 0
    assert resumen.recetas.omitidas["sin medicamentos en el legacy"] == 1
    assert db.query(Prescription).count() == 0


def test_la_simulacion_no_escribe_ninguna_receta(db):
    paciente_espejada(db)
    abrir = legacy_con(citas={TENANT_GYG: [cita()]}, recetas={TENANT_GYG: [receta()]})

    resumen = ejecutar_espejo(db=db, abrir_conexion=abrir)

    assert db.query(Prescription).count() == 0
    assert resumen.recetas.revisadas == 1


def test_el_freno_de_mano_tambien_aplica_a_las_recetas(db):
    """La carga inicial son ~5 700 recetas: grande a propósito, y por eso hay
    que levantar el freno a mano y a sabiendas esa primera vez."""
    paciente_espejada(db)
    abrir = legacy_con(
        citas={TENANT_GYG: [cita()]},
        recetas={
            TENANT_GYG: [receta(id_receta=1), receta(id_receta=2), receta(id_receta=3)]
        },
    )

    original = espejo_legacy.TOPE_ALTAS_RECETAS
    espejo_legacy.TOPE_ALTAS_RECETAS = 2
    try:
        resumen = ejecutar_espejo(aplicar=True, db=db, abrir_conexion=abrir)
    finally:
        espejo_legacy.TOPE_ALTAS_RECETAS = original

    assert resumen.recetas.altas == 0
    assert resumen.recetas.bloqueadas_por_tope == 3
    assert db.query(Prescription).count() == 0

