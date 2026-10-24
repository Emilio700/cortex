"""Create test data: appointment + SOAP + prescription for patient id=525 (Emilia Gutierrez Silva)

Usage:
    docker exec gems_backend python scripts/create_test_flow.py
"""
import sys
sys.path.insert(0, "/app")

from datetime import datetime, date, timedelta
from app.db.session import SessionLocal
from app.models.user import User, Role
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.soap_note import SOAPNote
from app.models.prescription import Prescription
from app.models.triage import Triage
from app.services.folio_service import generate_prescription_folio

db = SessionLocal()
try:
    PATIENT_ID = 525
    DOCTOR_ID = 3  # Dr. Adolfo

    patient = db.query(Patient).filter(Patient.id == PATIENT_ID).first()
    if not patient:
        print(f"ERROR: Patient {PATIENT_ID} not found")
        sys.exit(1)

    print(f"Patient: {patient.first_name} {patient.last_name} (id={patient.id})")

    # Get tenant from patient
    tenant_id = patient.tenant_id

    # Create today's appointment
    now = datetime.now()
    appointment = Appointment(
        patient_id=PATIENT_ID,
        doctor_id=DOCTOR_ID,
        tenant_id=tenant_id,
        scheduled_at=now,
        duration_minutes=30,
        status=AppointmentStatus.CONFIRMADA,
        notes="Cita de prueba — Plan 08",
    )
    db.add(appointment)
    db.flush()
    print(f"Appointment created: id={appointment.id}")

    # Create Triage
    triage = Triage(
        appointment_id=appointment.id,
        created_by_user_id=DOCTOR_ID,
        weight_kg=65.0,
        height_cm=162,
        blood_pressure_systolic=120,
        blood_pressure_diastolic=80,
        temperature_celsius=36.5,
        chief_complaint="Dolor pélvico crónico y menstruación irregular",
        observations="Paciente refiere dolor desde hace 3 meses. Ciclos de 35-40 días.",
    )
    db.add(triage)
    print("Triage created")

    # Create SOAP Note
    soap = SOAPNote(
        appointment_id=appointment.id,
        doctor_id=DOCTOR_ID,
        tenant_id=tenant_id,
        subjective="Paciente refiere dolor pélvico intermitente de 3 meses de evolución, "
                   "que se intensifica durante la menstruación. Ciclos irregulares de 35-40 días. "
                   "Refiere dispareunia ocasional.",
        objective="Exploración física: abdomen blando, dolor a la palpación profunda en fosa ilíaca "
                  "derecha. Especuloscopía: cérvix sin lesiones. Tacto bimanual: útero en anteversión, "
                  "doloroso a la movilización. Anexo derecho doloroso.",
        assessment="Endometriosis grado I-II. Descartar quiste ovárico.",
        plan="1. Ultrasonido pélvico-endovaginal. 2. Iniciar anticonceptivos orales combinados "
             "continuos por 3 meses. 3. Control en 1 mes. 4. Ibuprofeno 400mg cada 8h si dolor.",
    )
    db.add(soap)
    print("SOAP Note created")

    # Create Prescription
    folio = generate_prescription_folio(db, tenant_id)
    prescription = Prescription(
        appointment_id=appointment.id,
        patient_id=PATIENT_ID,
        doctor_id=DOCTOR_ID,
        tenant_id=tenant_id,
        folio_number=folio,
        medications=[
            {"name": "Etinilestradiol + Drospirenona", "dosage": "0.03/3mg", "frequency": "1 tableta cada 24h", "duration": "3 meses", "intake_time": "Por la noche"},
            {"name": "Ibuprofeno", "dosage": "400mg", "frequency": "1 tableta cada 8h", "duration": "10 días", "intake_time": "Con alimentos"},
        ],
        instructions="Iniciar anticonceptivos el primer día de la menstruación. "
                     "Tomar ibuprofeno solo si hay dolor. Acudir a control en 1 mes con resultados de ultrasonido.",
    )
    db.add(prescription)
    print(f"Prescription created: folio={folio}")

    db.commit()
    print(f"\nDONE. Test data ready:")
    print(f"  Patient: {patient.first_name} {patient.last_name} (id={PATIENT_ID})")
    print(f"  Appointment: id={appointment.id}, status={appointment.status.value}")
    print("  Login: use the doctor credentials provisioned through the secure channel")
    print(f"  Go to: Consultas → find patient in today's list")

finally:
    db.close()
