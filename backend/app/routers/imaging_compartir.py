"""Cortes clave, hoja en PDF y enlaces temporales de los estudios de imagen.

Lo que este router respeta, y conviene recordar al tocarlo:

- El original DICOM no se toca. Las capturas y la hoja son derivados.
- Un enlace temporal sale del consultorio, así que: exige confirmar el
  consentimiento del paciente (queda registrado), vence (máximo una semana), se
  puede revocar y sirve los cortes **sin identidad** (ver ``desidentificar``).
  Del token sólo se guarda su hash.
- Todo lo que se genera, se comparte o se abre por enlace queda en la bitácora.
- Los endpoints públicos no dicen por qué falló un enlace (no existe, venció o
  se revocó): a quien no lo tiene no se le da pistas.
"""
import hashlib
import json
import secrets
from datetime import timedelta
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from app.core.hora_local import ahora_local
from app.core.storage import default_storage
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.imaging import ImagingKeyImage, ImagingSeries, ImagingShareLink
from app.models.user import User
from app.routers.imaging import _estudio_en_alcance, _serie_en_alcance
from app.schemas.imaging import (
    ExportPdfRequest,
    ImagingKeyImageOut,
    ImagingKeyImageUpdate,
    KeyImageViewState,
    SharedSeriesOut,
    SharedStudyOut,
    ShareLinkCreate,
    ShareLinkCreatedOut,
    ShareLinkOut,
)
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.imagen_medica.almacen import leer_manifiesto
from app.services.imagen_medica.desidentificar import declara_texto_grabado, desidentificar
from app.services.imagen_medica.hoja_de_cortes import FiguraDeCorte, generar_hoja_de_cortes

router = APIRouter(tags=["imagenes-medicas"])
router_publico = APIRouter(prefix="/public/imaging", tags=["imagenes-compartidas"])

PNG = b"\x89PNG\r\n\x1a\n"
MAX_BYTES_CAPTURA = 6 * 1024 * 1024

AVISO_ENLACE = (
    "Material compartido temporalmente por el consultorio. No incluye datos del "
    "paciente y no es un informe radiológico."
)
AVISO_TEXTO_GRABADO = (
    "El equipo declara que este estudio trae texto grabado dentro de la imagen: "
    "puede mostrar el nombre del paciente aunque se le hayan quitado los datos al archivo."
)

_SIN_CACHE = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
}


# ── Cortes clave ────────────────────────────────────────────────────────────


def _corte_clave_en_alcance(db: Session, key_image_id: int, user: User) -> ImagingKeyImage:
    marca = (
        scoped_query(db.query(ImagingKeyImage), ImagingKeyImage, user)
        .filter(ImagingKeyImage.id == key_image_id)
        .first()
    )
    if not marca:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el corte clave."
        )
    return marca


def _salida_corte(marca: ImagingKeyImage) -> ImagingKeyImageOut:
    return ImagingKeyImageOut(
        id=marca.id,
        study_id=marca.study_id,
        series_id=marca.series_id,
        series_description=marca.series.series_description if marca.series else None,
        instance_index=marca.instance_index,
        sop_instance_uid=marca.sop_instance_uid,
        label=marca.label,
        notes=marca.notes,
        view_state=marca.view_state or {},
        has_image=bool(marca.image_path),
        created_at=marca.created_at,
        updated_at=marca.updated_at,
        created_by=marca.created_by.full_name if marca.created_by else None,
    )


