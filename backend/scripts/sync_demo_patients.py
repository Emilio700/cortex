"""Sync demo patients from development to production.

Creates/updates the 5 demo patients with rich medical data (allergies,
history, etc.) so the doctor can demonstrate the full system flow.

Usage (production):
    docker exec gems_backend_prod python scripts/sync_demo_patients.py
    docker exec gems_backend_prod python scripts/sync_demo_patients.py --dry-run

Idempotent — checks by email before creating.
"""

import argparse
import sys
from datetime import date

sys.path.insert(0, "/app")

from app.db.session import SessionLocal
from app.models.patient import Patient
from app.models.user import User, Role

# Demo patients with full medical history for presentation purposes
DEMO_PATIENTS = [
    {
        "first_name": "Maria Fernanda",
        "last_name": "Lopez Garcia",
        "date_of_birth": date(1998, 3, 15),
        "gender": "Femenino",
        "phone": "6691883344",
        "email": "maria.lopez@email.com",
        "address": "Av. Reforma 123, Col. Centro, CDMX",
        "allergies": "Penicilina, Sulfa",
        "personal_history": "Asma leve controlada. Apendicectomia 2019.",
        "family_history": "Madre: diabetes tipo 2. Padre: hipertension.",
        "gynecological_history": "G1 P1. Menarca 12 años. Ciclos regulares 28/5. FUM: 2026-06-20.",
    },
    {
        "first_name": "Ana Patricia",
        "last_name": "Ramirez Soto",
        "date_of_birth": date(1991, 7, 8),
        "gender": "Femenino",
        "phone": "6692556677",
        "email": "ana.ramirez@email.com",
        "address": "Calle Hidalgo 456, Col. Juarez, CDMX",
        "allergies": "Ninguna conocida",
        "personal_history": "Hipotiroidismo controlado con levotiroxina 50mcg.",
        "family_history": "Madre: cancer de mama a los 55 años.",
        "gynecological_history": "G2 P2. Menarca 13 años. Ciclos 30/4. FUM: 2026-07-01. PAP reciente normal.",
    },
    {
        "first_name": "Juana Elizabeth",
        "last_name": "Morales Diaz",
        "date_of_birth": date(1984, 11, 22),
        "gender": "Femenino",
        "phone": "6693889900",
        "email": "juana.morales@email.com",
        "address": "Blvd. Independencia 789, Col. Roma, CDMX",
        "allergies": "AINEs (ibuprofeno causa gastritis)",
        "personal_history": "Obesidad grado I. DM2 diagnosticada 2024.",
        "family_history": "Padre: DM2. Madre: sana.",
        "gynecological_history": "G3 P2 A1. Menarca 11 años. Ciclos irregulares. FUM: 2026-05-10. Miomatosis uterina conocida.",
    },
    {
        "first_name": "Sofia Alejandra",
        "last_name": "Torres Ruiz",
        "date_of_birth": date(2004, 9, 3),
        "gender": "Femenino",
        "phone": "6691445566",
        "email": "sofia.torres@email.com",
        "address": "Calle Morelos 234, Col. Condesa, CDMX",
        "allergies": "",
        "personal_history": "Sana. Vacunacion VPH completa.",
        "family_history": "Sin antecedentes relevantes.",
        "gynecological_history": "G0. Menarca 14 años. Ciclos regulares 28/4. FUM: 2026-06-28. Primera consulta ginecologica.",
    },
    {
        "first_name": "Gabriela Montserrat",
        "last_name": "Hernandez Vega",
        "date_of_birth": date(1995, 1, 30),
        "gender": "Femenino",
        "phone": "6694778899",
        "email": "gabriela.hernandez@email.com",
        "address": "Calle Madero 567, Col. Polanco, CDMX",
        "allergies": "Latex",
        "personal_history": "Migrañas cronicas. Tiroidectomia parcial 2023.",
        "family_history": "Hermana: SOP. Madre: sana.",
        "gynecological_history": "G1 P1 (cesarea 2024). Menarca 12 años. Ciclos 35/5. FUM: 2026-06-15. SOP diagnosticado 2020. En tratamiento con metformina.",
    },
]


def sync(tenant_id: int = 2, doctor_id: int = 3, dry_run: bool = False):
    """Sync demo patients to the given tenant, assigning them to a doctor."""
    db = SessionLocal()
    try:
        # Verify doctor exists
        doctor = db.query(User).filter(User.id == doctor_id, User.role == Role.DOCTOR).first()
        if not doctor:
            print(f"ERROR: Doctor id={doctor_id} not found or not a doctor.")
            sys.exit(1)

        print(f"Tenant: {tenant_id}")
        print(f"Doctor: {doctor.full_name} (id={doctor_id})")
        print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
        print()

        created = 0
        updated = 0

        for p in DEMO_PATIENTS:
            existing = (
                db.query(Patient)
                .filter(
                    Patient.email == p["email"],
                    Patient.tenant_id == tenant_id,
                )
                .first()
            )

            if existing:
                print(f"  EXISTS: {p['first_name']} {p['last_name']} (id={existing.id})")
                if not dry_run:
                    # Update with fresh demo data
                    for key, value in p.items():
                        setattr(existing, key, value)
                    existing.owner_doctor_id = doctor_id
                    existing.is_active = True
                updated += 1
            else:
                print(f"  CREATE: {p['first_name']} {p['last_name']}")
                if not dry_run:
                    patient = Patient(
                        tenant_id=tenant_id,
                        owner_doctor_id=doctor_id,
                        is_active=True,
                        **p,
                    )
                    db.add(patient)
                created += 1

        if not dry_run:
            db.commit()
            print(f"\n✅ {created} created, {updated} updated.")
        else:
            print(f"\n🔶 Would create {created}, update {updated} (dry-run).")

        # Summary
        print(f"\nTotal demo patients in tenant {tenant_id}:")
        count = (
            db.query(Patient)
            .filter(
                Patient.tenant_id == tenant_id,
                Patient.email.in_([p["email"] for p in DEMO_PATIENTS]),
                Patient.is_active == True,
            )
            .count()
        )
        print(f"  {count}/{len(DEMO_PATIENTS)} demo patients active")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync demo patients to production")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--tenant", type=int, default=2, help="Tenant ID (default: 2)")
    parser.add_argument("--doctor", type=int, default=3, help="Doctor ID to assign (default: 3)")
    args = parser.parse_args()

    sync(tenant_id=args.tenant, doctor_id=args.doctor, dry_run=args.dry_run)
