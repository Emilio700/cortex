"""Patients router - CRUD with search"""
import re
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, get_user_permissions, require_permission
from app.core.access_scope import (
    alcance_clinico_acotado,
    filtrar_pacientes_del_alcance,
)
from app.core.tenant_scope import scoped_query
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import Role, User
from app.schemas.patient import (
    CAMPOS_CLINICOS_DE_FICHA,
    PatientCreate,
    PatientOwnerUpdate,
    PatientResponse,
    PatientUpdate,
    PosibleDuplicado,
    PosiblesDuplicadosConsulta,
    PosiblesDuplicadosRespuesta,
    TelefonoRevisado,
)
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.utils.telefono import enmascarar_telefono, normalizar_telefono_mx

router = APIRouter(prefix="/patients", tags=["Patients"])


def ve_antecedentes(db: Session, user: User) -> bool:
    """¿Puede ver y capturar lo clínico de la ficha? (opción C, plan 32).

    Es el permiso del expediente clínico: el médico y administración lo
    traen; recepción no. MASTER lo tiene todo.
    """
    return user.role == Role.MASTER or "medical_history.read" in get_user_permissions(user, db)


def ficha_para(db: Session, user: User, paciente: Patient, ve: bool | None = None) -> PatientResponse:
    """La ficha tal como la puede ver ``user``: sin lo clínico si no le toca."""
    respuesta = PatientResponse.model_validate(paciente)
    if ve is None:
        ve = ve_antecedentes(db, user)
    if ve:
        return respuesta
    vacios = {campo: None for campo in CAMPOS_CLINICOS_DE_FICHA}
    return respuesta.model_copy(update={**vacios, "antecedentes_visibles": False})


def _sin_lo_clinico(datos: dict, db: Session, user: User) -> dict:
    """Lo que recepción manda de lo clínico se ignora: ni lo borra ni lo pisa.

    Su formulario ya no lo muestra, pero un cliente viejo o un error podría
    mandarlo vacío y borrar los antecedentes que capturó el médico.
    """
    if ve_antecedentes(db, user):
        return datos
    return {k: v for k, v in datos.items() if k not in CAMPOS_CLINICOS_DE_FICHA}


def _owned_by_doctor(query, current_user: User):
    """Recorta el listado al alcance clínico de quien consulta.

    Se mantiene el alias local para no tocar los cinco puntos que ya lo usan; la
    decisión en sí vive en ``access_scope``.
    """
    return filtrar_pacientes_del_alcance(query, current_user)


def _doctor_in_current_tenant(db: Session, doctor_id: int, current_user: User) -> User:
    """Return an active doctor from the caller's clinic, or reject the assignment."""
    doctor = (
        scoped_query(db.query(User), User, current_user)
        .filter(User.id == doctor_id, User.role == Role.DOCTOR, User.is_active.is_(True))
        .first()
    )
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El médico responsable debe ser un doctor activo de la misma clínica",
        )
    return doctor


