"""El reporte de recetas duplicadas señala lo que sobra sin tocar la base.

El riesgo de este script no es dejar pasar un duplicado, es reportar de más:
al otro lado de la lista hay alguien decidiendo qué documento clínico borrar.
Por eso la prueba que más importa aquí es la de las dos recetas DISTINTAS en la
misma consulta, que es un caso legítimo y no debe aparecer nunca.

Usan SQLite en memoria, siguiendo el mismo patrón que
``test_appointments_creacion.py``: no hace falta una base Postgres levantada.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.prescription import Prescription
from app.models.tenant import Tenant
from app.models.user import Role, User
from scripts.reporte_recetas_duplicadas import buscar_duplicados, imprimir_reporte

CITA_INICIAL = datetime(2026, 9, 18, 10, 30)

PARACETAMOL = {
    "name": "PARACETAMOL 500 MG",
    "dosage": "1 tableta",
    "frequency": "cada 8 horas",
    "duration": "5 días",
}
AMOXICILINA = {
    "name": "AMOXICILINA 875 MG",
    "dosage": "1 tableta",
    "frequency": "cada 12 horas",
    "duration": "7 días",
}


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def escenario(db_session):
    """Una clínica con doctora, paciente y una cita ya atendida."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    doctora = User(
        email="doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Dra. de Prueba",
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(doctora)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paola Lizeth",
        last_name="De Prueba",
        date_of_birth=datetime(1994, 3, 11).date(),
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(doctora)
    db_session.refresh(paciente)

    def _cita(minutos_despues=0):
        cita = Appointment(
            tenant_id=tenant.id,
            patient_id=paciente.id,
            doctor_id=doctora.id,
            scheduled_at=CITA_INICIAL + timedelta(minutes=minutos_despues),
        )
        db_session.add(cita)
        db_session.commit()
        db_session.refresh(cita)
        return cita

    def _receta(cita, medicamentos, indicaciones="REPOSO RELATIVO", folio="REC-1-2026-0001",
                minutos=0):
        receta = Prescription(
            tenant_id=tenant.id,
            appointment_id=cita.id,
            doctor_id=doctora.id,
            patient_id=paciente.id,
            folio_number=folio,
            medications=medicamentos,
            instructions=indicaciones,
            created_at=CITA_INICIAL + timedelta(minutes=minutos),
        )
        db_session.add(receta)
        db_session.commit()
        db_session.refresh(receta)
        return receta

    return {"tenant": tenant, "paciente": paciente, "cita": _cita, "receta": _receta}


def _contar_filas(db):
    return {
        "recetas": db.query(Prescription).count(),
        "citas": db.query(Appointment).count(),
        "pacientes": db.query(Patient).count(),
    }


def test_dos_recetas_identicas_en_la_misma_cita_se_reportan(db_session, escenario):
    """El caso real: la doctora guardó, no se imprimió nada, volvió a guardar."""
    cita = escenario["cita"]()
    primera = escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0148", minutos=72)
    segunda = escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0149", minutos=73)

    reporte = buscar_duplicados(db_session)

    assert len(reporte.grupos) == 1
    grupo = reporte.grupos[0]
    assert [r.id for r in grupo.recetas] == [primera.id, segunda.id]
    assert grupo.mas_antigua.folio_number == "REC-1-2026-0148"
    assert grupo.paciente == "Paola Lizeth De Prueba"
    assert reporte.recetas_sobrantes == 1


def test_dos_recetas_distintas_en_la_misma_cita_no_se_reportan(db_session, escenario):
    """Un tratamiento adicional en la misma consulta es válido y no se toca.

    Es el falso positivo caro: reportarlo puede terminar en que alguien borre
    una receta que la paciente necesita.
    """
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0201", minutos=10)
    escenario["receta"](cita, [AMOXICILINA], folio="REC-1-2026-0202", minutos=11)

    reporte = buscar_duplicados(db_session)

    assert reporte.grupos == []


def test_mismos_medicamentos_con_indicaciones_distintas_no_se_reportan(db_session, escenario):
    """Cambiar las indicaciones cambia lo que la paciente debe hacer."""
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], indicaciones="TOMAR CON ALIMENTOS",
                        folio="REC-1-2026-0301", minutos=10)
    escenario["receta"](cita, [PARACETAMOL], indicaciones="SUSPENDER SI HAY SANGRADO",
                        folio="REC-1-2026-0302", minutos=11)

    reporte = buscar_duplicados(db_session)

    assert reporte.grupos == []


