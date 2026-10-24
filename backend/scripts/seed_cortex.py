"""Siembra un consultorio de neurocirugía de demostración para Cortex.

Es idempotente: se puede correr varias veces y solo crea lo que falta. Las
contraseñas salen de ``CORTEX_SEED_PASSWORD`` o, si no está, se generan al azar
y se imprimen una sola vez; nunca se guardan en el repositorio.

Uso (desde backend/):
    python -m scripts.seed_cortex
"""
import os
import secrets
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.consultation_room import ConsultationRoom
from app.models.doctor_clinic import DoctorClinic
from app.models.doctor_profile import DoctorProfile
from app.models.doctor_schedule import DoctorWorkingHours
from app.models.patient import Patient
from app.models.secretaria_doctora import SecretariaDoctora
from app.models.service import Service
from app.models.specialty import Specialty
from app.models.tenant import Tenant
from app.models.user import Role, User

CONSULTORIO = {
    "name": "Cortex Neurocirugía",
    "address": "Torre Médica, consultorio 801",
    "phone": "5550000000",
    "email": "contacto@cortexneuro.mx",
    "codigo_folio": "CTX",
}

USUARIOS = [
    ("master@cortexneuro.mx", "Soporte Cortex", Role.MASTER, None),
    ("admin@cortexneuro.mx", "Administración Cortex", Role.ADMIN, None),
    ("recepcion@cortexneuro.mx", "Laura Méndez Ríos", Role.SECRETARIA, None),
    ("doctor@cortexneuro.mx", "Ricardo Salazar Ibarra", Role.DOCTOR, "Dr."),
]

SERVICIOS = [
    ("Consulta neuroquirúrgica de primera vez", 1500, 45),
    ("Consulta subsecuente", 1100, 30),
    ("Valoración prequirúrgica", 1800, 45),
    ("Revisión postoperatoria", 900, 30),
    ("Interpretación de resonancia magnética", 1200, 30),
    ("Interpretación de EEG / EMG", 1200, 30),
    ("Bloqueo radicular / infiltración", 6500, 60),
]

# Antecedentes clínicos ficticios, pensados para que cada pantalla del flujo
# (agenda, triage, consulta, órdenes de estudio) tenga algo realista que mostrar.
PACIENTES = [
    dict(first_name="Jorge Alberto", last_name="Castañeda Lugo", date_of_birth=date(1968, 4, 12), gender="Masculino",
         phone="5551102030", allergies="Ninguna conocida", blood_type="O+",
         personal_history="Hipertensión arterial sistémica en tratamiento. Lumbalgia crónica de 3 años con irradiación a miembro pélvico izquierdo.",
         family_history="Padre: EVC isquémico a los 70 años.", dominant_hand="DIESTRO",
         anticoagulants="ÁCIDO ACETILSALICÍLICO 100 MG AL DÍA",
         neurological_history="Radiculopatía L5 izquierda. Sin cirugías previas de columna."),
    dict(first_name="Mariana", last_name="Ochoa Villaseñor", date_of_birth=date(1985, 9, 3), gender="Femenino",
         phone="5552203040", allergies="Penicilina", blood_type="A+",
         personal_history="Cefalea crónica. RM con meningioma parasagital derecho de 2.1 cm, en vigilancia.",
         family_history="Sin antecedentes relevantes.", dominant_hand="DIESTRO",
         neurological_history="Meningioma parasagital derecho en vigilancia con RM anual."),
    dict(first_name="Luis Fernando", last_name="Prado Esquivel", date_of_birth=date(1979, 1, 27), gender="Masculino",
         phone="5553304050", allergies="AINEs", blood_type="B+",
         personal_history="Hernia discal C5-C6 con radiculopatía. Postoperado de discectomía y artrodesis cervical anterior.",
         family_history="Madre: diabetes tipo 2.", dominant_hand="ZURDO",
         implanted_devices="PLACA Y CAJA INTERSOMÁTICA C5-C6 (TITANIO)",
         neurological_history="Discectomía y artrodesis cervical anterior C5-C6."),
    dict(first_name="Valeria", last_name="Robles Anaya", date_of_birth=date(2001, 6, 18), gender="Femenino",
         phone="5554405060", allergies="Ninguna conocida", blood_type="O-",
         personal_history="Epilepsia focal desde los 14 años, en tratamiento con levetiracetam. Crisis ocasionales.",
         family_history="Tío materno con epilepsia.", dominant_hand="DIESTRO",
         neurological_history="Epilepsia focal. Última crisis hace 3 meses."),
    dict(first_name="Ernesto", last_name="Galindo Treviño", date_of_birth=date(1956, 11, 2), gender="Masculino",
         phone="5555506070", allergies="Látex", blood_type="AB+",
         personal_history="Hidrocefalia normotensa con derivación ventrículo-peritoneal (2024). Marcha inestable.",
         family_history="Sin antecedentes relevantes.", dominant_hand="DIESTRO",
         implanted_devices="VÁLVULA VENTRÍCULO-PERITONEAL PROGRAMABLE (REVISAR AJUSTE TRAS RM)",
         anticoagulants="CLOPIDOGREL 75 MG AL DÍA",
         neurological_history="Hidrocefalia normotensa. Derivación ventrículo-peritoneal en 2024."),
    dict(first_name="Daniela", last_name="Cervantes Mora", date_of_birth=date(1992, 2, 9), gender="Femenino",
         phone="5556607080", allergies="Ninguna conocida", blood_type="A-",
         personal_history="Síndrome de túnel del carpo bilateral. Parestesias nocturnas. EMG pendiente.",
         family_history="Madre: hipotiroidismo.", dominant_hand="DIESTRO",
         neurological_history="Síndrome de túnel del carpo bilateral."),
]


