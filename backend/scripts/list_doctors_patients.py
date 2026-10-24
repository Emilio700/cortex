"""List doctors and patients for appointment creation."""
from app.db.session import SessionLocal
from app.models.user import User
from app.models.patient import Patient

db = SessionLocal()

print("=== DOCTORES ===")
users = db.query(User).all()
for u in users:
    print(f"ID={u.id} | {u.full_name} | role={u.role.value} | tenant={u.tenant_id}")

print("\n=== PACIENTES ===")
patients = db.query(Patient).filter(Patient.is_active == True).all()
for p in patients:
    print(f"ID={p.id} | {p.first_name} {p.last_name} | {p.date_of_birth}")

db.close()
