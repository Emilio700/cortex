"""Ajustes de la columna de Neuro 3D desde radiografías (Cortex).

Listar, guardar y anular. No hay editar: un ajuste mal marcado se anula con su
motivo y se vuelve a marcar, para que el rastro de lo que se midió no se pierda.

**Las mediciones las calcula el servidor** (``services/columna_rx.py``). La
pantalla las sugiere mientras se marca; lo que se guarda, y lo que Neuro 3D
dibuja, es lo que calculó este lado. Si una vista viene de una serie DICOM, el
espaciado del píxel también lo pone el servidor, leído de la serie.

Alcance: variante ``own`` (solo el médico dueño del expediente), como las
escalas. Anular exige además ser quien lo guardó.
"""
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.access_scope import exigir_autoria_clinica, resolver_paciente_de_su_duena
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.clinical_image import ClinicalImage
from app.models.columna_ajuste_rx import ColumnaAjusteRx, OrigenRx
from app.models.imaging import ImagingSeries
from app.models.patient import Patient
from app.models.user import Role, User
from app.schemas.columna_rx import (
    ColumnaAjusteRxAnular,
    ColumnaAjusteRxCreate,
    ColumnaAjusteRxResponse,
    OrigenDeVista,
)
from app.services import columna_rx as motor
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.utils.sanitize import sanitize_text

router = APIRouter(prefix="/patients", tags=["columna-rx"])

# Una radiografía simple: radiografía computarizada o digital. Una TC o una RM
# no son proyecciones y sus medidas no significan lo mismo.
MODALIDADES_RX = ("CR", "DX")

NOMBRE_DE_VISTA = {"lateral": "lateral", "ap": "AP"}


def _paciente(db: Session, patient_id: int, user: User) -> Patient:
    return resolver_paciente_de_su_duena(
        db,
        patient_id,
        user,
        detalle_403="Solo puedes ver y ajustar la columna de pacientes de tu expediente.",
    )


def _validar_origen(
    db: Session, paciente: Patient, origen: OrigenDeVista, vista: str, user: User
) -> Optional[ImagingSeries]:
    """Comprueba que la imagen sea de este paciente; devuelve la serie si es DICOM."""
    nombre = NOMBRE_DE_VISTA[vista]
    if origen.tipo == OrigenRx.IMAGEN_CLINICA:
        imagen = (
            scoped_query(db.query(ClinicalImage), ClinicalImage, user)
            .filter(ClinicalImage.id == origen.id)
            .first()
        )
        if imagen is None or imagen.patient_id != paciente.id or imagen.is_archived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La imagen de la {nombre} no es de este paciente o ya no está. Elige otra del expediente.",
            )
        return None
    serie = (
        scoped_query(db.query(ImagingSeries), ImagingSeries, user)
        .filter(ImagingSeries.id == origen.id)
        .first()
    )
    if serie is None or serie.study is None or serie.study.patient_id != paciente.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La serie de la {nombre} no es de este paciente. Elige otra del expediente.",
        )
    if (serie.modality or "").upper() not in MODALIDADES_RX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"La serie de la {nombre} es {serie.modality}, no una radiografía (CR o DX). "
                "Para una tomografía usa el modelo desde TC."
            ),
        )
    return serie


def _calibracion_del_servidor(
    calibracion: dict[str, Any], vista: str, serie: Optional[ImagingSeries]
) -> dict[str, Any]:
    """Con una serie DICOM, el espaciado del píxel lo pone el servidor, no el navegador."""
    if calibracion.get("tipo") != "dicom":
        return calibracion
    nombre = NOMBRE_DE_VISTA[vista]
    if serie is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La {nombre} es una foto: no trae espaciado de DICOM. Marca una distancia conocida o déjala sin escala.",
        )
    if not serie.pixel_spacing_x or not serie.pixel_spacing_y:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La serie de la {nombre} no trae espaciado del píxel. Marca una distancia conocida o déjala sin escala.",
        )
    # PixelSpacing del DICOM va (fila, columna): primero el espaciado vertical. La
    # ingesta guarda PixelSpacing[0] en ``pixel_spacing_x`` y [1] en ``_y``
    # (routers/imaging.py), así que aquí se cruzan: x es la columna, y la fila.
    return {"tipo": "dicom", "mmPorPxX": float(serie.pixel_spacing_y), "mmPorPxY": float(serie.pixel_spacing_x)}


@router.get("/{patient_id}/columna-rx", response_model=list[ColumnaAjusteRxResponse])
def listar_ajustes(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("spine_rx.read"))],
    incluir_anulados: bool = Query(default=True),
) -> list[ColumnaAjusteRx]:
    """Los ajustes del paciente, del más reciente al más antiguo.

    Neuro 3D pide sólo los vigentes y usa el primero.
    """
    _paciente(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.COLUMNA_RX)
    consulta = scoped_query(db.query(ColumnaAjusteRx), ColumnaAjusteRx, current_user).filter(
        ColumnaAjusteRx.patient_id == patient_id
    )
    if not incluir_anulados:
        consulta = consulta.filter(ColumnaAjusteRx.anulado_at.is_(None))
    return consulta.order_by(ColumnaAjusteRx.created_at.desc(), ColumnaAjusteRx.id.desc()).all()