@router.get("/imaging/studies/{study_id}/key-images", response_model=list[ImagingKeyImageOut])
def listar_cortes_clave(
    study_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> list[ImagingKeyImageOut]:
    estudio = _estudio_en_alcance(db, study_id, current_user)
    marcas = (
        db.query(ImagingKeyImage)
        .filter(ImagingKeyImage.study_id == estudio.id)
        .order_by(ImagingKeyImage.series_id, ImagingKeyImage.instance_index)
        .all()
    )
    return [_salida_corte(m) for m in marcas]


@router.post(
    "/imaging/studies/{study_id}/key-images",
    response_model=ImagingKeyImageOut,
    status_code=status.HTTP_201_CREATED,
)
async def guardar_corte_clave(
    study_id: int,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
    series_id: Annotated[int, Form()],
    instance_index: Annotated[int, Form(ge=0)],
    sop_instance_uid: Annotated[Optional[str], Form(max_length=64)] = None,
    label: Annotated[Optional[str], Form(max_length=120)] = None,
    notes: Annotated[Optional[str], Form(max_length=2000)] = None,
    view_state: Annotated[str, Form()] = "{}",
    imagen: Annotated[Optional[UploadFile], File()] = None,
) -> ImagingKeyImageOut:
    """Marca un corte como clave, con su nota y, si se manda, su captura PNG.

    Marcar otra vez el mismo corte lo actualiza (201 la primera vez, 200 las
    siguientes): una marca por corte.
    """
    estudio = _estudio_en_alcance(db, study_id, current_user)
    serie = _serie_en_alcance(db, series_id, current_user)
    if serie.study_id != estudio.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="La serie no pertenece a ese estudio."
        )
    if instance_index >= serie.instance_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Ese corte no existe en la serie."
        )

    try:
        estado = KeyImageViewState(**json.loads(view_state or "{}")).model_dump()
    except (ValueError, TypeError, ValidationError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El estado de la vista no es válido.",
        ) from error

    contenido: Optional[bytes] = None
    if imagen is not None:
        contenido = await imagen.read(MAX_BYTES_CAPTURA + 1)
        if len(contenido) > MAX_BYTES_CAPTURA:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="La captura pesa demasiado (máximo 6 MB).",
            )
        if not contenido.startswith(PNG):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La captura debe ser una imagen PNG.",
            )

    marca = (
        db.query(ImagingKeyImage)
        .filter(
            ImagingKeyImage.series_id == serie.id, ImagingKeyImage.instance_index == instance_index
        )
        .first()
    )
    nueva = marca is None
    if nueva:
        marca = ImagingKeyImage(
            tenant_id=current_user.tenant_id,
            study_id=estudio.id,
            series_id=serie.id,
            created_by_user_id=current_user.id,
            instance_index=instance_index,
        )
        db.add(marca)
    marca.sop_instance_uid = sop_instance_uid or marca.sop_instance_uid
    marca.view_state = estado
    if label is not None:
        marca.label = label.strip() or None
    if notes is not None:
        marca.notes = notes.strip() or None
    db.flush()

    if contenido is not None:
        ruta = f"{estudio.storage_prefix}/capturas/{marca.id}.png"
        try:
            default_storage.save(ruta, contenido)
        except OSError as error:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No se pudo guardar la captura. No se marcó el corte; intenta de nuevo.",
            ) from error
        marca.image_path = ruta
    db.commit()
    db.refresh(marca)

    log_action(
        db,
        action="imaging_key_image_save",
        entity_type="imaging_key_image",
        entity_id=marca.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        patient_id=estudio.patient_id,
        request=request,
        details={
            "study_id": estudio.id,
            "series_id": serie.id,
            "instance_index": instance_index,
            "con_captura": bool(marca.image_path),
        },
    )
    if not nueva:
        response.status_code = status.HTTP_200_OK
    return _salida_corte(marca)