@router.get("", response_model=list[PatientResponse])
def list_patients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.read"))],
    search: str | None = Query(None, description="Search by name, phone, or email"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    incompletas: bool = Query(
        False,
        description="Solo fichas incompletas (sin fecha de nacimiento), plan 32 punto 5",
    ),
):
    """
    List patients with optional search

    Search looks for matches in:
    - First name
    - Last name
    - Phone
    - Email

    Returns active patients only
    """
    query = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.is_active.is_(True))
    query = _owned_by_doctor(query, current_user)

    # Fichas incompletas (plan 32, punto 5): el alta expres deja al paciente
    # sin fecha de nacimiento, y de ella dependen la edad, las semanas de
    # embarazo y los PDF. Es solo un filtro: no cambia el orden ni la
    # paginacion de la lista.
    if incompletas:
        query = query.filter(Patient.date_of_birth.is_(None))

    # Apply search filter with tokenized word matching (Elasticsearch-like)
    if search:
        # Split into words and search each word across ALL columns
        words = [w.strip() for w in search.split() if w.strip()]

        if words:
            # Build: (col1 ILIKE '%word1%' OR col2 ILIKE '%word1%' OR ...) AND (col1 ILIKE '%word2%' OR ...)
            for word in words:
                word_pattern = f"%{word}%"
                condiciones = [
                    Patient.first_name.ilike(word_pattern),
                    Patient.last_name.ilike(word_pattern),
                    Patient.phone.ilike(word_pattern),
                    Patient.cell_phone.ilike(word_pattern),
                    Patient.email.ilike(word_pattern),
                ]
                # El doctor sigue buscando por el numero de expediente del
                # sistema anterior, asi que tambien se busca por ahi.
                if word.isdigit():
                    condiciones.append(Patient.expediente_legacy == int(word))
                query = query.filter(or_(*condiciones))

            # Relevance order: starts-with priority on first word
            first_word = words[0]
            starts_pattern = f"{first_word}%"
            # Un numero exacto de expediente manda sobre cualquier coincidencia
            # parcial: es como el doctor identifica a sus pacientes.
            expediente_buscado = int(first_word) if first_word.isdigit() else None
            query = query.order_by(
                case(
                    (Patient.expediente_legacy == expediente_buscado, 0)
                    if expediente_buscado is not None
                    else (Patient.first_name.ilike(starts_pattern), 1),
                    (Patient.first_name.ilike(starts_pattern), 1),
                    (Patient.last_name.ilike(starts_pattern), 2),
                    else_=3,
                ),
                Patient.last_name,
                Patient.first_name,
            )
    else:
        # Without search, just order alphabetically
        query = query.order_by(Patient.last_name, Patient.first_name)
        # Without search, just order alphabetically
        query = query.order_by(Patient.last_name, Patient.first_name)

    patients = query.offset(skip).limit(limit).all()

    ve = ve_antecedentes(db, current_user)
    return [ficha_para(db, current_user, p, ve) for p in patients]


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    patient_data: PatientCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.create"))],
):
    """
    Create new patient

    Validates email uniqueness if provided
    """
    # Check email uniqueness if provided
    if patient_data.email:
        existing = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.email == patient_data.email).first()

        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ese correo ya está registrado en el expediente de otro paciente.")

    # Create patient
    owner_id = patient_data.owner_doctor_id
    if alcance_clinico_acotado(current_user):
        # Un médico acotada sólo puede dar de alta expedientes dentro de su
        # propio alcance: si pudiera nombrar titular a otra, crearía un
        # expediente que ella misma no podría volver a abrir.
        owner_id = current_user.id
    elif owner_id is not None:
        _doctor_in_current_tenant(db, owner_id, current_user)

    new_patient = Patient(
        tenant_id=current_user.tenant_id,
        owner_doctor_id=owner_id,
        **patient_data.model_dump(exclude={"owner_doctor_id"}),
    )
    # Recepción no captura lo clínico (opción C, plan 32): si su alta lo trae,
    # no se guarda. Es un paciente nuevo, así que no hay nada que pisar.
    if not ve_antecedentes(db, current_user):
        for campo in CAMPOS_CLINICOS_DE_FICHA:
            setattr(new_patient, campo, None)

    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    log_action(
        db,
        action="patient.created",
        entity_type="patient",
        entity_id=new_patient.id,
        actor_user_id=current_user.id,
        tenant_id=new_patient.tenant_id,
        patient_id=new_patient.id,
        details={"owner_doctor_id": new_patient.owner_doctor_id},
    )

    return ficha_para(db, current_user, new_patient)


def _sin_acentos(texto: str | None) -> str:
    """Minúsculas y sin acentos, para que «MARÍA LÓPEZ» y «Maria Lopez» sean la misma."""
    descompuesto = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn").casefold()


# «de», «la», «del»... no distinguen a nadie: «DE LA CRUZ» se compara por «cruz».
_PARTICULAS = {"de", "del", "la", "las", "los", "y", "da", "di", "van", "von"}


def _palabras(texto: str | None) -> list[str]:
    return [p for p in re.split(r"[^\w]+", _sin_acentos(texto)) if len(p) >= 2 and p not in _PARTICULAS]


def _solo_digitos_sql(columna):
    """El teléfono guardado sin espacios, guiones, paréntesis, puntos ni «+», en SQL.

    ``replace`` existe igual en PostgreSQL y en SQLite; con eso «669 111 22 33» y
    «(669)111-2233» se comparan como «6691112233».
    """
    expresion = columna
    for caracter in (" ", "-", "(", ")", ".", "+", "/"):
        expresion = func.replace(expresion, caracter, "")
    return expresion


