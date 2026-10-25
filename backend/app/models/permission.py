"""
Permission model — granular, role-based access control.

Each ``Permission`` record associates a role (or a specific user override) with
an action string like ``"patients.create"``. The same action may appear for
multiple roles. A user's effective permissions are the union of:

  1. The defaults of their base role, tomados de ``ROLE_DEFAULT_PERMISSIONS``
     (codigo, no base de datos: ver ADR-001 del plan 20).
  2. Any individual overrides (``user_perm`` where ``user_id == current_user.id``)
     — these can add *or* remove permissions (``is_granted=False`` denies even
     if the role grants it), which lets an Admin fine-tune a user without
     creating a new role.

The MASTER role bypasses all permission checks (``require_permission`` always
passes for MASTER, just like Django's ``is_superuser``).
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow

# ---------------------------------------------------------------------------
# Permission catalogue — every action string the system knows about.
# Add new entries here as the app grows.
# ---------------------------------------------------------------------------
# fmt: off
ALL_PERMISSIONS: dict[str, str] = {
    # Dashboard
    "dashboard.read":             "Ver dashboard común",
    "admin.dashboard.read":       "Ver dashboard administrativo",
    "audit.read":                 "Consultar bitácora de auditoría",
    "doctor.dashboard.read":      "Ver dashboard del médico",
    # Users
    "users.read":         "Ver listado de usuarios",
    "users.create":       "Crear usuarios",
    "users.update":       "Editar usuarios",
    "users.delete":       "Eliminar/desactivar usuarios",
    # Patients
    "patients.read":      "Ver pacientes",
    "patients.create":    "Crear pacientes",
    "patients.update":    "Editar pacientes",
    "patients.delete":    "Desactivar pacientes",
    # Reasignar la duena del expediente no es "editar al paciente": cambia
    # quien puede abrir su historia clinica. Por eso es un permiso aparte y no
    # viene incluido en patients.update.
    "patients.reassign_owner": "Reasignar el paciente a otro médico",
    # Explicit care-team access. Owner doctor remains the default relation;
    # these permissions control auditable collaboration and temporary access.
    "patient_care_team.read":   "Ver equipo tratante del paciente",
    "patient_care_team.manage": "Asignar o revocar equipo tratante",
    # Appointments
    "appointments.read":          "Ver citas / agenda",
    "appointments.create":        "Crear / agendar citas",
    "appointments.update":        "Reprogramar citas",
    "appointments.change_status": "Cambiar estado de cita (confirmar, pasar a sala, atender)",
    "appointments.cancel":        "Cancelar citas",
    "doctor.appointments.read":   "Ver consultas asignadas",
    # Payments / Finanzas
    "payments.read":      "Consultar pagos",
    "payments.create":    "Registrar pagos",
    "payments.cashcut":   "Ver corte de caja",
    "payments.send_receipt": "Enviar recibo por correo",
    # Services
    "services.read":      "Ver catálogo de servicios",
    "services.create":    "Crear servicios",
    "services.update":    "Editar servicios",
    "services.delete":    "Desactivar servicios",
    # Reports
    "reports.read":       "Ver reportes / estadísticas",
    # Doctor profile
    "doctor_profile.read":   "Ver perfil médico",
    "doctor_profile.update": "Editar perfil médico (logo, firma, cédula)",
    # SOAP notes
    "soap_notes.read":       "Ver notas SOAP",
    "soap_notes.create":     "Crear notas SOAP",
    "soap_notes.update":     "Editar notas SOAP",
    # Medical history
    "medical_history.read":  "Ver historial clínico del paciente",
    # Longitudinal clinical record
    "clinical_episodes.read":   "Ver episodios clínicos y seguimiento",
    "clinical_episodes.create": "Abrir episodios clínicos y planes de seguimiento",
    "clinical_episodes.update": "Actualizar episodios clínicos y seguimiento",
    # Pregnancy and prenatal follow-up (structured documentation only)
    "prenatal.read":              "Ver embarazos y visitas prenatales",
    "prenatal.create":            "Registrar embarazos y visitas prenatales",
    "prenatal.update":            "Actualizar embarazos y visitas prenatales",
    # FPP history, clinical plan, immunizations and diagnostic orders
    "clinical_tracking.read":     "Ver seguimiento obstétrico, vacunas y órdenes",
    "clinical_tracking.create":   "Registrar FPP, vacunas, seguimiento y órdenes",
    "clinical_tracking.update":   "Actualizar seguimiento y resultados de órdenes",
    # Imprimir la orden es un permiso aparte y no viene con clinical_tracking.read
    # porque recepción la reimprime (decisión de Emilio, O-01) y darle la lectura
    # le abriría el seguimiento obstétrico, las vacunas y la bandeja de resultados.
    "clinical_tracking.print_order": "Imprimir o reimprimir órdenes de estudio",
    # Subir el PDF o la foto del resultado y ligarlo a su orden (O-04). Aparte
    # de clinical_tracking.update porque recepción lo recibe en el mostrador y
    # lo sube, pero no interpreta ni marca revisado: eso es del médico.
    "clinical_tracking.attach_result": "Adjuntar el resultado (PDF o foto) a una orden de estudio",
    # Marcar en el mostrador que la orden ya se le entregó al paciente (O-09).
    # Aparte de clinical_tracking.update: recepción maneja el papel del día pero
    # no cambia el ciclo clínico ni ve la indicación. La vista "por entregar" y
    # el marcado de entrega se abren con este permiso.
    "clinical_tracking.deliver_order": "Marcar una orden de estudio como entregada al paciente",
    # Registrar por qué un estudio sigue sin resultado y cuándo volver a
    # revisarlo (plan 32, punto 3). Recepción también: suele ser quien llama a
    # el paciente o al laboratorio. No abre nada clínico.
    "clinical_tracking.follow_up": "Registrar el seguimiento de un estudio atrasado",
    # Consent-gated clinical images
    "clinical_images.read":   "Ver imágenes clínicas",
    "clinical_images.upload": "Capturar o subir imágenes clínicas",
    "clinical_images.update": "Actualizar o archivar imágenes clínicas",
    # Digital informed consents
    "clinical_consents.read":   "Ver consentimientos informados",
    "clinical_consents.create": "Crear borradores de consentimiento",
    "clinical_consents.sign":   "Confirmar y firmar consentimientos en consulta",
    "clinical_consents.revoke": "Registrar revocación de consentimiento",
    # Prescriptions
    "prescriptions.read":       "Ver recetas",
    "prescriptions.create":     "Crear recetas",
    "prescriptions.send_email": "Enviar receta por correo",
    # Medical certificates
    "medical_certificates.read":       "Ver certificados médicos",
    "medical_certificates.create":     "Crear certificados médicos",
    "medical_certificates.send_email": "Enviar certificado por correo",
    # Documents
    "documents.read":    "Ver documentos clínicos",
    "documents.upload":  "Subir documentos",
    "documents.update":  "Editar metadata de documentos",
    "documents.delete":  "Eliminar documentos",
    # Plan 29, lote 7: anular o mover a otro paciente un documento subido por
    # error. Nunca borra el archivo. Quien lo subió puede corregirlo en las
    # primeras 24 h aunque no tenga este permiso.
    "documents.correct": "Corregir documentos (anular o mover a otro paciente)",
    # Notifications
    "notifications.read":   "Ver notificaciones",
    # Patient preregistration
    "preregistration.read":   "Ver preregistros",
    "preregistration.create": "Crear preregistros (en desuso)",
    "preregistration.update": "Editar preregistros (en desuso)",
    "preregistration.convert":"Convertir preregistro a paciente (en desuso)",
    # Triage
    "triage.read":    "Ver signos vitales / triage",
    "triage.create":  "Registrar / editar triage",
    # Doctor schedule
    "schedule.read":          "Ver horarios y bloqueos",
    "schedule.working_hours": "Gestionar horario laboral",
    "schedule.blocks.read":   "Ver bloqueos de agenda",
    "schedule.blocks":        "Gestionar bloqueos de agenda",
    # Appointment reminders
    "reminders.read":    "Ver preferencias de recordatorios",
    "reminders.update":  "Editar preferencias de recordatorios",
    # Medications
    "medications.search": "Buscar medicamentos en el catálogo",
    # Global settings (MASTER only)
    "settings.global":   "Configuración global del sistema",
    "permissions.manage": "Gestionar permisos de usuarios",
    # Escalas neurológicas (Cortex, feat/escalas-neuro). Aparte de soap_notes:
    # la escala es dato clínico estructurado que se grafica, y aplicarla no
    # equivale a escribir la nota.
    "clinical_scales.read":  "Ver escalas neurológicas y su evolución",
    "clinical_scales.write": "Aplicar o anular escalas neurológicas",
    # ── base-modulos-extra (tramo A): módulos opcionales y servicios ──
    # Encender o apagar un módulo cambia lo que ve todo el consultorio; por eso
    # es un permiso propio y no viene con settings.global ni con users.update.
    "modulos.manage":  "Activar o desactivar módulos opcionales del consultorio",
    "servicios.read":  "Ver el estado de los servicios auxiliares (Orthanc, dictado, IA)",
    # ── fin base-modulos-extra ──
}
# fmt: on


# ---------------------------------------------------------------------------
# Default role → permissions mapping.
# These are the permissions every user of that role gets out of the box.
# You can override per-user via the Permission table.
# ---------------------------------------------------------------------------
ROLE_DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "master": list(ALL_PERMISSIONS.keys()),  # MASTER has everything

    "admin": [
        "dashboard.read", "admin.dashboard.read",
        "audit.read",
        "users.read", "users.create", "users.update",
        "patients.read", "patients.create", "patients.update", "patients.reassign_owner",
        "appointments.read", "appointments.create", "appointments.update",
        "appointments.change_status",
        "appointments.cancel",
        "payments.read", "payments.create", "payments.cashcut", "payments.send_receipt",
        "services.read", "services.create", "services.update", "services.delete",
        "reports.read",
        "doctor_profile.read",
        "soap_notes.read",
        "prescriptions.read",
        "medical_certificates.read",
        "documents.read", "documents.upload", "documents.update", "documents.delete",
        "documents.correct",
        "notifications.read",
        # Del preregistro sólo queda la lectura, como historial: se quitó de
        # la interfaz (plan 32, punto 5) y el paciente nuevo se da de alta al
        # agendar. Crear, editar y convertir salen de los roles por omisión;
        # quien los tenga concedidos a mano los conserva, sin pantalla.
        "preregistration.read",
        "triage.read", "triage.create",
        "schedule.read", "schedule.working_hours",
        "schedule.blocks.read", "schedule.blocks",
        "reminders.read", "reminders.update",
        "medical_history.read",
        "clinical_episodes.read",
        "prenatal.read",
        "clinical_tracking.read", "clinical_tracking.print_order",
        "clinical_tracking.attach_result", "clinical_tracking.deliver_order",
        "clinical_tracking.follow_up",
        "clinical_images.read",
        "clinical_consents.read",
        # base-modulos-extra (tramo A): administración enciende módulos y ve servicios.
        "modulos.manage", "servicios.read",
    ],

    "secretaria": [
        "dashboard.read",
        "patients.read", "patients.create", "patients.update", "patients.reassign_owner",
        "appointments.read", "appointments.create", "appointments.update",
        "appointments.change_status",
        "appointments.cancel",
        "payments.read", "payments.create", "payments.send_receipt",
        "services.read",
        "documents.read", "documents.upload", "documents.update",
        "notifications.read",
        # Del preregistro sólo queda la lectura, como historial: se quitó de
        # la interfaz (plan 32, punto 5) y el paciente nuevo se da de alta al
        # agendar. Crear, editar y convertir salen de los roles por omisión;
        # quien los tenga concedidos a mano los conserva, sin pantalla.
        "preregistration.read",
        "triage.read", "triage.create",
        "schedule.read", "schedule.blocks.read", "schedule.blocks",
        # Reimprime la orden de estudio cuando el paciente perdió el papel; no
        # le abre el resto del seguimiento clínico (ver el catálogo arriba).
        # Ojo: el papel es el mismo que entrega el médico, así que lleva la
        # indicación clínica impresa cuando ella deja activo «mostrar
        # indicación» (plan 32, revisión del punto 7). En pantalla no la ve.
        "clinical_tracking.print_order",
        # Sube el resultado que el paciente trae impreso o manda por correo;
        # sólo ve lo necesario para encontrar la orden (paciente, estudio,
        # fecha y folio); en pantalla nunca la indicación ni la interpretación.
        "clinical_tracking.attach_result",
        # Lleva el papel del día: ve las órdenes emitidas y marca cuáles ya
        # entregó al paciente (O-09), sin abrir el seguimiento clínico.
        "clinical_tracking.deliver_order",
        "clinical_tracking.follow_up",
    ],

    "doctor": [
        "dashboard.read", "doctor.dashboard.read",
        # El médico levanta datos del paciente durante el interrogatorio
        # —fecha de nacimiento, telefono, alergias, antecedentes— y sin esto
        # tenia que salirse de la consulta a editarlos desde el perfil,
        # perdiendo lo capturado. El alcance no se amplia: leer y escribir
        # pacientes ya pasan por el mismo filtro de relacion asistencial, asi
        # que solo puede editar a las que ya podia ver. Reasignar la duena del
        # expediente sigue prohibido en el router.
        "patients.read", "patients.update",
        "patient_care_team.read", "patient_care_team.manage",
        # Agendar la proxima revision sin salir de la consulta. El permiso dice
        # que puede crear, no para quien: el guard de create_appointment impide
        # que un médico meta citas en la agenda de sus colegas.
        "appointments.read", "appointments.create", "doctor.appointments.read",
        "appointments.change_status",
        "doctor_profile.read", "doctor_profile.update",
        "soap_notes.read", "soap_notes.create", "soap_notes.update",
        "prescriptions.read", "prescriptions.create", "prescriptions.send_email",
        "medical_certificates.read", "medical_certificates.create",
        "medical_certificates.send_email",
        "medical_history.read",
        "clinical_episodes.read", "clinical_episodes.create", "clinical_episodes.update",
        "prenatal.read", "prenatal.create", "prenatal.update",
        "clinical_tracking.read", "clinical_tracking.create", "clinical_tracking.update",
        "clinical_tracking.print_order", "clinical_tracking.attach_result",
        "clinical_tracking.deliver_order", "clinical_tracking.follow_up",
        "clinical_images.read", "clinical_images.upload", "clinical_images.update",
        "clinical_consents.read", "clinical_consents.create", "clinical_consents.sign", "clinical_consents.revoke",
        # Sube documentos (decisión de Emilio, plan 32 punto 6): antes veía el
        # botón y al guardar recibía un 403 (C7).
        "documents.read", "documents.upload",
        # Corrige el documento que se subió al paciente equivocado (plan 29).
        "documents.correct",
        "notifications.read",
        # Muchas veces no hay asistente que tome los signos en la sala de
        # espera, y el médico los toma ella misma al empezar la consulta. Sin
        # esto la consulta se cerraba sin presión ni peso en el expediente. El
        # router la acota a pacientes con las que tiene relación asistencial.
        "triage.read", "triage.create",
        "schedule.read", "schedule.working_hours",
        "schedule.blocks.read", "schedule.blocks",
        "reminders.read", "reminders.update",
        "services.read",
        "medications.search",
        # Muchas veces el médico cobra ella misma (plan 23, decisión 3). Lo que
        # ve y lo que suma su corte lo acota ``filtrar_pagos_del_alcance`` al
        # ingreso que es suyo: estos permisos no le abren el dinero de la
        # sucursal, sólo el propio.
        "payments.read", "payments.create", "payments.cashcut", "payments.send_receipt",
        # Escalas neurológicas (Cortex, feat/escalas-neuro). El router las acota
        # a los pacientes de su expediente, como el resto de lo clínico.
        "clinical_scales.read", "clinical_scales.write",
    ],
}


def get_default_permissions(role: str) -> list[str]:
    """Return the default permission list for a given role name."""
    return ROLE_DEFAULT_PERMISSIONS.get(role, [])


class Permission(Base):
    """
    Granular permission assignment.

    Two kinds of rows live in this table:

    * **Role-level** (``user_id IS NULL``): DEPRECADO (ADR-001 del plan 20).
      Nadie las lee: el resolutor parte de ``ROLE_DEFAULT_PERMISSIONS``, que vive
      en codigo. Mantenerlas sembradas creaba una segunda fuente de verdad que
      divergia en silencio, y conceder algo ahi no tenia ningun efecto. Ya no se
      siembran; las filas que sobrevivan en produccion son inertes.
    * **User-level** (``user_id`` set): fine-grained overrides for a specific
      user.  ``is_granted`` can be ``True`` (add a permission) or ``False``
      (explicitly deny it, even if the role grants it).
    """

    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(50), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    is_granted = Column(Boolean, default=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationship (optional, for ORM convenience)
    user = relationship("User", backref="permission_overrides")
