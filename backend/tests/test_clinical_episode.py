"""Behavior tests for the clinical-episode boundary contracts."""

from datetime import date, datetime

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.routers.clinical_episodes as clinical_episodes
from _reloj import servidor_en_utc
from app.db.session import Base
from app.models.clinical_episode import ClinicalEpisode
from app.models.patient import Patient
from app.models.permission import ROLE_DEFAULT_PERMISSIONS
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.schemas.clinical_episode import ClinicalEpisodeCreate, ClinicalEpisodeUpdate


def test_episode_rejects_follow_up_before_start():
    with pytest.raises(ValidationError, match="seguimiento"):
        ClinicalEpisodeCreate(
            patient_id=1,
            episode_type="bleeding",
            title="Seguimiento de sangrado",
            started_on=date(2026, 8, 6),
            follow_up_on=date(2026, 8, 5),
        )


def test_episode_accepts_non_pregnancy_reason_and_sanitizes_title():
    episode = ClinicalEpisodeCreate(
        patient_id=1,
        episode_type="cervix",
        title="  Seguimiento de Pap  ",
        started_on=date(2026, 8, 6),
        next_action="Revisar resultado con la paciente.",
    )
    assert episode.episode_type.value == "cervix"
    assert episode.title == "Seguimiento de Pap"


def test_doctor_has_clinical_episode_permissions():
    permissions = ROLE_DEFAULT_PERMISSIONS["doctor"]
    assert "clinical_episodes.read" in permissions
    assert "clinical_episodes.create" in permissions
    assert "clinical_episodes.update" in permissions


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


def test_el_episodio_resuelto_por_la_noche_queda_con_la_fecha_del_consultorio(db_session, monkeypatch):
    """A las 23:30 del 3 de octubre en Mazatlán el contenedor ya va en el día 4.

    Con ``date.today()`` el episodio que la doctora cerraba esa noche quedaba
    resuelto "mañana" en el expediente.
    """
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    doctora = User(
        email="doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Doctora de prueba",
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(doctora)
    db_session.commit()
    paciente = Patient(
        tenant_id=tenant.id, first_name="ANA", last_name="LÓPEZ", owner_doctor_id=doctora.id
    )
    db_session.add(paciente)
    db_session.commit()
    episodio = ClinicalEpisode(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        created_by_user_id=doctora.id,
        episode_type="cervix",
        title="Seguimiento de Pap",
        started_on=date(2026, 9, 1),
    )
    db_session.add(episodio)
    db_session.commit()

    servidor_en_utc(monkeypatch, datetime(2026, 10, 4, 6, 30), clinical_episodes)
    resuelto = clinical_episodes.update_clinical_episode(
        episodio.id, ClinicalEpisodeUpdate(status="resolved"), db_session, doctora
    )

    assert resuelto.resolved_on == date(2026, 10, 3)
