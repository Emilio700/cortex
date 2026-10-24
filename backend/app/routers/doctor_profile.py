"""Doctor Profile Router"""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_permission
from app.core.hora_local import ahora_local
from app.db.session import utcnow
from app.core.storage import default_storage, storage_response
from app.core.tenant_scope import scoped_query
from app.models import DoctorProfile, User
from app.schemas.doctor_profile import (
    AjustesOrden,
    DoctorProfileResponse,
    DoctorProfileUpdate,
    PrevisualizacionOrdenRequest,
    PrevisualizacionRecetaRequest,
)
from app.services.specialty_service import get_default_specialty_id
from app.utils.uploads import (
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_SIZE_BYTES,
    extension_for_mime,
    read_and_validate_upload,
)

router = APIRouter(prefix="/doctor-profile", tags=["doctor-profile"])

logger = logging.getLogger(__name__)

# Configure upload directory
UPLOAD_DIR = Path("uploads/doctor_files")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _stored_profile_path(url: str | None) -> str | None:
    prefix = "/doctor-profile/files/"
    if not url or not url.startswith(prefix):
        return None
    filename = url.removeprefix(prefix)
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        return None
    return str(UPLOAD_DIR / filename)


def _persist_profile_file(
    db: Session,
    profile: DoctorProfile,
    *,
    field_name: str,
    unique_filename: str,
    content: bytes,
) -> str:
    relative_path = str(UPLOAD_DIR / unique_filename)
    new_url = f"/doctor-profile/files/{unique_filename}"
    old_path = _stored_profile_path(getattr(profile, field_name))
    try:
        default_storage.save(relative_path, content)
        setattr(profile, field_name, new_url)
        db.commit()
    except Exception as error:
        db.rollback()
        default_storage.delete(relative_path)
        raise HTTPException(status_code=500, detail="No se pudo guardar el archivo del perfil. Inténtalo de nuevo; si vuelve a fallar, avisa al equipo de soporte.") from error
    if old_path and old_path != relative_path:
        try:
            default_storage.delete(old_path)
        except Exception:
            pass
    return new_url


