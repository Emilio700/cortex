"""Alcance de datos: el único lugar donde se decide quién ve qué expediente.

Por qué existe este módulo
--------------------------
La misma pregunta —"¿esta usuaria puede ver este expediente?"— estaba resuelta a
mano en medio centenar de puntos, cada router con su propia versión de
``if current_user.role == Role.DOCTOR``. Dos de esas versiones divergieron sin
que nadie lo notara: la nota de consulta aceptaba a la doctora que cubría a una
colega y la receta le devolvía 403 sobre la MISMA consulta, así que la sección se
le dibujaba vacía sin explicación. El costo de ese desacuerdo no es una pantalla
rota: es información clínica que aparece o desaparece según por qué endpoint se
entre.

Qué NO hace este módulo
-----------------------
No unifica las reglas. Al recorrer el código quedó claro que las variantes no son
accidentes: un episodio clínico exige ser la dueña del expediente, una receta
acepta además a recepción por alcance de clínica, y una orden de estudio exige
además haberla solicitado tú. Uniformarlas sería ampliar o recortar accesos
reales de doctoras reales. Lo que se hace aquí es **darle nombre a cada variante
y dejarla en un solo sitio**, para que la próxima divergencia tenga que
escribirse a propósito.

Qué cambió al cerrar la cobertura clínica entre doctoras
--------------------------------------------------------
Para una doctora, las tres variantes de expediente convergen hoy en la misma
respuesta: entra si es la dueña. El equipo tratante dejó de abrirle el
expediente de la paciente de otra (ver ``clinical_access``). Se conservan los
tres nombres porque para recepción y administración **siguen significando cosas
distintas**, y porque colapsarlos sería un refactor de acceso escondido dentro
de una decisión de producto.

Lo que NO cambió: la agenda. ``alcance_operativo_acotado`` y todo lo que cuelga
de él —``exigir_agenda_propia``, ``filtrar_citas_del_alcance``, el horario de la
doctora— quedaron intactos. Las doctoras se siguen viendo el calendario.

El eje que este módulo prepara (plan 20, ADR-002)
-------------------------------------------------
Hoy "tener el alcance acotado" es literalmente "ser doctora". Mañana, cuando los
perfiles operativos traigan ``scope_clinical``/``scope_operational`` en base de
datos, sólo cambian los dos predicados de abajo y todo lo demás sigue igual. Por
eso los dos dominios se declaran separados aunque hoy den exactamente el mismo
resultado: el día que una doctora con recepción tenga alcance operativo de
clínica, su alcance clínico NO debe ampliarse con ella (NOM-004, LFPDPPP).
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import false
from sqlalchemy.orm import Query, Session

from app.core.clinical_access import (
    PatientClinicalAccess,
    apply_doctor_patient_access_filter,
    assert_patient_clinical_access,
)
from app.core.tenant_scope import assert_owner, scoped_query
from app.models.patient import Patient
from app.models.payment import Payment, PaymentStatus
from app.models.user import Role, User

# Mensaje de "no existe" que comparte casi todo el expediente. Se centraliza
# porque la redacción es parte del contrato con la pantalla: le dice a la doctora
# qué hacer (actualizar la lista) en vez de dejarla mirando un error.
PACIENTE_NO_ENCONTRADA = (
    "No se encontró a la paciente. Puede que la hayan eliminado; "
    "actualiza la lista de pacientes."
)


# ---------------------------------------------------------------------------
# Predicados de alcance
# ---------------------------------------------------------------------------

def alcance_clinico_acotado(user: User) -> bool:
    """¿El acceso al expediente de esta usuaria está acotado a sus pacientes?

    Hoy la respuesta es "sí si es doctora", y por eso mismo recepción y
    administración quedan fuera del recorte: su alcance operativo es la clínica
    entera y acotarlas aquí rompería la agenda. MASTER tampoco entra: su bypass
    supervisorio se resuelve aguas abajo, en ``assert_owner``/``scoped_query``.
    """
    return user.role == Role.DOCTOR


def alcance_operativo_acotado(user: User) -> bool:
    """¿La agenda y las citas de esta usuaria están acotadas a las suyas?

    Dominio deliberadamente distinto del clínico aunque hoy coincidan: son dos
    ejes que el plan 20 separa porque se amplían por razones distintas. Ampliar
    el operativo (que una doctora cobre y agende para toda la clínica) es una
    decisión administrativa; ampliar el clínico toca datos sensibles.
    """
    return user.role == Role.DOCTOR


# ---------------------------------------------------------------------------
# Alcance clínico sobre la paciente
# ---------------------------------------------------------------------------

def resolver_paciente_de_su_duena(
    db: Session,
    patient_id: int,
    user: User,
    *,
    detalle_403: str,
    detalle_404: str = PACIENTE_NO_ENCONTRADA,
) -> Patient:
    """Variante ``own``: sólo la doctora dueña del expediente entra.

    Es la regla más estrecha y la que gobierna los módulos que nacieron ligados a
    una titular única del expediente (episodios, imágenes, prenatal, seguimiento,
    consentimientos). Era también la que marcaba la asimetría del inventario B6
    —quien cubría leía la nota y la receta pero recibía 403 aquí—; al cerrarse la
    cobertura clínica entre doctoras la asimetría desapareció por el otro lado.
    """
    patient = (
        scoped_query(db.query(Patient), Patient, user)
        .filter(Patient.id == patient_id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detalle_404)
    if alcance_clinico_acotado(user):
        assert_owner(patient.owner_doctor_id, user, detail=detalle_403)
    return patient


def resolver_paciente_con_relacion_asistencial(
    db: Session,
    patient_id: int,
    user: User,
    *,
    detalle_404: str = PACIENTE_NO_ENCONTRADA,
) -> Patient:
    """Variante ``care_team``: relación asistencial explícita; el resto, por clínica.

    Es la regla canónica del expediente vivo —nota de consulta, receta,
    certificado, documentos— y la que se homologó justo después del incidente de
    la receta. Para una doctora hoy equivale a ser la dueña; la membresía de
    equipo tratante sólo abre la puerta a cuentas de apoyo. Los roles no clínicos
    NO se acotan aquí a propósito: recepción necesita adjuntar estudios de
    cualquier paciente de la clínica sin por eso poder leer la nota, que sí los
    excluye.
    """
    if alcance_clinico_acotado(user):
        return assert_patient_clinical_access(db, patient_id, user).patient

    patient = (
        scoped_query(db.query(Patient), Patient, user)
        .filter(Patient.id == patient_id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detalle_404)
    return patient


def exigir_relacion_asistencial(
    db: Session, patient_id: int, user: User
) -> PatientClinicalAccess:
    """Variante ``care_team`` estricta: sin relación asistencial no se entra, sea quien sea.

    Se diferencia de ``resolver_paciente_con_relacion_asistencial`` en que NO deja
    pasar a recepción ni a administración por alcance de clínica: es la regla del
    expediente propiamente dicho —la nota de consulta y reabrir la consulta donde
    va— donde ver la agenda no alcanza para leer lo que la doctora escribió.
    Devuelve además qué relación abrió la puerta, que es lo que la bitácora
    necesita registrar.
    """
    return assert_patient_clinical_access(db, patient_id, user)


def filtrar_pacientes_del_alcance(query: Query, user: User) -> Query:
    """Recorta un listado de pacientes al alcance clínico de quien consulta.

    Contrapartida en lista de ``resolver_paciente_con_relacion_asistencial``: si
    una doctora no puede abrir un expediente, tampoco debe verlo aparecer en el
    buscador y enterarse de que existe.
    """
    return apply_doctor_patient_access_filter(query, user)


# ---------------------------------------------------------------------------
# Autoría clínica: quién firmó el registro, no de quién es el expediente
# ---------------------------------------------------------------------------

def exigir_autoria_clinica(
    doctor_id: Optional[int], user: User, *, detalle: str
) -> None:
    """Variante ``author``: además del expediente, exige haber firmado el registro.

    Un embarazo, una visita prenatal o una orden de estudio los lleva la doctora
    que los abrió; que otra tenga acceso al expediente no la convierte en
    responsable de ese seguimiento. Se aplica SOBRE la regla de expediente, nunca
    en su lugar.
    """
    if alcance_clinico_acotado(user):
        assert_owner(doctor_id, user, detail=detalle)


def filtrar_por_autoria_clinica(query: Query, columna_doctor, user: User) -> Query:
    """Contrapartida en lista de ``exigir_autoria_clinica``."""
    if alcance_clinico_acotado(user):
        return query.filter(columna_doctor == user.id)
    return query


# ---------------------------------------------------------------------------
# Alcance operativo: agenda y citas
# ---------------------------------------------------------------------------

def exigir_agenda_propia(
    doctor_id: Optional[int],
    user: User,
    *,
    detalle: str,
    status_code: int = status.HTTP_403_FORBIDDEN,
) -> None:
    """Una doctora sólo manda sobre su propia agenda.

    ``status_code`` existe porque las dos familias de llamadas difieren a
    propósito: escribir en la agenda ajena responde 403 (la acción es legítima,
    la agenda no es tuya) y leer una cita ajena responde 404 para no confirmar
    que esa cita existe.
    """
    if alcance_operativo_acotado(user) and doctor_id != user.id:
        raise HTTPException(status_code=status_code, detail=detalle)


def filtrar_citas_del_alcance(query: Query, columna_doctor, user: User) -> Query:
    """Contrapartida en lista de ``exigir_agenda_propia``."""
    if alcance_operativo_acotado(user):
        return query.filter(columna_doctor == user.id)
    return query


# ---------------------------------------------------------------------------
# Alcance operativo: cobros
# ---------------------------------------------------------------------------

def filtrar_pagos_del_alcance(query: Query, user: User) -> Query:
    """Recorta cualquier consulta de pagos al alcance de quien consulta (plan 23).

    Es el ÚNICO recorte de pagos: la lista, el detalle, el historial de la
    paciente, el corte de caja y el top de servicios pasan todos por aquí. Si
    cada uno filtrara por su cuenta, tarde o temprano la lista y el total de la
    misma pantalla dirían cosas distintas, y un corte que no cuadra con su propio
    desglose es peor que no tener corte.

    La doctora ve sólo los pagos cuyo ingreso es suyo (``doctor_id``), no los que
    ella recibió: si la secretaria le cobró a su paciente, ese dinero también es
    de ella. Recepción y administración ven la sucursal completa, incluidos los
    pagos históricos sin doctora asignada, para que no dejen de ver nada de lo
    que veían. MASTER no se recorta (``scoped_query``).

    No excluye anulados a propósito: el historial los muestra tachados. Los
    totales los descartan con ``solo_pagos_vigentes``.
    """
    query = scoped_query(query, Payment, user)
    if alcance_operativo_acotado(user):
        query = query.filter(Payment.doctor_id == user.id)
    return query


def solo_pagos_vigentes(query: Query) -> Query:
    """Un pago anulado se ve en el historial pero no cuenta en ningún total."""
    return query.filter(Payment.status == PaymentStatus.VIGENTE)


# ---------------------------------------------------------------------------
# Alcance del corte de caja (plan 23, ajustes del 2026-09-28)
# ---------------------------------------------------------------------------

def corte_acotado_a_asignadas(user: User) -> bool:
    """¿El corte de esta usuaria se limita a las doctoras que apoya?

    Sólo para la secretaria. La lista de pagos sigue siendo de toda la
    sucursal (cobra a cualquiera y tiene que ver lo que cobró); lo que se
    acota es el corte, que dice cuánto ingresó cada doctora. Administración y
    MASTER siguen viendo la sucursal, y la doctora ya está acotada a lo suyo
    por ``filtrar_pagos_del_alcance``.
    """
    return user.role == Role.SECRETARIA


def doctoras_asignadas(db: Session, user: User) -> list[int]:
    """Ids de las doctoras que esta secretaria apoya, en su sucursal.

    Se filtra además por la sucursal y por que siga siendo doctora: una
    asignación vieja no puede abrirle el corte de alguien que cambió de
    sucursal o de rol. NO se exige que la doctora siga activa: si se da de baja,
    su secretaria todavía tiene que poder cuadrar los cortes de días pasados.
    """
    from app.models.secretaria_doctora import SecretariaDoctora

    filas = (
        db.query(SecretariaDoctora.doctor_id)
        .join(User, User.id == SecretariaDoctora.doctor_id)
        .filter(
            SecretariaDoctora.secretaria_id == user.id,
            SecretariaDoctora.tenant_id == user.tenant_id,
            SecretariaDoctora.is_active.is_(True),
            User.tenant_id == user.tenant_id,
            User.role == Role.DOCTOR,
        )
        .order_by(SecretariaDoctora.doctor_id)
        .all()
    )
    return [f.doctor_id for f in filas]


def filtrar_corte_del_alcance(db: Session, query: Query, user: User) -> tuple[Query, Optional[list[int]]]:
    """El recorte del corte de caja, encima de ``filtrar_pagos_del_alcance``.

    Devuelve la consulta y, si la usuaria está acotada a sus doctoras, la lista
    de ellas (vacía si no tiene ninguna: entonces la consulta no trae nada, y la
    pantalla tiene que decir por qué en vez de mostrar un día sin cobros).
    """
    query = filtrar_pagos_del_alcance(query, user)
    if not corte_acotado_a_asignadas(user):
        return query, None
    ids = doctoras_asignadas(db, user)
    if not ids:
        # ``IN ()`` vacío: se pide explícitamente "ninguna fila".
        return query.filter(false()), ids
    return query.filter(Payment.doctor_id.in_(ids)), ids
