"""Structured clinical tracking for immunizations, medication review and diagnostic orders.

These records document clinician decisions.  They deliberately contain no
automatic diagnosis, medication-safety classification or treatment advice.
"""

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class PatientImmunization(Base):
    __tablename__ = "patient_immunizations"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vaccine_name = Column(String(180), nullable=False)
    product_name = Column(String(180), nullable=True)
    manufacturer = Column(String(180), nullable=True)
    lot_number = Column(String(100), nullable=True)
    dose = Column(String(100), nullable=True)
    route = Column(String(80), nullable=True)
    site = Column(String(100), nullable=True)
    administered_on = Column(Date, nullable=True)
    source = Column(String(80), nullable=False, default="clinic")
    status = Column(String(40), nullable=False, default="not_evaluated", index=True)
    reason = Column(Text, nullable=True)
    adverse_event = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", backref="immunizations")
    pregnancy = relationship("Pregnancy")
    appointment = relationship("Appointment")
    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])


class PregnancyMedicationExposure(Base):
    __tablename__ = "pregnancy_medication_exposures"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=True)
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    medication_name = Column(String(255), nullable=False)
    active_ingredient = Column(String(255), nullable=True)
    dose = Column(String(120), nullable=True)
    frequency = Column(String(120), nullable=True)
    route = Column(String(80), nullable=True)
    started_on = Column(Date, nullable=True)
    ended_on = Column(Date, nullable=True)
    source = Column(String(80), nullable=False, default="patient_report")
    indication = Column(Text, nullable=True)
    review_status = Column(String(60), nullable=False, default="pending", index=True)
    next_review_on = Column(Date, nullable=True, index=True)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", backref="medication_exposures")
    pregnancy = relationship("Pregnancy")
    appointment = relationship("Appointment")
    prescription = relationship("Prescription")
    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])
    monitoring_plans = relationship(
        "MedicationMonitoringPlan", back_populates="exposure", cascade="all, delete-orphan"
    )