@router.get("/me", response_model=DoctorProfileResponse)
def get_my_profile(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_profile.read")),
):
    """Get current doctor's profile"""
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        # Auto-create if not exists (fallback for new doctors)
        profile = DoctorProfile(
            user_id=current_user.id,
            specialty_id=get_default_specialty_id(db),
            professional_id="",
            university="",
            clinic_address="",
            phone="",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return profile


@router.put("/me", response_model=DoctorProfileResponse)
def update_my_profile(
    *,
    db: Session = Depends(get_db),
    profile_in: DoctorProfileUpdate,
    current_user: User = Depends(require_permission("doctor_profile.update")),
):
    """Update current doctor's profile"""
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No se encontró el perfil.")

    try:
        update_data = profile_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(profile, field, value)
        # El JSON de ajustes se guarda completo, no a medias: lo que se ve en
        # la vista previa es exactamente lo que quedara guardado.
        if profile_in.prescription_settings is not None:
            profile.prescription_settings = profile_in.prescription_settings.model_dump()
        # Igual con la orden (plan 26, D-7): completo, con los de fábrica en
        # lo que no se mandó, para que la vista previa y lo guardado coincidan.
        if profile_in.order_settings is not None:
            profile.order_settings = profile_in.order_settings.model_dump()

        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile
    except Exception as e:
        db.rollback()
        # Con traza y qué campos se intentaban actualizar, para diagnosticar sin
        # exponer nada a la usuaria (a ella se le responde el 500 en español).
        logger.exception(
            "No se pudo actualizar el perfil del médico; campos intentados: %s",
            list(profile_in.model_dump(exclude_unset=True).keys()),
        )
        raise HTTPException(status_code=500, detail="No fue posible actualizar el perfil") from e


@router.post("/upload-logo")
async def upload_logo(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_profile.update")),
    file: UploadFile = File(...),
):
    """Upload doctor's logo"""
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No se encontró el perfil.")

    content, detected_mime = await read_and_validate_upload(
        file,
        allowed_mime_types=ALLOWED_IMAGE_MIME_TYPES,
        max_size_bytes=MAX_IMAGE_SIZE_BYTES,
    )

    # Generate filename - extension derived from the *detected* content type,
    # not the client-supplied filename, so it can't disagree with the real bytes
    file_extension = extension_for_mime(detected_mime, fallback=".png")
    unique_filename = f"logo_{current_user.id}_{uuid.uuid4()}{file_extension}"

    url = _persist_profile_file(
        db, profile, field_name="logo_url", unique_filename=unique_filename, content=content
    )
    return {"url": url}


@router.post("/upload-signature")
async def upload_signature(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_profile.update")),
    file: UploadFile = File(...),
):
    """Upload doctor's digital signature"""
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No se encontró el perfil.")

    content, detected_mime = await read_and_validate_upload(
        file,
        allowed_mime_types=ALLOWED_IMAGE_MIME_TYPES,
        max_size_bytes=MAX_IMAGE_SIZE_BYTES,
    )

    # Generate filename - extension derived from the *detected* content type,
    # not the client-supplied filename, so it can't disagree with the real bytes
    file_extension = extension_for_mime(detected_mime, fallback=".png")
    unique_filename = f"sig_{current_user.id}_{uuid.uuid4()}{file_extension}"

    url = _persist_profile_file(
        db,
        profile,
        field_name="signature_url",
        unique_filename=unique_filename,
        content=content,
    )
    return {"url": url}


@router.get("/files/{filename}")
def get_doctor_file(
    *,
    db: Session = Depends(get_db),
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """Serve uploaded doctor files (logo/signature).

    Requires authentication and only serves files that belong to a doctor
    profile within the caller's own tenant, to avoid leaking signatures/logos
    across clinics and to close the previously unauthenticated, unscoped
    file-serving endpoint.
    """
    # Reject path traversal / directory separators outright - filenames are
    # always flat UUID-based names generated by the upload endpoints above.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido.")

    relative_url = f"/doctor-profile/files/{filename}"
    owner_profile = (
        scoped_query(
            db.query(DoctorProfile).join(User, DoctorProfile.user_id == User.id), User, current_user
        )
        .filter(
            or_(
                DoctorProfile.logo_url == relative_url,
                DoctorProfile.signature_url == relative_url,
            ),
        )
        .first()
    )
    if not owner_profile:
        raise HTTPException(status_code=404, detail="No se encontró el archivo.")
    relative_path = str(UPLOAD_DIR / filename)
    if not default_storage.exists(relative_path):
        raise HTTPException(status_code=404, detail="No se encontró el archivo.")
    mime_type = "image/png" if filename.lower().endswith(".png") else "image/jpeg"
    return storage_response(relative_path, media_type=mime_type, inline=True)


# ---------------------------------------------------------------------------
# Vista previa de la receta
# ---------------------------------------------------------------------------

class _PerfilDePrueba:
    """El perfil del doctor con su estilo aun sin guardar.

    Envuelve el perfil real y solo tapa los campos de configuracion, para
    que la vista previa use **el mismo** ``generate_prescription_pdf`` que la
    receta de verdad. Asi no hay dos verdades: lo que se ve aqui es lo que se
    imprime. No toca la instancia de SQLAlchemy, de modo que previsualizar no
    puede dejar nada escrito en la base.
    """

    def __init__(
        self,
        perfil: DoctorProfile,
        nombre: str | None,
        ajustes: dict | None,
        leyenda: str | None = None,
        color: str | None = None,
        estilo: dict | None = None,
    ):
        object.__setattr__(self, "_perfil", perfil)
        object.__setattr__(self, "prescription_display_name", nombre)
        object.__setattr__(self, "prescription_settings", ajustes)
        object.__setattr__(self, "prescription_footer_text", leyenda)
        object.__setattr__(self, "prescription_accent_color", color)
        object.__setattr__(self, "prescription_signature_style", estilo)

    def __getattr__(self, nombre_atributo):
        return getattr(object.__getattribute__(self, "_perfil"), nombre_atributo)


def _receta_de_muestra():
    """Datos de ejemplo para la vista previa. Ningún paciente real."""
    from datetime import date
    from types import SimpleNamespace

    paciente = SimpleNamespace(
        id=0,
        first_name="MARIA",
        last_name="EJEMPLO GONZALEZ",
        date_of_birth=date(1990, 4, 17),
        allergies="PENICILINA",
    )
    receta = SimpleNamespace(
        id="MUESTRA",
        folio_number="RX-MUESTRA",
        # En UTC, como una receta guardada: el PDF la pasa a la hora de
        # Mazatlán (plan 26, D-12). En hora local se habría movido dos veces.
        created_at=utcnow(),
        # El motivo NO va en el ejemplo: se decide receta por receta en la
        # consulta, no en esta pantalla. Enseñarlo aquí diría que la receta lo
        # imprime siempre, y no es cierto. Se ve donde se enciende: en la vista
        # previa del formulario de la receta.
        diagnosis=None,
        medications=[
            {
                "name": "PARACETAMOL",
                "presentation": "Tabletas",
                "dosage": "500 mg",
                "route": "Via oral",
                "frequency": "Cada 8 horas",
                "duration": "5 dias",
                "intake_time": "Despues de alimentos",
                "quantity": "15 tabletas",
                "notes": "Tomar con abundante agua",
            },
            {
                "name": "ACIDO FOLICO",
                "presentation": "Tabletas",
                "dosage": "5 mg",
                "route": "Via oral",
                "frequency": "Cada 24 horas",
                "duration": "30 dias",
                "quantity": "30 tabletas",
            },
        ],
        instructions="Tomar abundantes liquidos. Acudir a revision en 15 dias.",
    )
    triaje = SimpleNamespace(
        weight_kg=62,
        height_cm=163,
        blood_pressure_systolic=110,
        blood_pressure_diastolic=70,
        temperature_celsius=36.5,
        chief_complaint="",
    )
    return receta, paciente, triaje


@router.post("/me/prescription-preview")
def preview_my_prescription(
    *,
    db: Session = Depends(get_db),
    datos: PrevisualizacionRecetaRequest,
    current_user: User = Depends(require_permission("doctor_profile.update")),
):
    """Devuelve el PDF de una receta de muestra con los ajustes **sin guardar**.

    Lo genera el mismo codigo que la receta real, con datos de ejemplo, para
    que el medico vea como le va a quedar antes de decidir.
    """
    from fastapi.responses import StreamingResponse

    from app.utils.pdf import generate_prescription_pdf

    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    ajustes = datos.prescription_settings.model_dump() if datos.prescription_settings else None
    estilo = (
        datos.prescription_signature_style.model_dump()
        if datos.prescription_signature_style
        else None
    )
    perfil_previa = _PerfilDePrueba(
        profile,
        datos.prescription_display_name,
        ajustes,
        leyenda=datos.prescription_footer_text,
        color=datos.prescription_accent_color,
        estilo=estilo,
    )

    receta, paciente, triaje = _receta_de_muestra()
    pdf = generate_prescription_pdf(receta, perfil_previa, paciente, triaje)

    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="vista-previa-receta.pdf"'},
    )


# ---------------------------------------------------------------------------
# Vista previa de la orden de estudio (plan 26, D-7)
# ---------------------------------------------------------------------------

class _PerfilConAjustesDeOrden:
    """El perfil real con los ajustes de la orden aún sin guardar.

    Igual que ``_PerfilDePrueba`` de la receta: envuelve el perfil y sólo tapa
    ``order_settings``, para que la vista previa use el mismo código que la
    orden de verdad sin escribir nada en la base. El membrete sale de la
    configuración de la receta ya guardada.
    """

    def __init__(self, perfil: DoctorProfile, ajustes: dict):
        object.__setattr__(self, "_perfil", perfil)
        object.__setattr__(self, "order_settings", ajustes)

    def __getattr__(self, nombre_atributo):
        return getattr(object.__getattribute__(self, "_perfil"), nombre_atributo)


def _ordenes_de_muestra():
    """Una consulta de ejemplo con estudios de los tres destinos. Ningún paciente real."""
    from datetime import date
    from types import SimpleNamespace

    hoy = ahora_local().date()
    comun = dict(
        clinical_indication="Protocolo prequirúrgico de columna lumbar", requested_on=hoy, desired_on=None,
        destination=None, specimen_or_body_site=None, preparation_instructions=None, priority="routine",
    )
    estudios = [
        dict(category="laboratory", study_name="Biometría hemática completa", specimen_or_body_site="Sangre",
             preparation_instructions="Ayuno de 8 horas", destination="Laboratorio Central"),
        dict(category="laboratory", study_name="Examen general de orina",
             preparation_instructions="Primera orina de la mañana", destination="Laboratorio Central"),
        dict(category="imaging", study_name="Resonancia magnética de columna lumbar simple",
             specimen_or_body_site="Columna lumbar", priority="preferential",
             preparation_instructions="Retirar objetos metálicos", desired_on=hoy),
        dict(category="neurophysiology", study_name="Electromiografía de miembros pélvicos"),
        dict(category="referral", study_name="Valoración preanestésica"),
    ]
    ordenes = [
        SimpleNamespace(id=1000 + numero, order_group_id=None, **{**comun, **estudio})
        for numero, estudio in enumerate(estudios, start=1)
    ]
    paciente = SimpleNamespace(
        id=0, first_name="MARIA", last_name="EJEMPLO GONZALEZ", date_of_birth=date(1990, 4, 17)
    )
    return ordenes, paciente


@router.get("/me/order-settings/from-prescription", response_model=AjustesOrden)
def order_settings_from_prescription(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_profile.update")),
):
    """«Copiar de mi receta» (plan 26, D-11): los ajustes de la orden armados con
    los de la receta, SIN guardarlos.

    La orden ya no lee la receta; esto evita capturar dos veces. La pantalla
    los muestra, el médico los ajusta y los guarda con ``PUT /me``.
    """
    from app.utils.orden_config import ajustes_desde_receta

    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return ajustes_desde_receta(profile)


@router.post("/me/order-preview")
def preview_my_order(
    *,
    db: Session = Depends(get_db),
    datos: PrevisualizacionOrdenRequest,
    current_user: User = Depends(require_permission("doctor_profile.update")),
):
    """El PDF REAL de una orden de muestra con los ajustes **sin guardar**.

    Lo genera el mismo código que la orden de verdad, con datos de ejemplo,
    para que el médico vea cómo le va a quedar antes de decidir. No guarda
    nada.
    """
    from fastapi.responses import StreamingResponse

    from app.models.tenant import Tenant
    from app.utils.orden_config import normalizar_ajustes_orden
    from app.utils.pdf import generate_consolidated_order_pdf

    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    ajustes = normalizar_ajustes_orden(
        datos.order_settings.model_dump() if datos.order_settings else profile.order_settings
    )
    ordenes, paciente = _ordenes_de_muestra()
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    pdf = generate_consolidated_order_pdf(
        ordenes, _PerfilConAjustesDeOrden(profile, ajustes), paciente, tenant.name if tenant else "",
        folio="C-MUESTRA", modo=datos.modo or ajustes["modo_impresion"], ajustes_orden=ajustes,
    )
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="vista-previa-orden.pdf"'},
    )