@router.patch("/imaging/key-images/{key_image_id}", response_model=ImagingKeyImageOut)
def editar_corte_clave(
    key_image_id: int,
    datos: ImagingKeyImageUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> ImagingKeyImageOut:
    marca = _corte_clave_en_alcance(db, key_image_id, current_user)
    cambios = datos.model_dump(exclude_unset=True)
    if "label" in cambios:
        marca.label = (cambios["label"] or "").strip() or None
    if "notes" in cambios:
        marca.notes = (cambios["notes"] or "").strip() or None
    db.commit()
    db.refresh(marca)
    return _salida_corte(marca)


@router.get("/imaging/key-images/{key_image_id}/image")
def ver_captura(
    key_image_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Response:
    marca = _corte_clave_en_alcance(db, key_image_id, current_user)
    if not marca.image_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Este corte clave no tiene captura."
        )
    try:
        contenido = default_storage.read(marca.image_path)
    except (FileNotFoundError, OSError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La captura no está en el almacenamiento.",
        ) from error
    registrar_acceso(db, current_user, marca.study.patient_id, SeccionClinica.IMAGENES)
    return Response(content=contenido, media_type="image/png", headers=_SIN_CACHE)


@router.delete("/imaging/key-images/{key_image_id}", status_code=status.HTTP_204_NO_CONTENT)
def quitar_corte_clave(
    key_image_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> Response:
    marca = _corte_clave_en_alcance(db, key_image_id, current_user)
    ruta = marca.image_path
    paciente_id = marca.study.patient_id
    estudio_id = marca.study_id
    db.delete(marca)
    db.commit()
    if ruta:
        try:
            default_storage.delete(ruta)
        except OSError:
            # La marca ya no existe; un archivo huérfano no debe devolver un error
            # que haga creer que el corte sigue marcado.
            pass
    log_action(
        db,
        action="imaging_key_image_delete",
        entity_type="imaging_key_image",
        entity_id=key_image_id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        patient_id=paciente_id,
        request=request,
        details={"study_id": estudio_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/imaging/studies/{study_id}/export-pdf")
def exportar_hoja_de_cortes(
    study_id: int,
    datos: ExportPdfRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Response:
    """La hoja de cortes clave con captura, lista para la nota o el paciente."""
    estudio = _estudio_en_alcance(db, study_id, current_user)
    consulta = db.query(ImagingKeyImage).filter(
        ImagingKeyImage.study_id == estudio.id, ImagingKeyImage.image_path.isnot(None)
    )
    if datos.key_image_ids:
        consulta = consulta.filter(ImagingKeyImage.id.in_(datos.key_image_ids))
    marcas = consulta.order_by(ImagingKeyImage.series_id, ImagingKeyImage.instance_index).all()
    if not marcas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No hay cortes clave con captura para imprimir. Captura el corte y "
                "guárdalo como corte clave."
            ),
        )

    figuras: list[FiguraDeCorte] = []
    # La fecha del estudio es de calendario (medianoche), no un instante: pasarla
    # por la zona horaria la correría al día anterior.
    fecha = estudio.study_date.strftime("%d/%m/%Y") if estudio.study_date else ""
    for marca in marcas:
        try:
            imagen = default_storage.read(marca.image_path)
        except (FileNotFoundError, OSError):
            # Si falta una captura se dice, no se omite en silencio.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Falta la captura del corte {marca.instance_index + 1}. Vuelve a "
                    "guardarlo como corte clave."
                ),
            ) from None
        serie = marca.series.series_description if marca.series else None
        figuras.append(
            FiguraDeCorte(
                imagen=imagen,
                titulo=marca.label or f"Corte {marca.instance_index + 1}",
                detalle=" · ".join(
                    parte
                    for parte in (serie, f"corte {marca.instance_index + 1}", fecha)
                    if parte
                ),
                nota=marca.notes,
            )
        )

    pdf = generar_hoja_de_cortes(
        figuras,
        consultorio=current_user.tenant.name if current_user.tenant else "",
        estudio=" · ".join(
            parte for parte in (estudio.study_description or "Estudio de imagen", estudio.modality, fecha) if parte
        ),
        paciente=estudio.patient,
        generado_por=current_user.full_name,
        ahora=ahora_local(),
        anonimo=datos.anonimo,
    )
    registrar_acceso(db, current_user, estudio.patient_id, SeccionClinica.IMAGENES)
    log_action(
        db,
        action="imaging_export_pdf",
        entity_type="imaging_study",
        entity_id=estudio.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        patient_id=estudio.patient_id,
        request=request,
        details={"cortes": len(marcas), "anonimo": datos.anonimo},
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            **_SIN_CACHE,
            "Content-Disposition": f'attachment; filename="cortes-clave-{estudio.id}.pdf"',
        },
    )


# ── Enlaces temporales: gestión ─────────────────────────────────────────────


def _hash_del_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _estado_del_enlace(enlace: ImagingShareLink) -> str:
    if enlace.revoked_at is not None:
        return "revocado"
    if enlace.expires_at <= utcnow():
        return "vencido"
    return "activo"


