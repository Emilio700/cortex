"""Doctor Clinics router — manage which clinics a doctor works at."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.doctor_clinic import DoctorClinic
from app.models.tenant import Tenant
from app.models.user import Role, User

router = APIRouter(prefix="/doctor-clinics", tags=["Doctor Clinics"])


def _require_master_assignment(current_user: User) -> None:
    """Clinic membership is an administrative trust decision, not self-service."""
    if current_user.role != Role.MASTER:
        raise HTTPException(status_code=403, detail="Solo MASTER puede asignar consultorios")


@router.get("", response_model=list[dict])
def list_my_clinics(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """List clinics assigned to the current doctor."""
    clinics = (
        db.query(DoctorClinic)
        .filter(DoctorClinic.doctor_id == current_user.id, DoctorClinic.is_active.is_(True))
        .all()
    )
    # Los nombres de todas las sucursales en una sola consulta, en vez de una por
    # fila dentro del bucle (B-07, hueco 06 M2).
    tenant_ids = {dc.tenant_id for dc in clinics}
    nombres = {
        t.id: t.name
        for t in db.query(Tenant.id, Tenant.name).filter(Tenant.id.in_(tenant_ids)).all()
    } if tenant_ids else {}
    result = [
        {
            "id": dc.id,
            "tenant_id": dc.tenant_id,
            "tenant_name": nombres.get(dc.tenant_id, "Desconocido"),
            "created_at": dc.created_at.isoformat() if dc.created_at else None,
        }
        for dc in clinics
    ]
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def add_clinic(
    tenant_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    doctor_id: int | None = None,
):
    """Assign a doctor to a clinic. Only MASTER can grant cross-tenant access."""
    _require_master_assignment(current_user)
    if doctor_id is None:
        raise HTTPException(status_code=422, detail="doctor_id es obligatorio")

    target_doctor = db.query(User).filter(User.id == doctor_id, User.role == Role.DOCTOR).first()
    if not target_doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    target_doctor_id = target_doctor.id

    # Check tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_active.is_(True)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    # Check not already assigned
    existing = (
        db.query(DoctorClinic)
        .filter(DoctorClinic.doctor_id == target_doctor_id, DoctorClinic.tenant_id == tenant_id)
        .first()
    )
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="Ya tienes asignada esta sucursal")
        else:
            existing.is_active = True
            db.commit()
            return {"id": existing.id, "tenant_id": tenant_id, "tenant_name": tenant.name}

    dc = DoctorClinic(doctor_id=target_doctor_id, tenant_id=tenant_id)
    db.add(dc)
    db.commit()
    db.refresh(dc)
    return {"id": dc.id, "tenant_id": tenant_id, "tenant_name": tenant.name}


@router.delete("/{clinic_id}", status_code=status.HTTP_200_OK)
def remove_clinic(
    clinic_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Remove a clinic assignment (soft-delete)."""
    dc = db.query(DoctorClinic).filter(DoctorClinic.id == clinic_id).first()
    if not dc:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    _require_master_assignment(current_user)

    dc.is_active = False
    db.commit()
    return {"message": "Sucursal removida"}
