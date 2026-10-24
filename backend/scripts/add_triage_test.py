"""Create triage for appointment 14 to test signos vitales display."""
from datetime import datetime
from app.db.session import SessionLocal
from app.models.triage import Triage

db = SessionLocal()
t = Triage(
    appointment_id=14,
    created_by_user_id=2,
    blood_pressure_systolic=120,
    blood_pressure_diastolic=80,
    temperature_celsius=36.5,
    weight_kg=65.0,
    height_cm=162.0,
    chief_complaint="Control de hipotiroidismo. Refiere cansancio y piel seca.",
    created_at=datetime.now(),
)
db.add(t)
db.commit()
# Calculate BMI
bmi = round(65.0 / (1.62 ** 2), 1)
print(f"Triage creado: PA {t.blood_pressure_systolic}/{t.blood_pressure_diastolic}, Temp {t.temperature_celsius}, Peso {t.weight_kg}, IMC ~{bmi}")
db.close()