def _salida_enlace(enlace: ImagingShareLink) -> dict:
    return {
        "id": enlace.id,
        "recipient_note": enlace.recipient_note,
        "created_at": enlace.created_at,
        "expires_at": enlace.expires_at,
        "revoked_at": enlace.revoked_at,
        "access_count": enlace.access_count,
        "last_access_at": enlace.last_access_at,
        "created_by": enlace.created_by.full_name if enlace.created_by else None,
        "estado": _estado_del_enlace(enlace),
    }


def _hay_texto_grabado(estudio) -> bool:
    """Mira el primer corte de las primeras series. Sólo lee cabeceras."""
    for serie in list(estudio.series)[:3]:
        if not serie.manifest_path:
            continue
        manifiesto = leer_manifiesto(default_storage, serie.manifest_path) or {}
        instancias = manifiesto.get("instances") or []
        if not instancias:
            continue
        try:
            if declara_texto_grabado(default_storage.read(instancias[0]["path"])):
                return True
        except (FileNotFoundError, OSError, KeyError):
            continue
    return False


@router.post(
    "/imaging/studies/{study_id}/share-links",
    response_model=ShareLinkCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_enlace(
    study_id: int,
    datos: ShareLinkCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> ShareLinkCreatedOut:
    """Crea un enlace temporal. Hay que confirmar el consentimiento del paciente."""
    if not datos.consent_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Para compartir el estudio fuera del consultorio, confirma que el paciente "
                "dio su consentimiento."
            ),
        )
    estudio = _estudio_en_alcance(db, study_id, current_user)
    if not estudio.is_ready:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El estudio no está listo para compartirse: no terminó de leerse.",
        )

    token = secrets.token_urlsafe(32)
    ahora = utcnow()
    enlace = ImagingShareLink(
        tenant_id=current_user.tenant_id,
        study_id=estudio.id,
        created_by_user_id=current_user.id,
        token_hash=_hash_del_token(token),
        recipient_note=(datos.note or "").strip() or None,
        expires_at=ahora + timedelta(hours=datos.hours),
        consent_confirmed_at=ahora,
    )
    db.add(enlace)
    db.commit()
    db.refresh(enlace)

    log_action(
        db,
        action="imaging_share_link_create",
        entity_type="imaging_share_link",
        entity_id=enlace.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        patient_id=estudio.patient_id,
        request=request,
        details={"study_id": estudio.id, "horas": datos.hours, "consentimiento": True},
    )
    avisos = [AVISO_TEXTO_GRABADO] if _hay_texto_grabado(estudio) else []
    return ShareLinkCreatedOut(**_salida_enlace(enlace), token=token, avisos=avisos)


@router.get("/imaging/studies/{study_id}/share-links", response_model=list[ShareLinkOut])
def listar_enlaces(
    study_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> list[ShareLinkOut]:
    estudio = _estudio_en_alcance(db, study_id, current_user)
    enlaces = (
        db.query(ImagingShareLink)
        .filter(ImagingShareLink.study_id == estudio.id)
        .order_by(ImagingShareLink.created_at.desc())
        .all()
    )
    return [ShareLinkOut(**_salida_enlace(e)) for e in enlaces]


@router.post("/imaging/share-links/{link_id}/revoke", response_model=ShareLinkOut)
def revocar_enlace(
    link_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> ShareLinkOut:
    enlace = (
        scoped_query(db.query(ImagingShareLink), ImagingShareLink, current_user)
        .filter(ImagingShareLink.id == link_id)
        .first()
    )
    if not enlace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el enlace."
        )
    if enlace.revoked_at is None:
        enlace.revoked_at = utcnow()
        db.commit()
        db.refresh(enlace)
        log_action(
            db,
            action="imaging_share_link_revoke",
            entity_type="imaging_share_link",
            entity_id=enlace.id,
            actor_user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            patient_id=enlace.study.patient_id,
            request=request,
        )
    return ShareLinkOut(**_salida_enlace(enlace))


# ── Enlaces temporales: lo que ve quien lo abre (sin sesión) ────────────────


def _enlace_vigente(db: Session, token: str) -> ImagingShareLink:
    """El enlace del token, o 404. No distingue «no existe» de «venció»."""
    enlace = (
        db.query(ImagingShareLink)
        .filter(ImagingShareLink.token_hash == _hash_del_token(token))
        .first()
    )
    if enlace is None or _estado_del_enlace(enlace) != "activo":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este enlace no existe o ya no está disponible.",
        )
    return enlace


