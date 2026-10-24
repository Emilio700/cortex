"""Create demo payments and attended appointments for testing the payment flow"""
import sys; sys.path.insert(0, '/app')
from datetime import datetime
from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
today = datetime.utcnow().strftime('%Y-%m-%d')

# Check existing payments count
existing = db.execute(text("SELECT COUNT(*) FROM payments")).scalar()
print(f"Pagos existentes: {existing}")

# Create demo payments if none exist
if existing == 0:
    db.execute(text("""
        INSERT INTO payments (tenant_id, patient_id, appointment_id, service_id, received_by_user_id, amount, method, description, notes, paid_at, created_at)
        VALUES 
        (2, 6, NULL, 1, 2, 800.00, 'cash', 'Consulta ginecologica', 'Pago en efectivo', NOW(), NOW()),
        (2, 366, NULL, 1, 2, 1200.00, 'card', 'Consulta + Ultrasonido', '30% descuento familiar', NOW(), NOW()),
        (2, 8198, NULL, 1, 2, 500.00, 'transfer', 'Consulta control', '', NOW(), NOW())
    """))
    db.commit()
    print("3 pagos demo creados")
else:
    print(f"Ya hay {existing} pagos, no se crearon nuevos")

# Update latest appointment to 'atendida' with doctor's note
db.execute(text("""
    UPDATE appointments 
    SET status = 'atendida', 
        notes = '💬 Nota del doctor: Aplicar 20% descuento familiar. Cobrar solo consulta $500.'
    WHERE id = (
        SELECT id FROM appointments 
        WHERE status NOT IN ('atendida', 'cancelada') 
        ORDER BY scheduled_at DESC LIMIT 1
    )
"""))
db.commit()

# Show summary
apts = db.execute(text("SELECT COUNT(*) FROM appointments WHERE status = 'atendida'")).scalar()
print(f"Citas atendidas: {apts}")
db.close()
print("Done!")
