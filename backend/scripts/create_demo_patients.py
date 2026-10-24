"""Script to create demo patients for testing."""
from datetime import date
from app.db.session import SessionLocal
from app.models.patient import Patient

db = SessionLocal()

patients = [
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

for p in patients:
    patient = Patient(tenant_id=2, is_active=True, **p)
    db.add(patient)
    print(f"Creado: {p['first_name']} {p['last_name']}")

db.commit()
print(f"Total pacientes creados: {len(patients)}")
db.close()