def _serie_del_enlace(db: Session, enlace: ImagingShareLink, series_id: int) -> ImagingSeries:
    serie = (
        db.query(ImagingSeries)
        .filter(ImagingSeries.id == series_id, ImagingSeries.study_id == enlace.study_id)
        .first()
    )
    if serie is None or not serie.manifest_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la serie."
        )
    return serie


@router_publico.get("/shared/{token}", response_model=SharedStudyOut)
def ver_estudio_compartido(
    token: str,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> SharedStudyOut:
    enlace = _enlace_vigente(db, token)
    estudio = enlace.study
    enlace.access_count = (enlace.access_count or 0) + 1
    enlace.last_access_at = utcnow()
    db.commit()
    log_action(
        db,
        action="imaging_share_link_open",
        entity_type="imaging_share_link",
        entity_id=enlace.id,
        actor_user_id=None,
        tenant_id=enlace.tenant_id,
        patient_id=estudio.patient_id,
        request=request,
        details={"study_id": estudio.id},
    )
    response.headers.update(_SIN_CACHE)
    return SharedStudyOut(
        modality=estudio.modality,
        study_date=estudio.study_date,
        study_description=estudio.study_description,
        body_part=estudio.body_part,
        series=[
            SharedSeriesOut(
                id=s.id,
                series_number=s.series_number,
                series_description=s.series_description,
                sequence_label=s.sequence_label,
                modality=s.modality,
                instance_count=s.instance_count,
            )
            for s in estudio.series
        ],
        expires_at=enlace.expires_at,
        aviso=AVISO_ENLACE,
    )


@router_publico.get("/shared/{token}/series/{series_id}/manifest")
def manifiesto_compartido(
    token: str,
    series_id: int,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    enlace = _enlace_vigente(db, token)
    serie = _serie_del_enlace(db, enlace, series_id)
    manifiesto = leer_manifiesto(default_storage, serie.manifest_path)
    if manifiesto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se pudo leer la serie."
        )
    response.headers.update(_SIN_CACHE)
    # Sólo lo que el visor necesita. Sin la ruta interna de almacenamiento, que
    # trae el identificador del paciente.
    return {
        "series_description": manifiesto.get("series_description"),
        "sequence_label": manifiesto.get("sequence_label"),
        "modality": manifiesto.get("modality"),
        "instances": [
            {
                "sop_instance_uid": i["sop_instance_uid"],
                "instance_number": i.get("instance_number"),
                "position": i.get("position"),
                "orientation": i.get("orientation"),
                "rows": i.get("rows"),
                "columns": i.get("columns"),
                "url": f"/public/imaging/shared/{token}/series/{serie.id}/instances/{i['sop_instance_uid']}",
            }
            for i in manifiesto.get("instances", [])
        ],
    }


@router_publico.get("/shared/{token}/series/{series_id}/instances/{sop_uid}")
def corte_compartido(
    token: str,
    series_id: int,
    sop_uid: str,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """El corte, **sin identidad**: pasa por ``desidentificar`` en cada petición."""
    enlace = _enlace_vigente(db, token)
    serie = _serie_del_enlace(db, enlace, series_id)
    manifiesto = leer_manifiesto(default_storage, serie.manifest_path) or {}
    ruta = next(
        (
            i["path"]
            for i in manifiesto.get("instances", [])
            if i.get("sop_instance_uid") == sop_uid
        ),
        None,
    )
    if not ruta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ese corte no está en la serie."
        )
    try:
        original = default_storage.read(ruta)
        contenido = desidentificar(original)
    except (FileNotFoundError, OSError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el corte."
        ) from error
    except ValueError as error:
        # Preferible no servir nada a servir el original con su nombre.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Este corte no se puede compartir sin identidad.",
        ) from error
    return Response(content=contenido, media_type="application/dicom", headers=_SIN_CACHE)