def _patron_tolerante(palabra: str) -> str:
    """Patrón LIKE que no depende de acentos: cada vocal y la «n» valen por cualquier letra.

    Sin la extensión ``unaccent`` no hay forma portátil de que «Lopez» encuentre
    «LÓPEZ» en SQL. El patrón es a propósito más amplio de la cuenta; la
    comparación exacta (sin acentos, por palabra) se hace después en Python.
    """
    return "%" + "".join("_" if c in "aeioun" else c for c in palabra) + "%"


# Cuántos candidatos se devuelven como mucho: es una advertencia para
# reconocer a alguien, no un buscador.
MAX_POSIBLES_DUPLICADOS = 10


@router.post("/possible-duplicates", response_model=PosiblesDuplicadosRespuesta)
def possible_duplicates(
    consulta: PosiblesDuplicadosConsulta,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.read"))],
):
    """¿El paciente que se está capturando ya tiene expediente? (B-06 / S-06).

    Decisión de Emilio (3.5): **sólo advertir**. No bloquea el alta, no hay
    índice único nuevo y no se fusiona nada; la pantalla enseña los candidatos
    con «Es otra persona» y deja continuar. Es POST y no GET para que el
    nombre, el teléfono y la fecha de nacimiento no queden en las bitácoras de
    acceso del servidor.

    Compara con los pacientes activas del alcance de quien pregunta (la
    sucursal; el médico, las suyas), por teléfono o celular normalizado a 10
    dígitos, por correo, por nombre y apellido sin acentos y por apellido con
    fecha de nacimiento. Devuelve lo mínimo para reconocerla: nombre, fecha de
    nacimiento y los últimos cuatro dígitos del teléfono.
    """
    base = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.is_active.is_(True))
    base = _owned_by_doctor(base, current_user)
    if consulta.exclude_patient_id:
        base = base.filter(Patient.id != consulta.exclude_patient_id)

    telefonos = []
    buscados = set()
    for campo in ("phone", "cell_phone"):
        capturado = getattr(consulta, campo)
        if capturado and capturado.strip():
            normalizado = normalizar_telefono_mx(capturado)
            telefonos.append(TelefonoRevisado(campo=campo, normalizado=normalizado, valido=normalizado is not None))
            if normalizado:
                buscados.add(normalizado)

    motivos: dict[int, set[str]] = {}
    pacientes: dict[int, Patient] = {}

    def anotar(paciente: Patient, motivo: str) -> None:
        pacientes[paciente.id] = paciente
        motivos.setdefault(paciente.id, set()).add(motivo)

    # Teléfono: en la base el número está escrito de mil formas, así que se
    # compara sin separadores y por los últimos 10 dígitos (cubre +52, 1, 044),
    # y luego se confirma ya normalizado. Esto recorre los pacientes de la
    # sucursal: el índice de trigramas de B-05 no sirve para una expresión, y
    # con los volúmenes de producción son milisegundos (medido, ver bitácora).
    if buscados:
        condiciones = []
        for numero in buscados:
            condiciones += [
                _solo_digitos_sql(Patient.phone).like(f"%{numero}"),
                _solo_digitos_sql(Patient.cell_phone).like(f"%{numero}"),
            ]
        for paciente in base.filter(or_(*condiciones)).limit(50).all():
            if {normalizar_telefono_mx(paciente.phone), normalizar_telefono_mx(paciente.cell_phone)} & buscados:
                anotar(paciente, "telefono")

    correo = (consulta.email or "").strip()
    if "@" in correo:
        escapado = correo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        for paciente in base.filter(Patient.email.ilike(escapado, escape="\\")).limit(50).all():
            anotar(paciente, "email")

    nombres, apellidos = _palabras(consulta.first_name), _palabras(consulta.last_name)
    if apellidos and (nombres or consulta.date_of_birth):
        # Primer apellido y, además, primer nombre o fecha de nacimiento: sólo
        # el apellido traería media sucursal.
        segunda = []
        if nombres:
            segunda.append(Patient.first_name.ilike(_patron_tolerante(nombres[0])))
        if consulta.date_of_birth:
            segunda.append(Patient.date_of_birth == consulta.date_of_birth)
        filtro = base.filter(Patient.last_name.ilike(_patron_tolerante(apellidos[0])), or_(*segunda))
        for paciente in filtro.limit(500).all():
            if apellidos[0] not in _palabras(paciente.last_name):
                continue
            mismo_nombre = bool(nombres) and nombres[0] in _palabras(paciente.first_name)
            misma_fecha = consulta.date_of_birth is not None and paciente.date_of_birth == consulta.date_of_birth
            if mismo_nombre:
                anotar(paciente, "nombre")
            if misma_fecha:
                anotar(paciente, "fecha_de_nacimiento")

    candidatos = []
    for patient_id, encontrados in motivos.items():
        paciente = pacientes[patient_id]
        alta = bool({"telefono", "email"} & encontrados) or {"nombre", "fecha_de_nacimiento"} <= encontrados
        candidatos.append(PosibleDuplicado(
            patient_id=paciente.id,
            full_name=f"{paciente.first_name} {paciente.last_name}".strip(),
            date_of_birth=paciente.date_of_birth,
            telefono_enmascarado=enmascarar_telefono(paciente.cell_phone or paciente.phone),
            motivos=[m for m in ("telefono", "email", "nombre", "fecha_de_nacimiento") if m in encontrados],
            coincidencia="alta" if alta else "media",
        ))
    candidatos.sort(key=lambda c: (c.coincidencia != "alta", -len(c.motivos), c.full_name))
    return PosiblesDuplicadosRespuesta(telefonos=telefonos, candidatos=candidatos[:MAX_POSIBLES_DUPLICADOS])


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.read"))],
):
    """Get patient by ID"""
    patient = _owned_by_doctor(
        scoped_query(db.query(Patient), Patient, current_user), current_user
    ).filter(Patient.id == patient_id).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el paciente.")

    return ficha_para(db, current_user, patient)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: int,
    patient_data: PatientUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.update"))],
):
    """Update patient"""
    patient = _owned_by_doctor(
        scoped_query(db.query(Patient), Patient, current_user), current_user
    ).filter(Patient.id == patient_id).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el paciente.")

    # Check email uniqueness if changing email
    update_data = _sin_lo_clinico(patient_data.model_dump(exclude_unset=True), db, current_user)

    if "owner_doctor_id" in update_data:
        requested_owner = update_data["owner_doctor_id"]
        # Mismo eje que el alta: el expediente no puede salir del alcance de
        # quien lo edita. Reasignar de verdad es el endpoint dedicado, con su
        # permiso propio (B10).
        if alcance_clinico_acotado(current_user) and requested_owner != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Un doctor no puede reasignar el expediente de un paciente",
            )
        if requested_owner is not None and not alcance_clinico_acotado(current_user):
            _doctor_in_current_tenant(db, requested_owner, current_user)

    if "email" in update_data and update_data["email"] != patient.email:
        existing = (
            scoped_query(db.query(Patient), Patient, current_user)
            .filter(Patient.email == update_data["email"], Patient.id != patient_id)
            .first()
        )

        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ese correo ya está registrado en el expediente de otro paciente.")

    # Update fields
    for field, value in update_data.items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)
    # Nombres de campo, no valores: basta para reconstruir quién cambió qué
    # dato del expediente sin copiar teléfonos o alergias a la bitácora.
    log_action(
        db,
        action="patient.updated",
        entity_type="patient",
        entity_id=patient.id,
        actor_user_id=current_user.id,
        tenant_id=patient.tenant_id,
        patient_id=patient.id,
        details={"changed_fields": sorted(update_data.keys())},
    )

    return ficha_para(db, current_user, patient)


