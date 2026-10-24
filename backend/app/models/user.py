"""User and Role models"""
import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Role(str, enum.Enum):
    """User roles enum"""

    MASTER = "master"
    ADMIN = "admin"
    SECRETARIA = "secretaria"
    DOCTOR = "doctor"


class User(Base):
    """User model with role-based access"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=False)
    # "Dr.", "Dra." o nada. Vacío = sin prefijo, a propósito: un "Dr." puesto
    # por defecto a una doctora es peor que no poner tratamiento. Nunca se
    # deduce del nombre; lo captura administración (plan 23, ajustes).
    tratamiento = Column(String(10), nullable=True)
    role = Column(Enum(Role, values_callable=lambda obj: [e.value for e in obj]), nullable=False)
    custom_role_id = Column(Integer, ForeignKey("custom_roles.id"), nullable=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
    personal_email = Column(String(100), nullable=True)  # for reminders/notifications
    mfa_secret_encrypted = Column(Text, nullable=True)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_recovery_codes = Column(JSON, nullable=True)
    mfa_enrolled_at = Column(DateTime, nullable=True)
    # Contador que sube cada vez que cambian los permisos de esta cuenta.
    # Existe para que el frontend note que los suyos quedaron viejos y los
    # recargue solo. Deliberadamente NO cierra la sesión: echar a una doctora
    # a media nota para que "tome" un permiso nuevo perdería lo capturado, que
    # es peor que el problema que se quiere resolver.
    permissions_version = Column(Integer, default=1, server_default="1", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    custom_role = relationship("CustomRole", backref="users_assigned", foreign_keys=[custom_role_id])
    appointments_as_doctor = relationship(
        "Appointment", back_populates="doctor", foreign_keys="Appointment.doctor_id"
    )
    documents_uploaded = relationship("Document", back_populates="uploaded_by")
    triages_created = relationship("Triage", back_populates="created_by")
    soap_notes = relationship("SOAPNote", back_populates="doctor")
    prescriptions = relationship("Prescription", back_populates="doctor")
    medical_certificates = relationship("MedicalCertificate", back_populates="doctor")
    doctor_profile = relationship("DoctorProfile", uselist=False, back_populates="user")
    appointment_reminders = relationship("AppointmentReminder", back_populates="doctor")
    reminder_preference = relationship("AppointmentReminderPreference", uselist=False, back_populates="doctor")
    working_hours = relationship("DoctorWorkingHours", back_populates="doctor")
    schedule_blocks = relationship("ScheduleBlock", back_populates="doctor", foreign_keys="ScheduleBlock.doctor_id")
    sessions = relationship("UserSession", back_populates="user")
    care_team_memberships = relationship(
        "PatientCareTeamMember",
        back_populates="user",
        foreign_keys="PatientCareTeamMember.user_id",
    )
    care_team_grants = relationship(
        "PatientCareTeamMember",
        back_populates="granted_by",
        foreign_keys="PatientCareTeamMember.granted_by_user_id",
    )