def test_recetas_identicas_en_citas_distintas_no_se_reportan(db_session, escenario):
    """La misma receta en dos consultas es una renovación de tratamiento."""
    primera_cita = escenario["cita"]()
    segunda_cita = escenario["cita"](minutos_despues=60 * 24 * 30)
    escenario["receta"](primera_cita, [PARACETAMOL], folio="REC-1-2026-0401", minutos=10)
    escenario["receta"](segunda_cita, [PARACETAMOL], folio="REC-1-2026-0402",
                        minutos=60 * 24 * 30)

    reporte = buscar_duplicados(db_session)

    assert reporte.grupos == []
    assert reporte.total_revisadas == 2


def test_el_orden_de_las_llaves_del_json_no_impide_detectar_el_duplicado(db_session, escenario):
    """La columna es JSON: la misma receta puede serializarse con otro orden."""
    cita = escenario["cita"]()
    revuelto = {
        "duration": PARACETAMOL["duration"],
        "name": PARACETAMOL["name"],
        "frequency": PARACETAMOL["frequency"],
        "dosage": PARACETAMOL["dosage"],
        "notes": "",  # llave opcional vacía: equivale a no traerla
    }
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0501", minutos=10)
    escenario["receta"](cita, [revuelto], folio="REC-1-2026-0502", minutos=11)

    reporte = buscar_duplicados(db_session)

    assert len(reporte.grupos) == 1
    assert reporte.grupos[0].mismo_orden is True


def test_los_mismos_medicamentos_en_distinto_orden_se_reportan_y_se_avisa(db_session, escenario):
    """Reordenar la lista no cambia el tratamiento, pero la doctora debe saberlo."""
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL, AMOXICILINA], folio="REC-1-2026-0601", minutos=10)
    escenario["receta"](cita, [AMOXICILINA, PARACETAMOL], folio="REC-1-2026-0602", minutos=11)

    reporte = buscar_duplicados(db_session)

    assert len(reporte.grupos) == 1
    assert reporte.grupos[0].mismo_orden is False


def test_el_mismo_medicamento_repetido_no_empata_con_una_sola_toma(db_session, escenario):
    """Dos veces el fármaco es otra receta: se comparan multiconjuntos, no conjuntos."""
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0701", minutos=10)
    escenario["receta"](cita, [PARACETAMOL, PARACETAMOL], folio="REC-1-2026-0702", minutos=11)

    reporte = buscar_duplicados(db_session)

    assert reporte.grupos == []


def test_no_se_mezclan_clinicas_y_el_filtro_por_tenant_acota(db_session, escenario):
    """Hay varias sucursales: cada una revisa lo suyo."""
    otra_clinica = Tenant(name="Otra sucursal", is_active=True)
    db_session.add(otra_clinica)
    db_session.commit()
    db_session.refresh(otra_clinica)

    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0801", minutos=10)
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0802", minutos=11)

    reporte_propio = buscar_duplicados(db_session, tenant_id=escenario["tenant"].id)
    reporte_ajeno = buscar_duplicados(db_session, tenant_id=otra_clinica.id)

    assert len(reporte_propio.grupos) == 1
    assert reporte_ajeno.grupos == []
    assert reporte_ajeno.total_revisadas == 0


def test_el_filtro_desde_deja_fuera_lo_anterior(db_session, escenario):
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0901", minutos=10)
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0902", minutos=11)

    reporte = buscar_duplicados(db_session, desde=datetime(2026, 9, 19))

    assert reporte.total_revisadas == 0
    assert reporte.grupos == []


def test_el_reporte_no_escribe_nada_en_la_base(db_session, escenario, capsys):
    """Es un reporte de documentos clínicos: sólo lee, incluso al imprimir."""
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-1001", minutos=10)
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-1002", minutos=11)

    antes = _contar_filas(db_session)
    contenido_antes = [
        (r.id, r.folio_number, r.medications, r.instructions)
        for r in db_session.query(Prescription).order_by(Prescription.id).all()
    ]

    reporte = buscar_duplicados(db_session)
    imprimir_reporte(reporte)

    db_session.expire_all()  # obliga a releer de la base y no del caché de la sesión
    despues = _contar_filas(db_session)
    contenido_despues = [
        (r.id, r.folio_number, r.medications, r.instructions)
        for r in db_session.query(Prescription).order_by(Prescription.id).all()
    ]

    assert despues == antes
    assert contenido_despues == contenido_antes


def test_la_salida_menciona_el_folio_y_la_diferencia_de_tiempo(db_session, escenario, capsys):
    """El folio es lo que la doctora ve impreso; el id de base no le dice nada."""
    cita = escenario["cita"]()
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0148", minutos=72)
    escenario["receta"](cita, [PARACETAMOL], folio="REC-1-2026-0149", minutos=73)

    imprimir_reporte(buscar_duplicados(db_session))
    salida = capsys.readouterr().out

    assert "REC-1-2026-0148" in salida
    assert "REC-1-2026-0149" in salida
    assert "Paola Lizeth De Prueba" in salida
    assert "1 min después" in salida
    assert "la más antigua" in salida
