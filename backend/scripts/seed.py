"""Seed script to create initial demo data + MASTER user."""
import os
import secrets
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.tenant import Tenant
from app.models.user import Role, User


def seed_database():
    """Create initial demo data"""
    db = SessionLocal()

    try:
        print("🌱 Seeding database...")
        seeded = False

        # ── Tenant ──────────────────────────────────────────────────────
        existing_tenant = db.query(Tenant).first()
        if not existing_tenant:
            clinic = Tenant(
                name="G & G GINECOLOGOS",
                address="AVENIDA REFORMA #2007 B INT-507 FRACC. FLAMINGOS",
                phone="6699853030",
                email="dradolfo.gutierrezmartinez@gmail.com",
                is_active=True,
            )
            db.add(clinic)
            db.flush()
            print(f"✓ Created clinic: {clinic.name} (ID: {clinic.id})")
            seeded = True
        else:
            clinic = existing_tenant
            print(f"✓ Using existing clinic: {clinic.name} (ID: {clinic.id})")

        # ── Users ───────────────────────────────────────────────────────
        existing_users = {u.email: u for u in db.query(User).all()}

        users_data = [
            {
                "email": "master@gems.com",
                "password": os.getenv("GEMS_SEED_MASTER_PASSWORD") or secrets.token_urlsafe(18),
                "full_name": "Desarrollador Master",
                "role": Role.MASTER,
            },
            {
                "email": "admin@gems.com",
                "password": os.getenv("GEMS_SEED_ADMIN_PASSWORD") or secrets.token_urlsafe(18),
                "full_name": "Administrador GEMS",
                "role": Role.ADMIN,
            },
            {
                "email": "secretaria@gems.com",
                "password": os.getenv("GEMS_SEED_SECRETARY_PASSWORD") or secrets.token_urlsafe(18),
                "full_name": "Jhoany Guadalupe Reyes Calderon",
                "role": Role.SECRETARIA,
            },
            {
                "email": "doctor@gems.com",
                "password": os.getenv("GEMS_SEED_DOCTOR_PASSWORD") or secrets.token_urlsafe(18),
                "full_name": "Dr. Adolfo Gutierrez Martinez",
                "role": Role.DOCTOR,
            },
        ]

        created_credentials = []
        for user_data in users_data:
            if user_data["email"] not in existing_users:
                user = User(
                    email=user_data["email"],
                    hashed_password=get_password_hash(user_data["password"]),
                    full_name=user_data["full_name"],
                    role=user_data["role"],
                    tenant_id=clinic.id,
                    is_active=True,
                )
                db.add(user)
                created_credentials.append((user.email, user_data["password"]))
                print(f"✓ Created user: {user.email} ({user.role.value})")
                seeded = True
            else:
                print(f"  User exists: {user_data['email']}")

        # Los permisos por defecto de cada rol NO se siembran: viven en
        # ROLE_DEFAULT_PERMISSIONS (ADR-001 del plan 20). Sembrarlos creaba una
        # segunda fuente de verdad que nadie leia y que divergia en silencio del
        # codigo. La tabla `permissions` queda solo para los ajustes por usuario.

        if seeded:
            db.commit()
            print("\n✅ Database seeded/updated successfully!")
        else:
            print("\n⚠️  Database already up to date. Nothing changed.")

        if created_credentials:
            print("\nInitial credentials (shown once; store them securely):")
            for email, password in created_credentials:
                print(f"   {email} / {password}")

    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
