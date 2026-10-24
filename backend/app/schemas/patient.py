"""Patient Pydantic schemas"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator

# Campos de texto libre que se guardan siempre en MAYÚSCULAS, para que la
# captura manual coincida con los datos migrados del sistema anterior.
# ``email`` queda deliberadamente fuera: los correos van en minúscula.
UPPERCASE_FIELDS = (
    "first_name",
    "last_name",
    "address",
    "allergies",
    "personal_history",
    "family_history",
    "gynecological_history",
    "religion",
    "blood_type",
    "menstrual_rhythm",
    "birth_control",
)

# Lo clínico de la ficha (opción C, decisión de Emilio, plan 32): antecedentes
# personales, familiares y ginecológicos, datos obstétricos (FPP y G/P/C/A) y
# las notas de referencia, que son el recordatorio personal de la doctora
# (de dónde viene la paciente, quién la recomendó). Recepción no los ve ni los
# captura; nombre, contacto, fecha de nacimiento, alergias y FUR sí.
CAMPOS_CLINICOS_DE_FICHA = (
    "personal_history",
    "family_history",
    "gynecological_history",
    "patient_type",
    "menarca_age",
    "menstrual_rhythm",
    "ivsa_age",
    "birth_control",
    "expected_delivery_date",
    "notas_referencia",
    "gestas",
    "paras",
    "cesareas",
    "abortos",
)

# Regla de Naegele: fecha probable de parto = FUR + 280 días.
# Vive aquí por historia; quien la aplica es el registro de embarazo
# (``app.schemas.pregnancy``), no el expediente.
NAEGELE_DAYS = 280


def _a_mayusculas(valor):
    """Normaliza un texto a MAYÚSCULAS; deja intacto lo que no sea texto."""
    if isinstance(valor, str):
        limpio = valor.strip()
        return limpio.upper() if limpio else None
    return valor


DATE_FIELDS = (
    "date_of_birth",
    "last_menstrual_period",
    "expected_delivery_date",
)


class _PatientTextMixin(BaseModel):
    """Normalización del texto capturado a mano.

    Aquí no se deduce ni se borra nada a partir de ``patient_type``: toda
    paciente es ginecológica y sólo *está* embarazada de vez en cuando, así que
    el embarazo (FUR, FPP y su método de fechado) vive en ``pregnancies``, no en
    una bandera del expediente que alguien tiene que acordarse de apagar.
    """

    @field_validator(*UPPERCASE_FIELDS, mode="before", check_fields=False)
    @classmethod
    def _normalizar_mayusculas(cls, valor):
        return _a_mayusculas(valor)

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _correo_vacio_es_nulo(cls, valor):
        """El formulario manda cadena vacia cuando no se captura el correo;
        sin esto EmailStr responde 422 y el alta express falla."""
        if isinstance(valor, str) and not valor.strip():
            return None
        return valor

    @field_validator(*DATE_FIELDS, mode="before", check_fields=False)
    @classmethod
    def _fecha_vacia_es_nula(cls, valor):
        """Un campo de fecha sin capturar llega como cadena vacía desde el
        formulario; sin esto Pydantic responde 422 y el alta express falla."""
        if isinstance(valor, str) and not valor.strip():
            return None
        return valor


class PatientBase(BaseModel):
    """Base patient schema"""

    first_name: str
    last_name: str
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    cell_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    allergies: Optional[str] = None
    personal_history: Optional[str] = None
    family_history: Optional[str] = None
    gynecological_history: Optional[str] = None
    # Structured clinical fields
    blood_type: Optional[str] = None
    religion: Optional[str] = None
    patient_type: Optional[str] = None
    menarca_age: Optional[int] = None
    menstrual_rhythm: Optional[str] = None
    ivsa_age: Optional[int] = None
    birth_control: Optional[str] = None
    last_menstrual_period: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    notas_referencia: Optional[str] = None
    gestas: Optional[int] = None
    paras: Optional[int] = None
    cesareas: Optional[int] = None
    abortos: Optional[int] = None


class PatientCreate(_PatientTextMixin, PatientBase):
    """Patient creation schema"""

    owner_doctor_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def _celular_obligatorio(cls, datos):
        """El celular es el único contacto exigido en el alta express."""
        if isinstance(datos, dict):
            celular = datos.get("cell_phone")
            if celular is None or not str(celular).strip():
                raise ValueError("El celular es obligatorio para registrar a la paciente.")
            datos = {**datos, "cell_phone": str(celular).strip()}
        return datos


class PatientUpdate(_PatientTextMixin):
    """Patient update schema - all fields optional.

    El celular sigue siendo opcional aquí: hay pacientes migradas sin teléfono
    y editar su expediente no debe obligar a inventar un número.
    """

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    cell_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    allergies: Optional[str] = None
    personal_history: Optional[str] = None
    family_history: Optional[str] = None
    gynecological_history: Optional[str] = None
    blood_type: Optional[str] = None
    owner_doctor_id: Optional[int] = None
    religion: Optional[str] = None
    patient_type: Optional[str] = None
    menarca_age: Optional[int] = None
    menstrual_rhythm: Optional[str] = None
    ivsa_age: Optional[int] = None
    birth_control: Optional[str] = None
    last_menstrual_period: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    notas_referencia: Optional[str] = None
    gestas: Optional[int] = None
    paras: Optional[int] = None
    cesareas: Optional[int] = None
    abortos: Optional[int] = None


class PatientResponse(PatientBase):
    """Patient response schema.

    No hereda la normalización: lo que ya está guardado se devuelve tal cual.
    """

    id: int
    tenant_id: int
    owner_doctor_id: Optional[int] = None
    expediente_legacy: Optional[int] = None
    # Al DEVOLVER se usa str y no EmailStr a proposito: los datos migrados
    # traen telefonos y direcciones en este campo, y validar la respuesta hacia
    # que una sola fila corrupta tumbara la lista entera con un 500.
    # La validacion sigue en PatientBase, o sea al crear y actualizar.
    email: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # False cuando quien pide no tiene permiso clínico: los campos de
    # ``CAMPOS_CLINICOS_DE_FICHA`` llegan vacíos porque no se le mandan, no
    # porque estén vacíos. La pantalla no debe decir «sin antecedentes».
    antecedentes_visibles: bool = True

    class Config:
        from_attributes = True


class PatientOwnerUpdate(BaseModel):
    """Schema for reassigning a patient's owner doctor"""

    owner_doctor_id: int