class MedicationMonitoringPlan(Base):
    __tablename__ = "medication_monitoring_plans"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    exposure_id = Column(Integer, ForeignKey("pregnancy_medication_exposures.id"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    parameter_name = Column(String(180), nullable=False)
    due_on = Column(Date, nullable=True, index=True)
    status = Column(String(40), nullable=False, default="pending", index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    exposure = relationship("PregnancyMedicationExposure", back_populates="monitoring_plans")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class DiagnosticOrderGroup(Base):
    """Varios estudios pedidos juntos, con un solo papel (O-02).

    Es sólo la agrupación: cada estudio sigue siendo su propia
    ``DiagnosticOrder``, con su estado y sus resultados, porque el laboratorio
    entrega la biometría hoy y el urocultivo en tres días, y la doctora revisa
    cada uno cuando llega. Una orden suelta (sin grupo) sigue siendo válida:
    así quedan todas las que ya existían y las que la doctora pida de una en una.
    """

    __tablename__ = "diagnostic_order_groups"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    # La indicación común con la que se pidió el lote; cada estudio guarda
    # además la suya (copia o una propia), que es la que vale para ese estudio.
    clinical_indication = Column(Text, nullable=False)
    requested_on = Column(Date, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient")
    doctor = relationship("User", foreign_keys=[doctor_id])
    orders = relationship("DiagnosticOrder", back_populates="order_group", order_by="DiagnosticOrder.id")


class DiagnosticOrder(Base):
    __tablename__ = "diagnostic_orders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=True, index=True)
    fetal_record_id = Column(Integer, ForeignKey("fetal_records.id"), nullable=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    clinical_episode_id = Column(Integer, ForeignKey("clinical_episodes.id"), nullable=True)
    consent_id = Column(Integer, ForeignKey("clinical_consents.id"), nullable=True)
    # Nulo en las órdenes sueltas, que son todas las anteriores a O-02.
    order_group_id = Column(Integer, ForeignKey("diagnostic_order_groups.id"), nullable=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(60), nullable=False, index=True)
    study_name = Column(String(255), nullable=False)
    catalog_code = Column(String(100), nullable=True)
    clinical_indication = Column(Text, nullable=False)
    priority = Column(String(30), nullable=False, default="routine")
    requested_on = Column(Date, nullable=False, index=True)
    desired_on = Column(Date, nullable=True)
    preparation_instructions = Column(Text, nullable=True)
    specimen_or_body_site = Column(String(180), nullable=True)
    destination = Column(String(255), nullable=True)
    status = Column(String(40), nullable=False, default="ordered", index=True)
    # ``None`` = pedida en GEMS; ``externo`` = estudio que la paciente trajo de
    # otro lugar, sin orden de GEMS (plan 32, punto 6). No se imprime.
    origen = Column(String(20), nullable=True)
    # Último cambio manual de estado (O-05). El motivo es obligatorio al
    # cancelar o rechazar: "cancelada" sin porqué no le dice a nadie si hay
    # que volver a pedir el estudio. El historial completo queda en la bitácora.
    status_reason = Column(Text, nullable=True)
    status_changed_at = Column(DateTime, nullable=True)
    status_changed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Entrega del papel a la paciente en el mostrador (O-09). Es contabilidad de
    # recepción, aparte del ``status`` clínico: una orden puede estar entregada y
    # seguir "solicitada" en el laboratorio. Nulo = todavía por entregar.
    delivered_at = Column(DateTime, nullable=True)
    delivered_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", backref="diagnostic_orders")
    pregnancy = relationship("Pregnancy")
    fetal_record = relationship("FetalRecord")
    appointment = relationship("Appointment")
    clinical_episode = relationship("ClinicalEpisode")
    consent = relationship("ClinicalConsent")
    doctor = relationship("User", foreign_keys=[doctor_id])
    order_group = relationship("DiagnosticOrderGroup", back_populates="orders")
    results = relationship("DiagnosticResult", back_populates="diagnostic_order", cascade="all, delete-orphan")


class DiagnosticResult(Base):
    __tablename__ = "diagnostic_results"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    diagnostic_order_id = Column(Integer, ForeignKey("diagnostic_orders.id"), nullable=False, index=True)
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_document_id = Column(Integer, ForeignKey("patient_documents.id"), nullable=True)
    collected_on = Column(Date, nullable=True)
    resulted_on = Column(Date, nullable=True)
    reporting_provider = Column(String(255), nullable=True)
    report_text = Column(Text, nullable=True)
    structured_values = Column(JSON, nullable=True)
    review_status = Column(String(40), nullable=False, default="received", index=True)
    is_critical = Column(Boolean, nullable=False, default=False, index=True)
    # Valoración de la doctora (plan 26, D-9): excelente, bien, regular, malo o
    # crítico. Es lo que ahora decide si el resultado es crítico;
    # ``is_critical`` se conserva derivado de ella para las órdenes viejas y
    # para las consultas que ya lo leen.
    valoracion = Column(String(20), nullable=True, index=True)
    clinician_interpretation = Column(Text, nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    communicated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    communicated_at = Column(DateTime, nullable=True)
    communication_note = Column(Text, nullable=True)
    # Por dónde se le hizo llegar el resultado a la paciente (plan 26, D-8):
    # en_mano, llamada, whatsapp o correo.
    communication_channel = Column(String(20), nullable=True)
    # La cita en la que la doctora lo revisó con la paciente, si fue en consulta.
    reviewed_in_appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    # Cierre de la incidencia crítica (D-8): se cierra al comunicarlo a la
    # paciente o al revisarlo en una consulta suya; revisarlo desde la bandeja
    # no la cierra. Abierta = crítico y sin fecha de cierre.
    incidencia_cerrada_at = Column(DateTime, nullable=True)
    incidencia_cerrada_por = Column(String(20), nullable=True)
    incidencia_cerrada_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    next_action = Column(Text, nullable=True)
    # Anulación (plan 29, lote 9): el resultado subido a la orden equivocada o
    # con el archivo equivocado no se borra; deja de contar en la bandeja, la
    # gráfica y los pendientes, y la administración lo ve con su motivo.
    anulado_at = Column(DateTime, nullable=True, index=True)
    anulado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    anulado_motivo = Column(String(500), nullable=True)
    # Rastro de la interpretación (plan 32, punto 3): quién la escribió y
    # quién la editó después, con fecha. Los resultados de antes de la 0045
    # quedan en NULL y la pantalla dice «sin registro»: no se inventa el pasado.
    interpretacion_escrita_at = Column(DateTime, nullable=True)
    interpretacion_escrita_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    interpretacion_editada_at = Column(DateTime, nullable=True)
    interpretacion_editada_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    diagnostic_order = relationship("DiagnosticOrder", back_populates="results")
    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])
    communicated_by = relationship("User", foreign_keys=[communicated_by_user_id])
    patient_document = relationship("PatientDocument")


class DiagnosticOrderFollowUp(Base):
    """Por qué un estudio sigue sin resultado (plan 32, punto 3).

    Antes, si la paciente no se lo había hecho o el laboratorio lo tenía en
    proceso, no quedaba escrito en ningún lado. Cada seguimiento guarda quién,
    cuándo y por qué, y la fecha en que hay que volver a revisarlo: hasta esa
    fecha el estudio sale de «Atrasados». Nunca se edita ni se borra; uno
    nuevo se agrega encima, y eso es el rastro.

    Lo registra la doctora o recepción, que suele ser quien llama a la paciente
    o al laboratorio. No guarda nada clínico: el motivo es operativo.
    """

    __tablename__ = "diagnostic_order_follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    diagnostic_order_id = Column(Integer, ForeignKey("diagnostic_orders.id"), nullable=False, index=True)
    motivo = Column(String(40), nullable=False)
    nota = Column(String(500), nullable=True)
    revisar_el = Column(Date, nullable=False, index=True)
    registrado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    diagnostic_order = relationship("DiagnosticOrder")
    registrado_por = relationship("User")