@router.post(
    "/{patient_id}/columna-rx",
    response_model=ColumnaAjusteRxResponse,
    status_code=status.HTTP_201_CREATED,
)
def guardar_ajuste(
    patient_id: int,
    datos: ColumnaAjusteRxCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("spine_rx.write"))],
) -> ColumnaAjusteRx:
    paciente = _paciente(db, patient_id, current_user)
    if datos.lateral is None and datos.ap is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Elige al menos una radiografía (lateral o AP) antes de guardar.",
        )

    errores = motor.validar_marcas(datos.puntos)
    for vista in ("lateral", "ap"):
        errores += motor.validar_calibracion(datos.calibracion.get(vista), NOMBRE_DE_VISTA[vista])
    errores += motor.validar_opciones(datos.opciones)
    if errores:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=" ".join(errores))
    # Puntos en una vista sin imagen: no se sabe sobre qué se marcaron.
    for vista, origen in (("lateral", datos.lateral), ("ap", datos.ap)):
        if origen is None and datos.puntos[vista]["vertebras"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hay puntos en la {NOMBRE_DE_VISTA[vista]} sin una radiografía elegida.",
            )

    calibracion = {}
    for vista, origen in (("lateral", datos.lateral), ("ap", datos.ap)):
        serie = _validar_origen(db, paciente, origen, vista, current_user) if origen else None
        calibracion[vista] = _calibracion_del_servidor(datos.calibracion[vista], vista, serie)

    opciones = {
        "derechaDelPaciente": datos.opciones["derechaDelPaciente"],
        "cobbCoronal": datos.opciones.get("cobbCoronal"),
    }
    mediciones = motor.calcular(datos.puntos, calibracion, opciones)

    doctor_id = current_user.id if current_user.role == Role.DOCTOR else (paciente.owner_doctor_id or current_user.id)
    registro = ColumnaAjusteRx(
        tenant_id=paciente.tenant_id,
        patient_id=paciente.id,
        doctor_id=doctor_id,
        lateral_origen=datos.lateral.tipo if datos.lateral else None,
        lateral_origen_id=datos.lateral.id if datos.lateral else None,
        ap_origen=datos.ap.tipo if datos.ap else None,
        ap_origen_id=datos.ap.id if datos.ap else None,
        puntos=datos.puntos,
        calibracion=calibracion,
        opciones=opciones,
        mediciones=mediciones,
        version_calculo=motor.VERSION_CALCULO_RX,
        notas=(sanitize_text(datos.notas, 2000) or None) if datos.notas else None,
        created_by_user_id=current_user.id,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    # Sin puntos ni ángulos en la bitácora: son dato clínico y viven en su tabla.
    log_action(
        db,
        action="spine_rx.saved",
        entity_type="columna_ajuste_rx",
        entity_id=registro.id,
        actor_user_id=current_user.id,
        tenant_id=registro.tenant_id,
        patient_id=registro.patient_id,
        details={
            "lateral": registro.lateral_origen,
            "ap": registro.ap_origen,
            "version_calculo": registro.version_calculo,
        },
    )
    return registro


@router.post(
    "/{patient_id}/columna-rx/{ajuste_id}/anular",
    response_model=ColumnaAjusteRxResponse,
)
def anular_ajuste(
    patient_id: int,
    ajuste_id: int,
    datos: ColumnaAjusteRxAnular,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("spine_rx.write"))],
) -> ColumnaAjusteRx:
    """Anula sin borrar: Neuro 3D deja de usarlo y el motivo queda."""
    _paciente(db, patient_id, current_user)
    registro = (
        scoped_query(db.query(ColumnaAjusteRx), ColumnaAjusteRx, current_user)
        .filter(ColumnaAjusteRx.id == ajuste_id, ColumnaAjusteRx.patient_id == patient_id)
        .first()
    )
    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró ese ajuste de columna. Actualiza la pantalla.",
        )
    exigir_autoria_clinica(
        registro.doctor_id,
        current_user,
        detalle="Solo quien guardó el ajuste puede anularlo.",
    )
    if registro.anulado_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este ajuste ya estaba anulado.")
    motivo = sanitize_text(datos.motivo, 500)
    if len(motivo) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escribe el motivo de la anulación (al menos 5 caracteres).",
        )
    registro.anulado_at = utcnow()
    registro.anulado_por_user_id = current_user.id
    registro.anulado_motivo = motivo
    db.commit()
    db.refresh(registro)

    log_action(
        db,
        action="spine_rx.voided",
        entity_type="columna_ajuste_rx",
        entity_id=registro.id,
        actor_user_id=current_user.id,
        tenant_id=registro.tenant_id,
        patient_id=registro.patient_id,
        reason=motivo,
    )
    return registro
