"""Estudios de imagen en el expediente: ingesta, manifiesto y mediciones.

Reglas que este router respeta y que conviene tener presentes al tocarlo:

- El original es inmutable: se guarda y se sirve tal cual. Nada se recomprime ni
  se reescribe.
- El estado se dice: si faltan series o algún archivo no se pudo leer, el
  estudio queda en ``partial`` con el detalle. La interfaz no puede afirmar que
  está completo cuando no lo está.
- Todo acceso a la imagen queda en bitácora, igual que el resto del expediente.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_con_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.storage import default_storage
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.imaging import (
    ImagingAnnotation,
    ImagingSeries,
    ImagingStudy,
    ImagingStudySource,
    ImagingStudyStatus,
)
from app.models.user import User
from app.schemas.imaging import (
    ComparisonCandidateOut,
    ImagingAnnotationCreate,
    ImagingAnnotationOut,
    ImagingSeriesOut,
    ImagingStudyCreatedOut,
    ImagingStudyDetailOut,
    ImagingStudyOut,
    ImagingUploadResult,
)
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.imagen_medica.almacen import (
    ArchivoInvalido,
    borrar_estudio,
    extraer_zip,
    guardar_estudio,
    leer_manifiesto,
    prefijo_del_estudio,
)
from app.services.imagen_medica.ingesta import (
    MAX_BYTES_POR_ARCHIVO,
    GrupoEstudio,
    GrupoSerie,
    agrupar,
    comparabilidad,
    leer_instancia,
    parece_dicom,
)

router = APIRouter(tags=["imagenes-medicas"])

# Una RM cerebral ronda los 80-400 MB; una angio-TC con cortes finos puede pasar
# de 500. El límite protege la memoria del servidor mientras la ingesta trabaja
# en memoria; partirlo en dos cargas es preferible a tumbar el backend en
# horario de consulta.
MAX_BYTES_POR_CARGA = 400 * 1024 * 1024


def _paciente(db: Session, patient_id: int, current_user: User):
    return resolver_paciente_con_relacion_asistencial(db, patient_id, current_user)


def _estudio_en_alcance(db: Session, study_id: int, current_user: User) -> ImagingStudy:
    estudio = (
        scoped_query(db.query(ImagingStudy), ImagingStudy, current_user)
        .filter(ImagingStudy.id == study_id)
        .first()
    )
    if not estudio:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró el estudio. Puede que lo hayan eliminado; actualiza el expediente.",
        )
    return estudio


def _serie_en_alcance(db: Session, series_id: int, current_user: User) -> ImagingSeries:
    serie = (
        scoped_query(db.query(ImagingSeries), ImagingSeries, current_user)
        .filter(ImagingSeries.id == series_id)
        .first()
    )
    if not serie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la serie."
        )
    return serie


def _grupo_desde_fila(estudio: ImagingStudy) -> GrupoEstudio:
    """Vista mínima para comparar dos estudios ya guardados."""
    return GrupoEstudio(
        study_instance_uid=estudio.study_instance_uid,
        modality=estudio.modality,
        study_date=estudio.study_date,
        study_description=estudio.study_description,
        institution=estudio.institution_name,
        accession=estudio.accession_number,
        body_part=estudio.body_part,
        series=[
            GrupoSerie(
                series_instance_uid=s.series_instance_uid,
                series_number=s.series_number,
                modality=s.modality,
                series_description=s.series_description,
                sequence_label=s.sequence_label,
                sequence_detected_by=s.sequence_detected_by,
            )
            for s in estudio.series
        ],
        tiene_contraste=estudio.has_contrast,
    )


def _avisos(estudio: ImagingStudy) -> list[str]:
    """Lo que el visor tiene que decir en voz alta antes de mostrar la imagen."""
    avisos: list[str] = []
    if estudio.status == ImagingStudyStatus.PARTIAL.value and estudio.status_detail:
        avisos.append(estudio.status_detail)
    sin_geometria = [s for s in estudio.series if not s.has_geometry]
    if sin_geometria:
        avisos.append(
            f"{len(sin_geometria)} serie(s) sin datos de posición: se muestran como pila "
            "de cortes, sin reconstrucción multiplanar."
        )
    if estudio.modality == "MR" and estudio.has_contrast is None:
        avisos.append("No se pudo determinar si el estudio tiene contraste.")
    return avisos


def _ingerir(
    db: Session,
    current_user: User,
    patient_id: int,
    pares: list[tuple[str, bytes]],
    *,
    source: str,
    institution_name: Optional[str],
    clinical_episode_id: Optional[int],
    request: Optional[Request],
) -> ImagingUploadResult:
    """Núcleo de la ingesta: cualquier canal entra por aquí."""
    result = ImagingUploadResult()
    contenidos: dict[str, bytes] = {}
    instancias = []
    total = 0

    for nombre, datos in pares:
        if len(datos) > MAX_BYTES_POR_ARCHIVO:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"«{nombre}» supera el tamaño máximo por archivo.",
            )
        total += len(datos)
        if total > MAX_BYTES_POR_CARGA:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    "La carga supera el máximo por estudio. Divide el estudio en dos "
                    "cargas; ninguna se pierde."
                ),
            )
        if not parece_dicom(datos):
            result.archivos_descartados += 1
            continue
        instancia = leer_instancia(datos)
        if instancia is None:
            result.archivos_descartados += 1
            continue
        if instancia.sop_instance_uid in contenidos:
            continue
        instancias.append(instancia)
        contenidos[instancia.sop_instance_uid] = datos
        result.archivos_leidos += 1

    if not instancias:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Ningún archivo es un estudio DICOM legible. Si el paciente trajo una foto "
                "de la pantalla o un PDF, súbelo como documento."
            ),
        )

    if result.archivos_descartados:
        result.mensajes.append(
            f"{result.archivos_descartados} archivo(s) no se pudieron leer y no se guardaron."
        )

    for estudio in agrupar(instancias):
        existente = (
            scoped_query(db.query(ImagingStudy), ImagingStudy, current_user)
            .filter(
                ImagingStudy.patient_id == patient_id,
                ImagingStudy.study_instance_uid == estudio.study_instance_uid,
            )
            .first()
        )
        if existente:
            result.ya_existentes.append(existente.id)
            continue

        fecha = estudio.study_date or utcnow()
        detalles: list[str] = []
        if estudio.study_date is None:
            detalles.append("El estudio no trae fecha en el DICOM; se usó la fecha de carga.")
        if result.archivos_descartados:
            detalles.append(
                f"{result.archivos_descartados} archivo(s) del lote no se pudieron leer."
            )

        prefijo = prefijo_del_estudio(
            current_user.tenant_id, patient_id, estudio.study_instance_uid
        )
        fila = ImagingStudy(
            tenant_id=current_user.tenant_id,
            patient_id=patient_id,
            clinical_episode_id=clinical_episode_id,
            uploaded_by_user_id=current_user.id,
            study_instance_uid=estudio.study_instance_uid,
            accession_number=estudio.accession,
            modality=estudio.modality,
            study_date=fecha,
            study_description=estudio.study_description,
            body_part=estudio.body_part,
            institution_name=institution_name or estudio.institution,
            source=source,
            status=ImagingStudyStatus.INDEXING.value,
            storage_prefix=prefijo,
            has_contrast=estudio.tiene_contraste,
        )
        db.add(fila)
        db.flush()

        try:
            guardado = guardar_estudio(
                default_storage, current_user.tenant_id, patient_id, estudio, contenidos
            )
        except (OSError, ValueError, SQLAlchemyError) as error:
            db.rollback()
            borrar_estudio(default_storage, prefijo)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "No se pudo guardar el estudio. No quedó nada a medias; vuelve a "
                    "intentarlo."
                ),
            ) from error

        rutas = {s["series_instance_uid"]: s for s in guardado["series"]}
        for serie in estudio.series:
            guardada = rutas.get(serie.series_instance_uid, {})
            referencia = serie.primera
            db.add(
                ImagingSeries(
                    tenant_id=current_user.tenant_id,
                    study_id=fila.id,
                    series_instance_uid=serie.series_instance_uid,
                    series_number=serie.series_number,
                    modality=serie.modality,
                    series_description=serie.series_description,
                    sequence_label=serie.sequence_label,
                    sequence_detected_by=serie.sequence_detected_by,
                    instance_count=guardada.get("instancias", len(serie.instancias)),
                    rows=referencia.rows if referencia else None,
                    columns=referencia.columns if referencia else None,
                    pixel_spacing_x=referencia.pixel_spacing[0] if referencia and referencia.pixel_spacing else None,
                    pixel_spacing_y=referencia.pixel_spacing[1] if referencia and referencia.pixel_spacing else None,
                    slice_thickness=referencia.slice_thickness if referencia else None,
                    has_geometry=serie.tiene_geometria,
                    is_derived=any("DERIVED" in t.upper() for t in (referencia.image_type if referencia else ())),
                    manifest_path=guardada.get("manifest_path"),
                    total_bytes=guardada.get("bytes", 0),
                )
            )

        fila.series_count = len(estudio.series)
        fila.instance_count = guardado["instancias"]
        fila.total_bytes = guardado["bytes"]
        fila.status = (
            ImagingStudyStatus.PARTIAL.value
            if detalles
            else ImagingStudyStatus.READY.value
        )
        fila.status_detail = " ".join(detalles) or None

        db.commit()
        db.refresh(fila)

        result.creados.append(
            ImagingStudyCreatedOut(
                id=fila.id,
                study_instance_uid=fila.study_instance_uid,
                modality=fila.modality,
                study_date=fila.study_date,
                series_count=fila.series_count,
                instance_count=fila.instance_count,
                total_bytes=fila.total_bytes,
                status=fila.status,
                status_detail=fila.status_detail,
            )
        )

    registrar_acceso(db, current_user, patient_id, SeccionClinica.IMAGENES)
    if result.creados:
        log_action(
            db,
            action="imaging_upload",
            entity_type="imaging_study",
            entity_id=result.creados[0].id,
            actor_user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            patient_id=patient_id,
            request=request,
            details={
                "creados": len(result.creados),
                "ya_existentes": len(result.ya_existentes),
                "descartados": result.archivos_descartados,
            },
        )
    return result


@router.post(
    "/patients/{patient_id}/imaging/upload",
    response_model=ImagingUploadResult,
    status_code=status.HTTP_201_CREATED,
)
async def subir_estudio(
    patient_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.upload"))],
    archivos: list[UploadFile] = File(...),
    institution_name: Optional[str] = Form(default=None),
    clinical_episode_id: Optional[int] = Form(default=None),
) -> ImagingUploadResult:
    """Sube cortes sueltos o una carpeta del CD. Detecta DICOM por cabecera."""
    _paciente(db, patient_id, current_user)
    pares = [(archivo.filename or "sin-nombre", await archivo.read()) for archivo in archivos]
    return _ingerir(
        db,
        current_user,
        patient_id,
        pares,
        source=ImagingStudySource.UPLOAD_FILES.value,
        institution_name=institution_name,
        clinical_episode_id=clinical_episode_id,
        request=request,
    )


@router.post(
    "/patients/{patient_id}/imaging/upload-archive",
    response_model=ImagingUploadResult,
    status_code=status.HTTP_201_CREATED,
)
async def subir_archivo_comprimido(
    patient_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.upload"))],
    archivo: UploadFile = File(...),
    institution_name: Optional[str] = Form(default=None),
    clinical_episode_id: Optional[int] = Form(default=None),
) -> ImagingUploadResult:
    """Sube un ZIP con el estudio completo (lo que suele venir de un CD copiado)."""
    _paciente(db, patient_id, current_user)
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES_POR_CARGA:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El ZIP supera el máximo por carga. Divídelo en dos.",
        )
    try:
        pares = extraer_zip(contenido)
    except ArchivoInvalido as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
        ) from error
    return _ingerir(
        db,
        current_user,
        patient_id,
        pares,
        source=ImagingStudySource.UPLOAD_ARCHIVE.value,
        institution_name=institution_name,
        clinical_episode_id=clinical_episode_id,
        request=request,
    )


@router.get(
    "/patients/{patient_id}/imaging/studies", response_model=list[ImagingStudyOut]
)
def listar_estudios(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> list[ImagingStudy]:
    _paciente(db, patient_id, current_user)
    estudios = (
        scoped_query(db.query(ImagingStudy), ImagingStudy, current_user)
        .filter(ImagingStudy.patient_id == patient_id)
        .order_by(ImagingStudy.study_date.desc(), ImagingStudy.id.desc())
        .all()
    )
    if estudios:
        registrar_acceso(db, current_user, patient_id, SeccionClinica.IMAGENES)
    return estudios


@router.get("/imaging/studies/{study_id}", response_model=ImagingStudyDetailOut)
def ver_estudio(
    study_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> ImagingStudyDetailOut:
    estudio = _estudio_en_alcance(db, study_id, current_user)
    registrar_acceso(db, current_user, estudio.patient_id, SeccionClinica.IMAGENES)

    anotaciones = [
        ImagingAnnotationOut(
            id=a.id,
            kind=a.kind,
            series_id=a.series_id,
            value=a.value,
            unit=a.unit,
            label=a.label,
            notes=a.notes,
            is_confirmed=a.is_confirmed,
            created_at=a.created_at,
            created_by=a.created_by.full_name if a.created_by else None,
        )
        for a in estudio.annotations
    ]
    detalle = ImagingStudyDetailOut.model_validate(estudio)
    detalle.series = [ImagingSeriesOut.model_validate(s) for s in estudio.series]
    detalle.annotations = anotaciones
    detalle.warnings = _avisos(estudio)
    return detalle


@router.get("/imaging/series/{series_id}/manifest")
def manifiesto_de_serie(
    series_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> dict:
    """Los cortes de una serie, en orden, con su URL de descarga.

    El visor pide este manifiesto una vez y luego cada corte contra su endpoint.
    """
    serie = _serie_en_alcance(db, series_id, current_user)
    if not serie.manifest_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La serie no tiene manifiesto; vuelve a subir el estudio.",
        )
    manifiesto = leer_manifiesto(default_storage, serie.manifest_path)
    if manifiesto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se pudo leer el manifiesto de la serie.",
        )
    registrar_acceso(db, current_user, serie.study.patient_id, SeccionClinica.IMAGENES)
    manifiesto["instances"] = [
        {
            **instancia,
            "url": f"/imaging/series/{serie.id}/instances/{instancia['sop_instance_uid']}",
        }
        for instancia in manifiesto.get("instances", [])
    ]
    return manifiesto


@router.get("/imaging/series/{series_id}/instances/{sop_uid}")
def descargar_instancia(
    series_id: int,
    sop_uid: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Response:
    """Devuelve el corte original. Sin recomprimir y sin caché pública."""
    serie = _serie_en_alcance(db, series_id, current_user)
    if not serie.manifest_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serie sin manifiesto.")
    manifiesto = leer_manifiesto(default_storage, serie.manifest_path) or {}
    ruta = next(
        (
            instancia["path"]
            for instancia in manifiesto.get("instances", [])
            if instancia.get("sop_instance_uid") == sop_uid
        ),
        None,
    )
    if not ruta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ese corte no está en la serie."
        )
    try:
        contenido = default_storage.read(ruta)
    except (FileNotFoundError, OSError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo del corte no está en el almacenamiento.",
        ) from error
    return Response(
        content=contenido,
        media_type="application/dicom",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.get(
    "/imaging/studies/{study_id}/annotations", response_model=list[ImagingAnnotationOut]
)
def listar_anotaciones(
    study_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> list[ImagingAnnotationOut]:
    estudio = _estudio_en_alcance(db, study_id, current_user)
    return [
        ImagingAnnotationOut(
            id=a.id,
            kind=a.kind,
            series_id=a.series_id,
            value=a.value,
            unit=a.unit,
            label=a.label,
            notes=a.notes,
            is_confirmed=a.is_confirmed,
            created_at=a.created_at,
            created_by=a.created_by.full_name if a.created_by else None,
        )
        for a in estudio.annotations
    ]


@router.post(
    "/imaging/studies/{study_id}/annotations",
    response_model=ImagingAnnotationOut,
    status_code=status.HTTP_201_CREATED,
)
def guardar_anotacion(
    study_id: int,
    datos: ImagingAnnotationCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> ImagingAnnotationOut:
    """Guarda una medición. Nace sin confirmar: es un trazo, no un dato firmado."""
    estudio = _estudio_en_alcance(db, study_id, current_user)
    if datos.series_id is not None:
        serie = _serie_en_alcance(db, datos.series_id, current_user)
        if serie.study_id != estudio.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La serie no pertenece a ese estudio.",
            )

    anotacion = ImagingAnnotation(
        tenant_id=current_user.tenant_id,
        study_id=estudio.id,
        series_id=datos.series_id,
        created_by_user_id=current_user.id,
        kind=datos.kind,
        geometry=datos.geometry,
        value=datos.value,
        unit=datos.unit,
        label=datos.label,
        notes=datos.notes,
    )
    db.add(anotacion)
    db.commit()
    db.refresh(anotacion)

    log_action(
        db,
        action="imaging_annotation_create",
        entity_type="imaging_annotation",
        entity_id=anotacion.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        patient_id=estudio.patient_id,
        request=request,
        details={"study_id": estudio.id, "kind": anotacion.kind, "value": anotacion.value},
    )
    return ImagingAnnotationOut(
        id=anotacion.id,
        kind=anotacion.kind,
        series_id=anotacion.series_id,
        value=anotacion.value,
        unit=anotacion.unit,
        label=anotacion.label,
        notes=anotacion.notes,
        is_confirmed=anotacion.is_confirmed,
        created_at=anotacion.created_at,
        created_by=current_user.full_name,
    )


@router.post(
    "/imaging/annotations/{annotation_id}/confirm",
    response_model=ImagingAnnotationOut,
)
def confirmar_anotacion(
    annotation_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> ImagingAnnotationOut:
    """Marca la medición como llevada a la nota. Solo entonces cuenta como dato."""
    anotacion = (
        scoped_query(db.query(ImagingAnnotation), ImagingAnnotation, current_user)
        .filter(ImagingAnnotation.id == annotation_id)
        .first()
    )
    if not anotacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la medición."
        )
    if not anotacion.is_confirmed:
        anotacion.is_confirmed = True
        anotacion.confirmed_at = utcnow()
        db.commit()
        db.refresh(anotacion)
        log_action(
            db,
            action="imaging_annotation_confirm",
            entity_type="imaging_annotation",
            entity_id=anotacion.id,
            actor_user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            patient_id=anotacion.study.patient_id,
            request=request,
        )
    return ImagingAnnotationOut(
        id=anotacion.id,
        kind=anotacion.kind,
        series_id=anotacion.series_id,
        value=anotacion.value,
        unit=anotacion.unit,
        label=anotacion.label,
        notes=anotacion.notes,
        is_confirmed=anotacion.is_confirmed,
        created_at=anotacion.created_at,
        created_by=anotacion.created_by.full_name if anotacion.created_by else None,
    )


@router.delete(
    "/imaging/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT
)
def borrar_anotacion(
    annotation_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> Response:
    anotacion = (
        scoped_query(db.query(ImagingAnnotation), ImagingAnnotation, current_user)
        .filter(ImagingAnnotation.id == annotation_id)
        .first()
    )
    if not anotacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la medición."
        )
    if anotacion.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La medición ya se llevó a la nota y no se borra: agrega una corrección "
                "en la nota, para no perder el rastro de lo que se midió."
            ),
        )
    db.delete(anotacion)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/imaging/studies/{study_id}/comparison-candidates",
    response_model=list[ComparisonCandidateOut],
)
def candidatos_para_comparar(
    study_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> list[ComparisonCandidateOut]:
    """Estudios previos del mismo paciente, con los avisos de comparabilidad.

    Se propone el más cercano de la misma modalidad; el médico confirma. Nunca
    se compara solo.
    """
    estudio = _estudio_en_alcance(db, study_id, current_user)
    previos = (
        scoped_query(db.query(ImagingStudy), ImagingStudy, current_user)
        .filter(
            ImagingStudy.patient_id == estudio.patient_id,
            ImagingStudy.id != estudio.id,
            ImagingStudy.study_date <= estudio.study_date,
        )
        .order_by(ImagingStudy.study_date.desc())
        .limit(5)
        .all()
    )
    actual = _grupo_desde_fila(estudio)
    return [
        ComparisonCandidateOut(
            study=ImagingStudyOut.model_validate(previo),
            avisos=comparabilidad(actual, _grupo_desde_fila(previo)),
        )
        for previo in previos
    ]
