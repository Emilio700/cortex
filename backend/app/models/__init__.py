"""Database models"""

# Import all models to register them with SQLAlchemy
# This is required for relationship() string references to work
from app.models.appointment import Appointment
from app.models.appointment_reminder import AppointmentReminder, AppointmentReminderPreference
from app.models.acceso_clinico import AccesoClinico
from app.models.audit_log import AuditLog
from app.models.folio_emitido import FolioEmitido
from app.models.clinical_consent import ClinicalConsent, ConsentStatus, ConsentType
from app.models.clinical_episode import ClinicalEpisode, ClinicalEpisodeStatus, ClinicalEpisodeType
from app.models.clinical_image import ClinicalImage, ClinicalImageCategory
from app.models.clinical_tracking import (
    DiagnosticOrder,
    DiagnosticOrderFollowUp,
    DiagnosticOrderGroup,
    DiagnosticResult,
    MedicationMonitoringPlan,
    PatientImmunization,
    PregnancyMedicationExposure,
)
from app.models.consultation_room import ConsultationRoom
from app.models.custom_role import SYSTEM_ROLES, CustomRole, is_system_role
from app.models.doctor_profile import DoctorProfile
from app.models.doctor_schedule import DoctorWorkingHours, ScheduleBlock
from app.models.document import Document
from app.models.espejo_legacy import VinculoLegacy
from app.models.imaging import (
    ImagingAnnotation,
    ImagingKeyImage,
    ImagingSeries,
    ImagingShareLink,
    ImagingStudy,
)
from app.models.medical_certificate import CertificateType, MedicalCertificate
from app.models.medication_cache import MedicationCache
from app.models.notification import Notification, NotificationPreference, NotificationType
from app.models.patient import Patient
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
from app.models.patient_document import DocumentType, PatientDocument
from app.models.patient_preregistration import PatientPreregistration, PreregistrationStatus
from app.models.password_reset_token import PasswordResetToken
from app.models.payment import Payment, PaymentMethod
from app.models.permission import Permission
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
    "Tenant",
    "User",
    "UserSession",
    "Role",
    "CustomRole",
    "SYSTEM_ROLES",
    "is_system_role",
    "Patient",
    "PatientCareTeamMember",
    "CareTeamAccessRole",
    "Appointment",
    "ConsultationRoom",
    "AppointmentReminder",
    "AppointmentReminderPreference",
    "AuditLog",
    "DoctorWorkingHours",
    "ScheduleBlock",
    "Document",
    "Triage",
    "SOAPNote",
    "ImagingStudy",
    "ImagingSeries",
    "ImagingAnnotation",
    "Prescription",
    "MedicalCertificate",
    "CertificateType",
    "MedicationCache",
    "SecretariaDoctora",
    "Service",
    "Specialty",
    "Payment",
    "PaymentMethod",
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
    "DiagnosticOrderFollowUp",
    "DiagnosticOrderGroup",
    "DiagnosticResult",
    "ClinicalImage",
    "ClinicalImageCategory",
    "ClinicalConsent",
    "ConsentStatus",
    "ConsentType",
    "Notification",
    "NotificationPreference",
    "VinculoLegacy",
    "NotificationType",
    "Permission",
    "AccesoClinico",
    "FolioEmitido",
]
