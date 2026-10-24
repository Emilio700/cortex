"""Approved-template registry used to create immutable consent snapshots.

The legal text of each source document must be reviewed before replacing these
clinically scoped summaries in production. Versioned snapshots keep signed
records stable while approved wording evolves.
"""

from dataclasses import dataclass

from app.models.clinical_consent import ConsentType


@dataclass(frozen=True)
class ConsentTemplate:
    consent_type: ConsentType
    title: str
    summary: str
    acknowledgements: tuple[str, ...]
    allows_photos: bool = False
    requires_pregnancy_test: bool = False
    allows_transfusion_choice: bool = False


COMMON = (
    "Recibí explicación clara del procedimiento, beneficios, riesgos y alternativas.",
    "Tuve oportunidad de hacer preguntas y recibir respuestas.",
    "Comprendo que puedo rechazar o revocar antes del inicio, según corresponda.",
)


def _template(consent_type, title, summary, *specific, **options):
    return ConsentTemplate(consent_type, title, summary, COMMON + tuple(specific), **options)


TEMPLATES: dict[ConsentType, ConsentTemplate] = {
    ConsentType.CONTRACEPTIVE_METHOD: _template(
        ConsentType.CONTRACEPTIVE_METHOD,
        "Consentimiento para método anticonceptivo",
        "Colocación, retiro o cambio de DIU o implante subdérmico.",
        "Confirmé el método, la FUM y, cuando aplica, el resultado de prueba de embarazo.",
        requires_pregnancy_test=True,
    ),
    ConsentType.CONDYLOMAS_OFFICE: _template(
        ConsentType.CONDYLOMAS_OFFICE,
        "Consentimiento para retiro de condilomas en consultorio",
        "Electrocauterización y/o láser de lesiones compatibles con condilomas.",
        "Comprendo la posibilidad de recurrencia y de requerir sesiones adicionales.",
        allows_photos=True,
    ),
    ConsentType.LABIAPLASTY: _template(
        ConsentType.LABIAPLASTY,
        "Consentimiento para labioplastia o estética genital",
        "Procedimiento de estética genital femenina conforme a técnica confirmada por el paciente y médico.",
        "Comprendo las limitaciones de los resultados estéticos y funcionales.",
        allows_photos=True,
    ),
    ConsentType.BREAST_SURGERY: _template(
        ConsentType.BREAST_SURGERY,
        "Consentimiento para cirugía mamaria",
        "Cirugía de lesión mamaria o axilar con finalidad diagnóstica y/o terapéutica.",
        "Confirmé el envío de la pieza al estudio histopatológico cuando corresponde.",
        allows_transfusion_choice=True,
    ),
    ConsentType.CERVICAL_BIOPSY: _template(
        ConsentType.CERVICAL_BIOPSY,
        "Consentimiento para biopsia cervical",
        "Biopsia cervical y/o legrado endocervical para estudio diagnóstico o terapéutico.",
        "Autorizo el envío de muestras a estudio histopatológico.",
    ),
    ConsentType.CERVICAL_CONE: _template(
        ConsentType.CERVICAL_CONE,
        "Consentimiento para conización cervical o LEEP",
        "Conización cervical para diagnóstico o tratamiento de lesión del cuello uterino.",
        "Comprendo los riesgos reproductivos futuros descritos por el médico y el envío de muestra a patología.",
    ),
    ConsentType.HYSTEROSCOPY: _template(
        ConsentType.HYSTEROSCOPY,
        "Consentimiento para histeroscopia quirúrgica",
        "Histeroscopia diagnóstica o quirúrgica conforme a la indicación clínica.",
        "Comprendo que pueden requerirse maniobras adicionales por hallazgos durante el procedimiento.",
    ),
    ConsentType.BARTOLINITIS: _template(
        ConsentType.BARTOLINITIS,
        "Consentimiento para procedimiento por bartolinitis",
        "Drenaje, marsupialización u otro manejo de bartolinitis según indicación.",
        "Comprendo los riesgos de infección, recurrencia y necesidad de tratamiento adicional.",
    ),
    ConsentType.GYNECOLOGIC_SURGERY: _template(
        ConsentType.GYNECOLOGIC_SURGERY,
        "Consentimiento para cirugía ginecológica",
        "Cirugía de útero, anexos, miomas u otra indicación ginecológica.",
        "Confirmé la información sobre fertilidad, patología y posibles procedimientos adicionales.",
        allows_transfusion_choice=True,
    ),
    ConsentType.OBSTETRIC_CURETTAGE: _template(
        ConsentType.OBSTETRIC_CURETTAGE,
        "Consentimiento para legrado evacuador obstétrico",
        "Evacuación obstétrica según la indicación clínica documentada.",
        "Comprendo alternativas, riesgos y seguimiento posterior.",
    ),
    ConsentType.LABOR_INDUCTION: _template(
        ConsentType.LABOR_INDUCTION,
        "Consentimiento para inducción del parto",
        "Inducción del parto por causa médica u obstétrica confirmada.",
        "Comprendo métodos, riesgos materno-fetales, alternativas y posibilidad de cesárea.",
    ),
    ConsentType.DELIVERY: _template(
        ConsentType.DELIVERY,
        "Consentimiento para asistencia al parto",
        "Asistencia al parto y procedimientos habituales o necesarios durante su evolución.",
        "Comprendo alternativas, posibles contingencias y decisiones de seguridad materno-fetal.",
        allows_photos=True,
    ),
    ConsentType.CESAREAN: _template(
        ConsentType.CESAREAN,
        "Consentimiento para cesárea",
        "Tratamiento quirúrgico de cesárea conforme a la indicación obstétrica documentada.",
        "Comprendo riesgos materno-fetales, anestesia, contingencias y alternativas.",
        allows_photos=True,
        allows_transfusion_choice=True,
    ),
    ConsentType.ILE: _template(
        ConsentType.ILE,
        "Consentimiento para interrupción legal del embarazo",
        "Interrupción legal del embarazo conforme a elegibilidad, consejería e indicación documentadas.",
        "Confirmo haber recibido consejería, alternativas, datos de alarma y planificación familiar.",
    ),
}


def list_templates() -> list[ConsentTemplate]:
    return list(TEMPLATES.values())


def get_template(consent_type: ConsentType) -> ConsentTemplate:
    return TEMPLATES[consent_type]
