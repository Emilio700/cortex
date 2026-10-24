"""Import all models for Alembic"""
from app.db.session import Base
from app.models.appointment import Appointment, AppointmentStatus
from app.models.appointment_reminder import AppointmentReminder, AppointmentReminderPreference
from app.models.audit_log import AuditLog
from app.models.clinical_consent import ClinicalConsent, ConsentStatus, ConsentType
from app.models.clinical_episode import ClinicalEpisode, ClinicalEpisodeStatus, ClinicalEpisodeType
from app.models.clinical_image import ClinicalImage, ClinicalImageCategory
from app.models.clinical_tracking import (
    DiagnosticOrder,
    DiagnosticOrderGroup,
    DiagnosticResult,
    MedicationMonitoringPlan,
    PatientImmunization,
    PregnancyMedicationExposure,
)
from app.models.consultation_room import ConsultationRoom
from app.models.doctor_profile import DoctorProfile
from app.models.doctor_schedule import DoctorWorkingHours, ScheduleBlock
from app.models.document import Document
from app.models.espejo_legacy import VinculoLegacy
from app.models.medical_certificate import CertificateType, MedicalCertificate
from app.models.notification import Notification, NotificationType
from app.models.patient import Patient
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
from app.models.patient_document import DocumentType, PatientDocument
from app.models.patient_preregistration import PatientPreregistration, PreregistrationStatus
from app.models.password_reset_token import PasswordResetToken
from app.models.payment import Payment, PaymentMethod
from app.models.pregnancy import (
    FetalAssessment,
    FetalMovements,
    FetalPresentation,
    FetalRecord,
    Pregnancy,
    PregnancyDatingEvent,
    PregnancyStatus,
    PrenatalMilestone,
    PrenatalVisit,
)
from app.models.prescription import Prescription
from app.models.secretaria_doctora import SecretariaDoctora
from app.models.service import Service
from app.models.soap_note import SOAPNote
from app.models.specialty import Specialty
from app.models.tenant import Tenant
from app.models.triage import Triage
from app.models.user import Role, User
from app.models.user_session import UserSession

__all__ = [
    "Base",
    "Tenant",
    "User",
    "UserSession",
    "Role",
    "Patient",
    "PatientCareTeamMember",
    "CareTeamAccessRole",
    "Appointment",
    "ConsultationRoom",
    "AppointmentStatus",
    "AppointmentReminder",
    "AppointmentReminderPreference",
    "AuditLog",
    "DoctorWorkingHours",
    "ScheduleBlock",
    "Triage",
    "Document",
    "DoctorProfile",
    "PatientDocument",
    "DocumentType",
    "PatientPreregistration",
    "PreregistrationStatus",
    "PasswordResetToken",
    "ClinicalEpisode",
    "ClinicalEpisodeStatus",
    "ClinicalEpisodeType",
    "Pregnancy",
    "PregnancyStatus",
    "PrenatalVisit",
    "FetalMovements",
    "FetalPresentation",
    "PregnancyDatingEvent",
    "FetalRecord",
    "FetalAssessment",
    "PrenatalMilestone",
    "PatientImmunization",
    "PregnancyMedicationExposure",
    "MedicationMonitoringPlan",
    "DiagnosticOrder",
    "DiagnosticOrderGroup",
    "DiagnosticResult",
    "ClinicalImage",
    "ClinicalImageCategory",
    "ClinicalConsent",
    "ConsentStatus",
    "ConsentType",
    "SOAPNote",
    "Prescription",
    "MedicalCertificate",
    "CertificateType",
    "SecretariaDoctora",
    "Service",
    "Specialty",
    "Payment",
    "PaymentMethod",
    "Notification",
    "VinculoLegacy",
    "NotificationType",
]