@router.patch("/{patient_id}/deactivate", response_model=PatientResponse)
def deactivate_patient(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.delete"))],
):
    """Deactivate patient (soft delete)"""
    patient = _owned_by_doctor(
        scoped_query(db.query(Patient), Patient, current_user), current_user
    ).filter(Patient.id == patient_id).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el paciente.")

    patient.is_active = False
    db.commit()
    db.refresh(patient)
    # Desactivar saca al paciente de la búsqueda del mostrador; sin este
    # registro, un expediente «desaparecido» no tendría a quién preguntarle.
    log_action(
        db,
        action="patient.deactivated",
        entity_type="patient",
        entity_id=patient.id,
        actor_user_id=current_user.id,
        tenant_id=patient.tenant_id,
        patient_id=patient.id,
    )

    return ficha_para(db, current_user, patient)


@router.get("/{patient_id}/history")
def get_patient_history(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.read"))],
):
    """Historial de citas del paciente; lo clínico, solo a quien puede leerlo.

    Plan 32, punto 7 (C1): esta ruta pide ``patients.read`` y recepción lo
    tiene, así que devolvía la nota SOAP, el triage y las recetas de cada cita
    aunque ella no tiene ``soap_notes.read`` ni ``prescriptions.read``. Ahora
    cada sección se decide por su permiso y en el servidor: quien no lo tiene
    recibe ``null``/``[]`` y ``contenido_clinico=False``, para que la pantalla
    no diga «sin datos clínicos» cuando sí los hay.
    """
    permisos = get_user_permissions(current_user, db)
    ve_soap = "soap_notes.read" in permisos
    ve_recetas = "prescriptions.read" in permisos
    # El triage lleva motivo y hallazgos de la consulta: viaja con la nota
    # clínica, no con la ficha, aunque recepción sí pueda capturar signos.
    ve_triage = ve_soap and "triage.read" in permisos
    # Verify patient exists and is in scope
    patient = _owned_by_doctor(
        scoped_query(db.query(Patient), Patient, current_user), current_user
    ).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="No se encontró el paciente.")

    # Appointments with triage, SOAP, prescriptions.
    # Use scoped_query so the appointment filter matches the patient scope:
    # regular users stay within their own tenant, while MASTER (which bypasses
    # tenant scoping) can see the appointments of a patient in any tenant.
    appointments = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.patient_id == patient_id)
        .options(
            *([joinedload(Appointment.triage)] if ve_triage else []),
            *([joinedload(Appointment.soap_note)] if ve_soap else []),
            *([joinedload(Appointment.prescriptions)] if ve_recetas else []),
        )
        .order_by(Appointment.scheduled_at.desc())
        .limit(200)
        .all()
    )

    history = []
    for apt in appointments:
        triage_dict = None
        if ve_triage and apt.triage:
            triage_dict = {
                "weight_kg": apt.triage.weight_kg,
                "height_cm": apt.triage.height_cm,
                "blood_pressure_systolic": apt.triage.blood_pressure_systolic,
                "blood_pressure_diastolic": apt.triage.blood_pressure_diastolic,
                "temperature_celsius": apt.triage.temperature_celsius,
                "chief_complaint": apt.triage.chief_complaint,
                "observations": apt.triage.observations,
            }

        soap_dict = None
        if ve_soap and apt.soap_note:
            soap_dict = {
                "subjective": apt.soap_note.subjective,
                "objective": apt.soap_note.objective,
                "assessment": apt.soap_note.assessment,
                "plan": apt.soap_note.plan,
            }

        prescriptions_list = [
            {
                "id": p.id,
                "folio": p.folio_number,
                "medications": p.medications,
                "instructions": p.instructions,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in ((apt.prescriptions or []) if ve_recetas else [])
        ]

        history.append({
            "appointment_id": apt.id,
            "scheduled_at": apt.scheduled_at.isoformat() if apt.scheduled_at else None,
            "status": apt.status.value if hasattr(apt.status, 'value') else str(apt.status),
            "notes": apt.notes,
            "duration_minutes": apt.duration_minutes,
            # "express": consulta que no se agendó y se registró al cobrarla; el
            # historial la marca para que no parezca una consulta agendada.
            "origen": getattr(apt.origen, "value", apt.origen) or "agenda",
            "triage": triage_dict,
            "soap_note": soap_dict,
            "prescriptions": prescriptions_list,
        })

    if ve_soap or ve_recetas or ve_triage:
        registrar_acceso(db, current_user, patient_id, SeccionClinica.CONSULTAS)
    return {
        "patient_id": patient_id,
        "patient_name": f"{patient.first_name} {patient.last_name}",
        "contenido_clinico": ve_soap or ve_recetas or ve_triage,
        "history": history,
    }


@router.patch("/{patient_id}/owner", response_model=PatientResponse)
def reassign_patient_owner(
    patient_id: int,
    owner_data: PatientOwnerUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patients.reassign_owner"))],
):
    """Reasigna el paciente a otro médico.

    Antes esto se decidia por rol dentro del cuerpo, asi que la pantalla de Master
    no podia abrirlo ni cerrarlo para nadie. Ahora lo gobierna un permiso propio,
    que por defecto tienen secretaria y administracion —los mismos de antes— y la
    doctora no, para que ``patients.update`` no le sirva para quedarse con el
    expediente de un paciente ajena.
    """
    patient = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="No se encontró el paciente.")

    # Validate that the target user is a doctor
    _doctor_in_current_tenant(db, owner_data.owner_doctor_id, current_user)

    patient.owner_doctor_id = owner_data.owner_doctor_id
    db.commit()
    db.refresh(patient)
    return ficha_para(db, current_user, patient)
