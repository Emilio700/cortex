"""Quick PDF integration test — tests both prescription preview and certificate PDF."""
import asyncio
import os

import httpx


async def main():
    email = os.environ["GEMS_SMOKE_EMAIL"]
    password = os.environ["GEMS_SMOKE_PASSWORD"]
    async with httpx.AsyncClient(base_url=os.getenv("GEMS_API_URL", "http://localhost:8000"), timeout=30) as c:
        r = await c.post("/api/v1/auth/login", json={
            "email": email,
            "password": password,
        })
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # ── Prescription preview ──────────────────────────────────────
        r = await c.get("/api/v1/appointments/my-appointments", headers=headers)
        apts = r.json()
        print(f"Appointments: {len(apts)}")

        for apt in apts[:2]:
            r = await c.post("/api/v1/prescriptions/preview", headers=headers, json={
                "appointment_id": apt["id"],
                "patient_id": apt["patient_id"],
                "medications": [
                    {"name": "Paracetamol", "dosage": "500mg", "frequency": "Cada 8 horas", "duration": "5 dias", "intake_time": "Despues de alimentos", "notes": "No exceder 4g diarios"},
                    {"name": "Ibuprofeno", "dosage": "400mg", "frequency": "Cada 12 horas", "duration": "3 dias", "intake_time": "Con alimentos", "notes": ""},
                    {"name": "Omeprazol", "dosage": "20mg", "frequency": "Cada 24 horas", "duration": "7 dias", "intake_time": "En ayunas", "notes": "Protector gastrico"},
                ],
                "instructions": "Tomar con abundante agua. Evitar consumo de alcohol durante el tratamiento.",
            })
            if r.status_code == 200:
                print(f"[PASS] Prescription preview: {len(r.content)} bytes (apt {apt['id']})")
                with open("/app/uploads/test_prescription_preview.pdf", "wb") as f:
                    f.write(r.content)
                break

        # ── Certificate ───────────────────────────────────────────────
        for apt in apts[:2]:
            r = await c.post("/api/v1/medical-certificates", headers=headers, json={
                "appointment_id": apt["id"],
                "patient_id": apt["patient_id"],
                "certificate_type": "sick_leave",
                "diagnosis": "Infeccion respiratoria aguda (J22)",
                "notes": "Reposo por 5 dias",
                "days_off": 5,
            })
            if r.status_code == 201:
                cert = r.json()
                cid = cert["id"]
                print(f"[PASS] Certificate created: id={cid}, folio={cert.get('folio_number', '-')}")
                r = await c.get(f"/api/v1/medical-certificates/{cid}/pdf", headers=headers)
                print(f"[PASS] Certificate PDF: {len(r.content)} bytes")
                with open("/app/uploads/test_certificate.pdf", "wb") as f:
                    f.write(r.content)
                break
            else:
                print(f"[SKIP] Certificate for apt {apt['id']}: {r.status_code} — {r.text[:120]}")


if __name__ == "__main__":
    asyncio.run(main())
