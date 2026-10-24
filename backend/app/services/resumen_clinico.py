"""Resumen clínico de un paciente (plan 32, punto 8).

Sirve para referir al paciente con otro médico o entregarlo a una
aseguradora o a ella misma (NOM-004: el expediente se integra y se entrega).

Reglas que vienen del plan y no se negocian aquí:

- **No inventa.** Lo que falta dice «Sin registro»; nunca se rellena ni se
  deduce un dato que nadie capturó.
- **El médico elige las secciones** y lo ve antes de emitirlo (vista previa
  obligatoria). Los datos del paciente, la firma, la fecha y el folio van
  siempre.
- **Hora de Mazatlán** en cada fecha y hora impresas.

Este módulo solo junta los datos; el papel lo dibuja ``app.utils.resumen_pdf``
y los permisos, la vista previa, el folio y la bitácora los decide el router.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.core.hora_local import hoy_local, utc_a_local
from app.models.appointment import Appointment, AppointmentStatus
from app.models.clinical_episode import ClinicalEpisode, ClinicalEpisodeStatus
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.prescription import Prescription
from app.services.datos_de_cita import edad_gestacional

SIN_REGISTRO = "Sin registro"

# Las secciones que el médico puede elegir, en el orden en que salen.
SECCIONES: dict[str, str] = {
    "alergias": "Alergias",
    "antecedentes": "Antecedentes",
    "diagnosticos": "Diagnósticos y episodios activos",
    "embarazo": "Embarazo",
    "consultas": "Últimas consultas",
    "estudios": "Estudios",
    "medicacion": "Última receta",
}
CONSULTAS_POR_OMISION = 3
CONSULTAS_MAXIMAS = 20
ESTUDIOS_MAXIMOS = 30

_VALORACION = {
    "excelente": "Excelente", "bien": "Bien", "regular": "Regular", "malo": "Malo", "critico": "Crítico",
}


@dataclass
class Renglon:
    etiqueta: str
    valor: str


@dataclass
class Bloque:
    """Un apartado de una sección: un episodio, una consulta, un estudio."""

    titulo: str
    renglones: list[Renglon] = field(default_factory=list)


@dataclass
class Seccion:
    clave: str
    titulo: str
    renglones: list[Renglon] = field(default_factory=list)
    bloques: list[Bloque] = field(default_factory=list)
    # Lo que se imprime cuando la sección no tiene nada: siempre se dice.
    vacio: Optional[str] = None


@dataclass
class Resumen:
    paciente: list[Renglon]
    secciones: list[Seccion]


def _texto(valor) -> str:
    if valor is None:
        return SIN_REGISTRO
    texto = str(valor).strip()
    return texto or SIN_REGISTRO


def _fecha(valor: Optional[date | datetime]) -> str:
    if valor is None:
        return SIN_REGISTRO
    if isinstance(valor, datetime):
        # Las marcas de tiempo se guardan en UTC: se imprimen en hora local.
        return utc_a_local(valor).strftime("%d/%m/%Y")
    return valor.strftime("%d/%m/%Y")


def _edad(nacimiento: Optional[date]) -> str:
    if nacimiento is None:
        return SIN_REGISTRO
    hoy = hoy_local()
    anios = hoy.year - nacimiento.year - ((hoy.month, hoy.day) < (nacimiento.month, nacimiento.day))
    return f"{anios} años"


def normalizar_secciones(pedidas: list[str]) -> list[str]:
    desconocidas = [s for s in pedidas if s not in SECCIONES]
    if desconocidas:
        raise ValueError(f"Sección desconocida: {', '.join(desconocidas)}")
    return [s for s in SECCIONES if s in pedidas]


def datos_de_paciente(patient: Patient) -> list[Renglon]:
    expediente = str(patient.id)
    if getattr(patient, "expediente_legacy", None):
        expediente += f" (sistema anterior: {patient.expediente_legacy})"
    return [
        Renglon("Nombre", _texto(f"{patient.first_name or ''} {patient.last_name or ''}")),
        Renglon("Edad", _edad(patient.date_of_birth)),
        Renglon("Fecha de nacimiento", _fecha(patient.date_of_birth)),
        Renglon("N.º de expediente", expediente),
    ]


def _alergias(patient: Patient) -> Seccion:
    return Seccion("alergias", SECCIONES["alergias"], renglones=[Renglon("Alergias", _texto(patient.allergies))])


def _antecedentes(patient: Patient) -> Seccion:
    go = [
        ("Gestas", patient.gestas), ("Partos", patient.paras),
        ("Cesáreas", patient.cesareas), ("Abortos", patient.abortos),
    ]
    formula = ", ".join(f"{nombre} {valor}" for nombre, valor in go if valor is not None) or SIN_REGISTRO
    return Seccion("antecedentes", SECCIONES["antecedentes"], renglones=[
        Renglon("Personales", _texto(patient.personal_history)),
        Renglon("Familiares", _texto(patient.family_history)),
        Renglon("Ginecológicos", _texto(patient.gynecological_history)),
        Renglon("Obstétricos", formula),
        Renglon("Menarca", f"{patient.menarca_age} años" if patient.menarca_age is not None else SIN_REGISTRO),
        Renglon("Método anticonceptivo", _texto(patient.birth_control)),
        Renglon("Grupo sanguíneo", _texto(patient.blood_type)),
    ])


def _diagnosticos(db: Session, patient: Patient) -> Seccion:
    episodios = (
        db.query(ClinicalEpisode)
        .filter(
            ClinicalEpisode.patient_id == patient.id,
            ClinicalEpisode.tenant_id == patient.tenant_id,
            ClinicalEpisode.status.in_([ClinicalEpisodeStatus.ACTIVE.value, ClinicalEpisodeStatus.MONITORING.value]),
        )
        .order_by(ClinicalEpisode.started_on.desc())
        .all()
    )
    return Seccion(
        "diagnosticos", SECCIONES["diagnosticos"],
        bloques=[
            Bloque(_texto(ep.title), [
                Renglon("Desde", _fecha(ep.started_on)),
                Renglon("Resumen", _texto(ep.summary)),
            ])
            for ep in episodios
        ],
        vacio=None if episodios else SIN_REGISTRO,
    )


def _embarazo(db: Session, patient: Patient) -> Seccion:
    embarazo = (
        db.query(Pregnancy)
        .filter(
            Pregnancy.patient_id == patient.id,
            Pregnancy.tenant_id == patient.tenant_id,
            Pregnancy.status == PregnancyStatus.ACTIVE.value,
        )
        .order_by(Pregnancy.id.desc())
        .first()
    )
    if embarazo is None:
        return Seccion("embarazo", SECCIONES["embarazo"], vacio="Sin embarazo activo registrado")
    eg = edad_gestacional(embarazo.last_menstrual_period, embarazo.estimated_delivery_date, hoy_local())
    return Seccion("embarazo", SECCIONES["embarazo"], renglones=[
        Renglon("Semanas de gestación", f"{eg[0]}.{eg[1]} SDG (al día de hoy)" if eg else SIN_REGISTRO),
        Renglon("FUR", _fecha(embarazo.last_menstrual_period)),
        Renglon("FPP", _fecha(embarazo.estimated_delivery_date)),
    ])


def _consultas(db: Session, patient: Patient, cuantas: int) -> Seccion:
    citas = (
        db.query(Appointment)
        .options(joinedload(Appointment.soap_note), joinedload(Appointment.triage))
        .filter(
            Appointment.patient_id == patient.id,
            Appointment.tenant_id == patient.tenant_id,
            Appointment.status == AppointmentStatus.ATENDIDA,
        )
        .order_by(Appointment.scheduled_at.desc())
        .limit(cuantas)
        .all()
    )
    bloques = []
    for cita in citas:
        nota, signos = cita.soap_note, cita.triage
        motivo = (signos.chief_complaint if signos else None) or cita.motivo_extra
        bloques.append(Bloque(_fecha(cita.scheduled_at), [
            Renglon("Motivo", _texto(motivo)),
            Renglon("Diagnóstico", _texto(nota.assessment if nota else None)),
            Renglon("Plan", _texto(nota.plan if nota else None)),
        ]))
    return Seccion("consultas", SECCIONES["consultas"], bloques=bloques, vacio=None if bloques else SIN_REGISTRO)


def _estudios(db: Session, patient: Patient) -> Seccion:
    filas = (
        db.query(DiagnosticResult, DiagnosticOrder)
        .join(DiagnosticOrder, DiagnosticOrder.id == DiagnosticResult.diagnostic_order_id)
        .filter(
            DiagnosticOrder.patient_id == patient.id,
            DiagnosticOrder.tenant_id == patient.tenant_id,
            DiagnosticResult.anulado_at.is_(None),
        )
        .order_by(DiagnosticResult.resulted_on.desc().nullslast(), DiagnosticResult.id.desc())
        .limit(ESTUDIOS_MAXIMOS)
        .all()
    )
    bloques = [
        Bloque(_texto(orden.study_name), [
            Renglon("Fecha del resultado", _fecha(resultado.resulted_on or resultado.created_at)),
            Renglon("Valoración", _VALORACION.get(resultado.valoracion or "", SIN_REGISTRO)),
            Renglon("Interpretación", _texto(resultado.clinician_interpretation)),
        ])
        for resultado, orden in filas
    ]
    return Seccion("estudios", SECCIONES["estudios"], bloques=bloques, vacio=None if bloques else SIN_REGISTRO)


def _medicacion(db: Session, patient: Patient) -> Seccion:
    """La última receta emitida, con su fecha y su folio.

    GEMS no registra cuándo termina un tratamiento, así que no puede afirmar
    qué medicación sigue «vigente». Se imprime la última receta tal cual y se
    dice que es eso: la última receta, no una lista verificada.
    """
    receta = (
        db.query(Prescription)
        .filter(Prescription.patient_id == patient.id, Prescription.tenant_id == patient.tenant_id)
        .order_by(Prescription.created_at.desc(), Prescription.id.desc())
        .first()
    )
    if receta is None:
        return Seccion("medicacion", SECCIONES["medicacion"], vacio=SIN_REGISTRO)
    medicamentos = []
    for m in receta.medications or []:
        if isinstance(m, dict):
            partes = [m.get("name"), m.get("dosage"), m.get("frequency"), m.get("duration")]
            medicamentos.append(" · ".join(str(p) for p in partes if p))
        elif m:
            medicamentos.append(str(m))
    return Seccion("medicacion", SECCIONES["medicacion"], renglones=[
        Renglon("Emitida", f"{_fecha(receta.created_at)} · folio {_texto(receta.folio_number)}"),
        Renglon("Medicamentos", "\n".join(medicamentos) or SIN_REGISTRO),
        Renglon("Indicaciones", _texto(receta.instructions)),
    ])


def armar_resumen(db: Session, patient: Patient, secciones: list[str], consultas: int) -> Resumen:
    constructores = {
        "alergias": lambda: _alergias(patient),
        "antecedentes": lambda: _antecedentes(patient),
        "diagnosticos": lambda: _diagnosticos(db, patient),
        "embarazo": lambda: _embarazo(db, patient),
        "consultas": lambda: _consultas(db, patient, consultas),
        "estudios": lambda: _estudios(db, patient),
        "medicacion": lambda: _medicacion(db, patient),
    }
    return Resumen(
        paciente=datos_de_paciente(patient),
        secciones=[constructores[clave]() for clave in normalizar_secciones(secciones)],
    )
