"""Appointment reminder preferences router (Fase 4.3)"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_permission
from app.models.appointment_reminder import AppointmentReminderPreference
from app.models.user import Role, User
from app.services.appointment_reminder_service import get_doctor_reminder_preference, parse_reminder_times
from app.services.audit_service import log_action

router = APIRouter(prefix="/appointment-reminders", tags=["appointment-reminders"])


class ReminderPreferenceUpdate(BaseModel):
    """Request body for updating reminder preferences."""
    enabled: bool
    reminder_times: str  # Comma-separated minutes, e.g. "1440,60"


class ReminderPreferenceResponse(BaseModel):
    """Response schema for reminder preferences."""
    id: int
    enabled: bool
    reminder_times: str
    reminder_times_parsed: list[int]  # For convenience on frontend

    class Config:
        from_attributes = True


@router.get("/preferences", response_model=ReminderPreferenceResponse)
def get_reminder_preferences(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reminders.read")),
):
    """Get the current user's (doctor's) reminder preferences."""
    pref = get_doctor_reminder_preference(db, current_user.id, current_user.tenant_id)
    return ReminderPreferenceResponse(
        id=pref.id,
        enabled=pref.enabled,
        reminder_times=pref.reminder_times,
        reminder_times_parsed=parse_reminder_times(pref.reminder_times),
    )


@router.patch("/preferences", response_model=ReminderPreferenceResponse)
def update_reminder_preferences(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reminders.update")),
    update_data: ReminderPreferenceUpdate,
):
    """Update the current user's (doctor's) reminder preferences."""
    pref = get_doctor_reminder_preference(db, current_user.id, current_user.tenant_id)

    # Validate reminder times format
    parsed = parse_reminder_times(update_data.reminder_times)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escribe los minutos de anticipación del aviso separados por comas. Por ejemplo: 1440, 120.",
        )

    pref.enabled = update_data.enabled
    pref.reminder_times = update_data.reminder_times
    db.add(pref)
    db.commit()
    db.refresh(pref)

    log_action(
        db,
        action="reminder_preferences.updated",
        entity_type="appointment_reminder_preference",
        entity_id=pref.id,
        actor_user_id=current_user.id,
        tenant_id=pref.tenant_id,
        details={"enabled": pref.enabled, "reminder_times": pref.reminder_times},
    )

    return ReminderPreferenceResponse(
        id=pref.id,
        enabled=pref.enabled,
        reminder_times=pref.reminder_times,
        reminder_times_parsed=parsed,
    )
