"""Modelo 3D del paciente desde una serie de su estudio (Cortex, feat/modelo-3d-desde-tc).

Lo que este router respeta, y conviene recordar al tocarlo:

- Es un módulo opcional (``neuro3d_paciente``): apagado, todo responde 404.
- Ver un modelo pide ``clinical_images.read``; pedirlo o marcarlo revisado,
  ``neuro3d.generar_modelo``. Además, el alcance clínico del paciente: un médico
  sólo ve y pide modelos de su expediente.
- El estado se dice tal cual. «Listo» sólo cuando el segmentador entregó el
  archivo y quedó guardado; si algo falla, ``fallo`` con su motivo. Un trabajo
  que el reinicio del servidor dejó colgado se vence al consultarlo.
- La reconstrucción es automática: se puede marcar como revisada, pero nada aquí
  la vuelve diagnóstico.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_con_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.modulos import require_modulo
from app.core.storage import default_storage
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.imaging import ImagingSeries, ImagingStudy
from app.models.imaging_modelo_3d import EstadoModelo3D, ImagingModelo3D
from app.models.user import User
from app.schemas.modelo_3d import Modelo3DOut
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.modelo_3d import trabajo

router = APIRouter(
    tags=["modelo-3d-paciente"],
    dependencies=[Depends(require_modulo("neuro3d_paciente"))],
)

MODALIDADES = ("CT", "MR")
# Con menos cortes no hay un volumen que segmentar: es una localizadora o
# un par de cortes sueltos.
MIN_CORTES = 10

NO_HAY_MODELO = "Aún no se ha generado un modelo 3D de esta serie."


def _estudio(db: Session, study_id: int, user: User) -> ImagingStudy:
    estudio = (
        scoped_query(db.query(ImagingStudy), ImagingStudy, user)
        .filter(ImagingStudy.id == study_id)
        .first()
    )
    if not estudio:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró el estudio. Puede que lo hayan eliminado; actualiza el expediente.",
        )
    resolver_paciente_con_relacion_asistencial(db, estudio.patient_id, user)
    return estudio


def _serie(db: Session, estudio: ImagingStudy, series_id: int, user: User) -> ImagingSeries:
    serie = (
        scoped_query(db.query(ImagingSeries), ImagingSeries, user)
        .filter(ImagingSeries.id == series_id, ImagingSeries.study_id == estudio.id)
        .first()
    )
    if not serie:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la serie en ese estudio.")
    return serie


def _modelo(db: Session, modelo_id: int, user: User) -> ImagingModelo3D:
    modelo = (
        scoped_query(db.query(ImagingModelo3D), ImagingModelo3D, user)
        .filter(ImagingModelo3D.id == modelo_id)
        .first()
    )
    if not modelo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el modelo 3D.")
    resolver_paciente_con_relacion_asistencial(db, modelo.patient_id, user)
    return modelo


def _salida(modelo: ImagingModelo3D) -> Modelo3DOut:
    return Modelo3DOut(
        id=modelo.id,
        patient_id=modelo.patient_id,
        study_id=modelo.study_id,
        series_id=modelo.series_id,
        region=modelo.region,
        estado=modelo.estado,
        motivo_fallo=modelo.motivo_fallo,
        estructuras=modelo.estructuras,
        motor=modelo.motor,
        motor_version=modelo.motor_version,
        sintetico=bool(modelo.sintetico),
        solicitado_por=modelo.solicitado_por.full_name if modelo.solicitado_por else None,
        solicitado_en=modelo.solicitado_en,
        terminado_en=modelo.terminado_en,
        confirmado_por=modelo.confirmado_por.full_name if modelo.confirmado_por else None,
        confirmado_en=modelo.confirmado_en,
        estudio_fecha=modelo.study.study_date if modelo.study else None,
        estudio_descripcion=modelo.study.study_description if modelo.study else None,
        serie_descripcion=modelo.series.series_description if modelo.series else None,
        modalidad=modelo.series.modality if modelo.series else None,
    )


@router.post(
    "/imaging/studies/{study_id}/series/{series_id}/modelo-3d",
    response_model=Modelo3DOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def generar_modelo(
    study_id: int,
    series_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("neuro3d.generar_modelo"))],
) -> Modelo3DOut:
    """Encola la reconstrucción. Responde en el acto con su estado («pendiente»)."""
    estudio = _estudio(db, study_id, current_user)
    serie = _serie(db, estudio, series_id, current_user)
    if (serie.modality or "").upper() not in MODALIDADES:
        raise HTTPException(
            status_code=422,
            detail="El modelo 3D se arma desde una tomografía o una resonancia.",
        )
    if not serie.has_geometry:
        raise HTTPException(
            status_code=422,
            detail="La serie no trae datos de posición de los cortes: sin ellos no hay volumen que reconstruir.",
        )
    if (serie.instance_count or 0) < MIN_CORTES:
        raise HTTPException(
            status_code=422,
            detail=f"La serie tiene muy pocos cortes ({serie.instance_count}) para armar un volumen. Elige la serie axial completa.",
        )

    # Pedirlo dos veces mientras se procesa no lanza dos segmentaciones.
    en_curso = (
        db.query(ImagingModelo3D)
        .filter(
            ImagingModelo3D.series_id == serie.id,
            ImagingModelo3D.estado.in_(trabajo.EN_CURSO),
        )
        .order_by(ImagingModelo3D.id.desc())
        .first()
    )
    if en_curso and not trabajo.vencer_si_colgado(db, en_curso):
        return _salida(en_curso)

    modelo = ImagingModelo3D(
        tenant_id=current_user.tenant_id,
        patient_id=estudio.patient_id,
        study_id=estudio.id,
        series_id=serie.id,
        region="columna",
        estado=EstadoModelo3D.PENDIENTE.value,
        solicitado_por_user_id=current_user.id,
        solicitado_en=utcnow(),
    )
    db.add(modelo)
    db.commit()
    db.refresh(modelo)
    log_action(
        db,
        action="modelo3d_solicitar",
        entity_type="imaging_modelo_3d",
        entity_id=modelo.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        patient_id=estudio.patient_id,
        request=request,
        details={"study_id": estudio.id, "series_id": serie.id, "modalidad": serie.modality},
    )
    trabajo.encolar(modelo.id)
    db.refresh(modelo)
    return _salida(modelo)


@router.get(
    "/imaging/studies/{study_id}/series/{series_id}/modelo-3d",
    response_model=Modelo3DOut,
)
def estado_del_modelo(
    study_id: int,
    series_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Modelo3DOut:
    """El modelo más reciente de la serie, con su estado tal cual."""
    estudio = _estudio(db, study_id, current_user)
    serie = _serie(db, estudio, series_id, current_user)
    modelo = (
        db.query(ImagingModelo3D)
        .filter(ImagingModelo3D.series_id == serie.id)
        .order_by(ImagingModelo3D.id.desc())
        .first()
    )
    if not modelo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_HAY_MODELO)
    trabajo.vencer_si_colgado(db, modelo)
    return _salida(modelo)


@router.get("/patients/{patient_id}/modelos-3d", response_model=list[Modelo3DOut])
def modelos_del_paciente(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> list[Modelo3DOut]:
    """Todos los modelos del paciente, el más reciente primero (para Neuro 3D)."""
    resolver_paciente_con_relacion_asistencial(db, patient_id, current_user)
    modelos = (
        scoped_query(db.query(ImagingModelo3D), ImagingModelo3D, current_user)
        .filter(ImagingModelo3D.patient_id == patient_id)
        .order_by(ImagingModelo3D.id.desc())
        .all()
    )
    for modelo in modelos:
        trabajo.vencer_si_colgado(db, modelo)
    return [_salida(m) for m in modelos]


@router.get("/imaging/modelos-3d/{modelo_id}/mallas")
def descargar_mallas(
    modelo_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Response:
    """El GLB del modelo (mm, LPS). Sólo si está listo; sin caché pública."""
    modelo = _modelo(db, modelo_id, current_user)
    if modelo.estado != EstadoModelo3D.LISTO.value or not modelo.archivo_path:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El modelo 3D todavía no está listo.")
    try:
        contenido = default_storage.read(modelo.archivo_path)
    except (FileNotFoundError, OSError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo del modelo no está en el almacenamiento. Vuelve a generarlo.",
        ) from error
    registrar_acceso(db, current_user, modelo.patient_id, SeccionClinica.IMAGENES)
    return Response(
        content=contenido,
        media_type="model/gltf-binary",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )


@router.post("/imaging/modelos-3d/{modelo_id}/revisado", response_model=Modelo3DOut)
def marcar_revisado(
    modelo_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("neuro3d.generar_modelo"))],
) -> Modelo3DOut:
    """El médico dice que revisó la reconstrucción contra las imágenes."""
    modelo = _modelo(db, modelo_id, current_user)
    if modelo.estado != EstadoModelo3D.LISTO.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sólo se revisa un modelo que está listo.")
    if modelo.confirmado_en is None:
        modelo.confirmado_por_user_id = current_user.id
        modelo.confirmado_en = utcnow()
        db.commit()
        db.refresh(modelo)
        log_action(
            db,
            action="modelo3d_revisado",
            entity_type="imaging_modelo_3d",
            entity_id=modelo.id,
            actor_user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            patient_id=modelo.patient_id,
            request=request,
        )
    return _salida(modelo)