# ---------------------------------------------------------------------------
# Plazos para considerar atrasado un estudio (plan 32, punto 3)
# ---------------------------------------------------------------------------

class PlazosAtrasado(BaseModel):
    """Días sin resultado, por prioridad, para que un estudio cuente como atrasado.

    De fábrica 7, 15 y 30 (decisión de Emilio, 2026-10-05). Estricto: una
    clave desconocida o un número fuera de 1–365 es 422, para que un error
    de captura no deje a nadie sin avisos.
    """

    model_config = ConfigDict(extra="forbid")

    urgent: int = Field(default=7, ge=1, le=365)
    preferential: int = Field(default=15, ge=1, le=365)
    routine: int = Field(default=30, ge=1, le=365)


@router.get("/me/plazos-atrasado", response_model=PlazosAtrasado)
def get_plazos_atrasado(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_profile.read")),
):
    """Los plazos del médico; sin perfil o sin cambiar, los de fábrica."""
    from app.services.estudios_atrasados import normalizar_plazos

    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    return PlazosAtrasado(**normalizar_plazos(profile.plazos_atrasado if profile else None))


@router.put("/me/plazos-atrasado", response_model=PlazosAtrasado)
def put_plazos_atrasado(
    datos: PlazosAtrasado,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_profile.update")),
):
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Primero completa tu perfil profesional para guardar tus plazos.")
    profile.plazos_atrasado = datos.model_dump()
    db.commit()
    return datos