def _obtener_o_crear(db, modelo, filtros, valores=None):
    existente = db.query(modelo).filter_by(**filtros).first()
    if existente:
        return existente, False
    obj = modelo(**filtros, **(valores or {}))
    db.add(obj)
    db.flush()
    return obj, True


def sembrar():
    db = SessionLocal()
    credenciales = []
    try:
        consultorio = db.query(Tenant).first()
        if not consultorio:
            consultorio = Tenant(is_active=True, **CONSULTORIO)
            db.add(consultorio)
            db.flush()
            print(f"✓ Consultorio: {consultorio.name}")

        especialidad, _ = _obtener_o_crear(
            db, Specialty, {"slug": "neurocirugia"},
            {"name": "Neurocirugía", "description": "Cirugía del sistema nervioso central y periférico"},
        )

        password_base = os.getenv("CORTEX_SEED_PASSWORD")
        usuarios = {}
        for email, nombre, rol, tratamiento in USUARIOS:
            usuario = db.query(User).filter_by(email=email).first()
            if not usuario:
                password = password_base or secrets.token_urlsafe(12)
                usuario = User(
                    email=email, full_name=nombre, role=rol, tratamiento=tratamiento,
                    hashed_password=get_password_hash(password),
                    tenant_id=consultorio.id, is_active=True,
                )
                db.add(usuario)
                db.flush()
                credenciales.append((email, password))
            usuarios[rol] = usuario

        doctor = usuarios[Role.DOCTOR]
        _obtener_o_crear(
            db, DoctorProfile, {"user_id": doctor.id},
            {"specialty_id": especialidad.id, "professional_id": "00000000",
             "specialty_license": "00000000", "university": "UNAM",
             "council_cert": "Consejo Mexicano de Cirugía Neurológica",
             "clinic_address": CONSULTORIO["address"], "phone": CONSULTORIO["phone"]},
        )
        _obtener_o_crear(db, DoctorClinic, {"doctor_id": doctor.id, "tenant_id": consultorio.id}, {"is_active": True})
        _obtener_o_crear(
            db, SecretariaDoctora,
            {"tenant_id": consultorio.id, "secretaria_id": usuarios[Role.SECRETARIA].id, "doctor_id": doctor.id},
            {"is_active": True},
        )

        if not db.query(DoctorWorkingHours).filter_by(doctor_id=doctor.id).first():
            for dia in range(5):  # lunes a viernes
                for inicio, fin in ((time(9), time(14)), (time(16), time(19))):
                    db.add(DoctorWorkingHours(tenant_id=consultorio.id, doctor_id=doctor.id,
                                              weekday=dia, start_time=inicio, end_time=fin))

        for orden, nombre in enumerate(("Consultorio 1", "Sala de procedimientos")):
            _obtener_o_crear(db, ConsultationRoom, {"tenant_id": consultorio.id, "name": nombre},
                             {"is_active": True, "display_order": orden})

        for nombre, precio, minutos in SERVICIOS:
            _obtener_o_crear(db, Service, {"tenant_id": consultorio.id, "name": nombre},
                             {"price": Decimal(precio), "duration_minutes": minutos,
                              "specialty_id": especialidad.id, "is_active": True})

        pacientes = []
        for datos in PACIENTES:
            paciente, creado = _obtener_o_crear(
                db, Patient,
                {"tenant_id": consultorio.id, "first_name": datos["first_name"], "last_name": datos["last_name"]},
                {k: v for k, v in datos.items() if k not in ("first_name", "last_name")}
                | {"is_active": True, "owner_doctor_id": doctor.id},
            )
            if not creado:
                # Completa sólo lo que falte; nunca pisa lo capturado a mano.
                for campo, valor in datos.items():
                    if getattr(paciente, campo, None) in (None, ""):
                        setattr(paciente, campo, valor)
            pacientes.append(paciente)

        if not db.query(Appointment).filter_by(tenant_id=consultorio.id).first():
            _sembrar_citas(db, consultorio, doctor, pacientes)

        db.commit()
        print("✅ Cortex listo.")
        if credenciales:
            print("\nCredenciales iniciales (se muestran una sola vez):")
            for email, password in credenciales:
                print(f"   {email} / {password}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _sembrar_citas(db, consultorio, doctor, pacientes):
    # Las citas se guardan en hora local del consultorio (ver CLINIC_TIMEZONE).
    hoy = datetime.combine(date.today(), time())
    plan = [
        (0, 9, 0, 45, AppointmentStatus.ATENDIDA, AppointmentType.CONSULTA, "PRIMERA VEZ", "Lumbalgia con radiculopatía L5 izquierda."),
        (0, 10, 0, 30, AppointmentStatus.EN_SALA, AppointmentType.CONSULTA, "RESULTADOS RM", "Trae resonancia magnética de cráneo con contraste."),
        (0, 11, 0, 30, AppointmentStatus.CONFIRMADA, AppointmentType.CONSULTA, "POSTOPERATORIO", "Revisión a 6 semanas de artrodesis cervical."),
        (0, 12, 0, 30, AppointmentStatus.AGENDADA, AppointmentType.CONSULTA, "CONTROL", "Control de epilepsia. Trae EEG."),
        (0, 16, 30, 30, AppointmentStatus.AGENDADA, AppointmentType.CONSULTA, "VALORACIÓN", "Valoración de válvula de derivación."),
        (1, 10, 0, 45, AppointmentStatus.AGENDADA, AppointmentType.CONSULTA, "PRIMERA VEZ", "Parestesias en manos. Solicitar EMG."),
        (2, 7, 0, 240, AppointmentStatus.CONFIRMADA, AppointmentType.CIRUGIA, None, "Microdiscectomía L4-L5."),
    ]
    for (dias, h, m, dur, estado, tipo, motivo, nota), paciente in zip(plan, pacientes + pacientes[:1]):
        cita = Appointment(
            tenant_id=consultorio.id, patient_id=paciente.id, doctor_id=doctor.id,
            scheduled_at=hoy + timedelta(days=dias, hours=h, minutes=m),
            duration_minutes=dur, status=estado, appointment_type=tipo,
            motivo_extra=motivo, notes=nota,
        )
        if tipo == AppointmentType.CIRUGIA:
            cita.cirugia_type = "Microdiscectomía lumbar"
            cita.hospital = "Hospital de demostración"
        db.add(cita)


if __name__ == "__main__":
    sembrar()