class PosiblesDuplicadosConsulta(BaseModel):
    """Lo que se lleva capturado de una paciente nueva, para advertir si ya existe (B-06 / S-06).

    Todo es opcional: la pantalla pregunta con lo que tenga. No se valida el
    formato del teléfono aquí (eso lo contesta la respuesta) para no fallar la
    advertencia por un número a medio escribir.
    """

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    cell_phone: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[date] = None
    # Al editar una paciente, ella misma no es su propio duplicado.
    exclude_patient_id: Optional[int] = None


class TelefonoRevisado(BaseModel):
    campo: str  # "phone" o "cell_phone"
    normalizado: Optional[str] = None
    valido: bool


class PosibleDuplicado(BaseModel):
    """Lo mínimo para que recepción reconozca a la paciente, sin abrir su expediente."""

    patient_id: int
    full_name: str
    date_of_birth: Optional[date] = None
    telefono_enmascarado: Optional[str] = None
    # "telefono", "email", "nombre", "fecha_de_nacimiento"
    motivos: list[str]
    # "alta": mismo teléfono, mismo correo, o mismo nombre y fecha de
    # nacimiento. "media": mismo nombre, o mismo apellido y fecha de nacimiento.
    coincidencia: str


class PosiblesDuplicadosRespuesta(BaseModel):
    telefonos: list[TelefonoRevisado]
    candidatos: list[PosibleDuplicado]
