"""Create demo appointments for testing the full flow."""
from datetime import datetime, timedelta
from app.db.session import SessionLocal
from app.models.appointment import Appointment, AppointmentStatus

db = SessionLocal()

# Dr. Juan Pérez = ID 3
DOCTOR_ID = 3
TENANT_ID = 2

# Today = July 15, 2026
today = datetime(2026, 7, 15, 9, 0, 0)

appointments = [
    {
        "patient_id": 3,  # María Fernanda López
        "doctor_id": DOCTOR_ID,
        "scheduled_at": today.replace(hour=9, minute=0),
        "duration_minutes": 30,
        "notes": "Control ginecológico de rutina. Paciente con asma controlada.",
        "status": AppointmentStatus.ATENDIDA,  # Already attended - for doctor history
    },
    {
        "patient_id": 4,  # Ana Patricia Ramírez
        "doctor_id": DOCTOR_ID,
        "scheduled_at": today.replace(hour=10, minute=0),
        "duration_minutes": 30,
        "notes": "Revisión de hipotiroidismo y PAP de control.",
        "status": AppointmentStatus.EN_SALA,  # Currently in the room - ready for doctor
    },
    {
        "patient_id": 5,  # Juana Elizabeth Morales
        "doctor_id": DOCTOR_ID,
        "scheduled_at": today.replace(hour=11, minute=30),
        "duration_minutes": 45,
        "notes": "Seguimiento miomatosis. DM2 descontrolada. Traer ultrasonido.",
        "status": AppointmentStatus.CONFIRMADA,  # Confirmed - waiting
    },
    {
        "patient_id": 6,  # Sofía Alejandra Torres
        "doctor_id": DOCTOR_ID,
        "scheduled_at": today.replace(hour=12, minute=30),
        "duration_minutes": 30,
        "notes": "Primera consulta ginecológica. Asesoría anticonceptivos.",
        "status": AppointmentStatus.AGENDADA,  # Just scheduled
    },
    {
        "patient_id": 7,  # Gabriela Montserrat Hernández
        "doctor_id": DOCTOR_ID,
        "scheduled_at": today.replace(hour=16, minute=0) + timedelta(days=1),  # Tomorrow
        "duration_minutes": 30,
        "notes": "Control SOP. Ajuste de metformina. Revisar perfil tiroideo.",
        "status": AppointmentStatus.AGENDADA,
    },
    {
        "patient_id": 1,  # Emilio Cornejo (existing)
        "doctor_id": DOCTOR_ID,
        "scheduled_at": today.replace(hour=13, minute=0),
        "duration_minutes": 30,
        "notes": "Dolor pélvico crónico. Reevaluación.",
        "status": AppointmentStatus.CONFIRMADA,
    },
]

for a in appointments:
    appt = Appointment(tenant_id=TENANT_ID, **a)
    db.add(appt)
    print(f"Cita: Paciente {a['patient_id']} | {a['scheduled_at'].strftime('%d/%m %H:%M')} | Status: {a['status'].value}")

db.commit()
print(f"\nTotal citas creadas: {len(appointments)}")
db.close()
