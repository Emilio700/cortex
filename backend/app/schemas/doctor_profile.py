"""Schemas for DoctorProfile"""
from typing import Literal, Optional

from pydantic import BaseModel, Field, StrictBool, field_validator

from app.schemas.specialty import SpecialtyResponse
from app.utils.colores import COLOR_ACENTO_POR_DEFECTO, es_hex_valido, normalizar_hex
from app.utils.contacto import LIMITE_CELULAR, LIMITE_CORREO, limpiar_celular, limpiar_correo
from app.utils.orden_config import (
    AJUSTES_ORDEN_POR_DEFECTO,
    LIMITE_LEYENDA_ORDEN,
    LIMITE_NOMBRE_IMPRESO,
    normalizar_ajustes_orden,
)
from app.utils.receta_config import (
    AJUSTES_RECETA_POR_DEFECTO,
    ESTILO_FIRMA_POR_DEFECTO,
    LEYENDA_POR_DEFECTO,
    LIMITE_LEYENDA,
    TAMANO_FIRMA_MAX,
    TAMANO_FIRMA_MIN,
    normalizar_estilo_firma,
)


class AjustesReceta(BaseModel):
    """Qué se imprime en la receta y qué no.

    Todos los campos son ``StrictBool`` a propósito: así un ``1`` o un
    ``"true"`` enviados por error se rechazan con un 422 en vez de acabar
    guardados en el JSON como algo que no es un booleano.
    """

    mostrar_logo: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_logo"]
    mostrar_firma: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_firma"]
    mostrar_nombre: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_nombre"]
    mostrar_especialidad: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_especialidad"]
    mostrar_cedula_profesional: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_cedula_profesional"]
    mostrar_registro_general: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_registro_general"]
    mostrar_cedula_especialidad: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_cedula_especialidad"]
    mostrar_registro_ssa: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_registro_ssa"]
    mostrar_consejo: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_consejo"]
    mostrar_edad: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_edad"]
    mostrar_fecha_nacimiento: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_fecha_nacimiento"]
    mostrar_alergias: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_alergias"]
    mostrar_signos_vitales: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_signos_vitales"]
    mostrar_direccion: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_direccion"]
    mostrar_telefono: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_telefono"]
    mostrar_correo: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_correo"]
    mostrar_celular: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_celular"]
    mostrar_pie_legal: StrictBool = AJUSTES_RECETA_POR_DEFECTO["mostrar_pie_legal"]

    model_config = {"extra": "forbid"}


class EstiloFirma(BaseModel):
    """Cómo se dibuja el nombre en el bloque de la firma.

    No vive dentro de ``AjustesReceta`` porque aquel es un diccionario de
    ``StrictBool``: un tamaño de letra o un color ahí romperían la garantía de
    que un interruptor guardado sea un interruptor.
    """

    fuente: Literal["sans", "serif", "cursiva"] = ESTILO_FIRMA_POR_DEFECTO["fuente"]
    tamano: int = Field(
        default=ESTILO_FIRMA_POR_DEFECTO["tamano"],
        ge=TAMANO_FIRMA_MIN,
        le=TAMANO_FIRMA_MAX,
    )
    negritas: StrictBool = ESTILO_FIRMA_POR_DEFECTO["negritas"]
    cursiva: StrictBool = ESTILO_FIRMA_POR_DEFECTO["cursiva"]
    # ``None`` es el gris del membrete y no un color elegido: así se veía el
    # nombre antes de que esto se pudiera configurar.
    color: Optional[str] = None
    linea_firma: StrictBool = ESTILO_FIRMA_POR_DEFECTO["linea_firma"]

    model_config = {"extra": "forbid"}

    @field_validator("color")
    @classmethod
    def _color_valido(cls, valor):
        """El PDF pinta el color tal cual: aquí no entra lo que no sea hex."""
        if valor is None:
            return None
        if not es_hex_valido(valor):
            raise ValueError("El color debe ser un hexadecimal tipo #RRGGBB")
        return str(valor).strip()


class AjustesOrden(BaseModel):
    """La configuración del papel de la orden de estudio (plan 26, D-7 y D-11).

    Membrete propio, igual de editable que la receta pero guardado aparte. Es
    estricto como ``AjustesReceta``: los interruptores son ``StrictBool``, una
    clave desconocida es 422 y el color tiene que ser hex. La cédula
    profesional no tiene interruptor: se imprime siempre (el laboratorio la
    exige).
    """

    modo_impresion: Literal["separado", "una_hoja"] = AJUSTES_ORDEN_POR_DEFECTO["modo_impresion"]
    # Contenido
    mostrar_indicacion: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_indicacion"]
    mostrar_preparacion: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_preparacion"]
    mostrar_prioridad: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_prioridad"]
    mostrar_fecha_limite: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_fecha_limite"]
    # Membrete
    mostrar_logo: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_logo"]
    # El nombre del membrete; bajo la raya de la firma el nombre sale siempre.
    mostrar_nombre: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_nombre"]
    mostrar_especialidad: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_especialidad"]
    mostrar_consultorio: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_consultorio"]
    mostrar_universidad: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_universidad"]
    mostrar_direccion: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_direccion"]
    mostrar_telefono: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_telefono"]
    mostrar_correo: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_correo"]
    mostrar_celular: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_celular"]
    mostrar_registro_general: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_registro_general"]
    mostrar_cedula_especialidad: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_cedula_especialidad"]
    mostrar_registro_ssa: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_registro_ssa"]
    mostrar_consejo: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_consejo"]
    # Paciente
    mostrar_fecha_nacimiento: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_fecha_nacimiento"]
    mostrar_edad: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_edad"]
    # Sólo la imagen de la firma; la raya para firmar a mano siempre sale.
    mostrar_firma: StrictBool = AJUSTES_ORDEN_POR_DEFECTO["mostrar_firma"]
    # ``None`` = el nombre de la usuaria con su tratamiento.
    nombre_impreso: Optional[str] = Field(default=None, max_length=LIMITE_NOMBRE_IMPRESO)
    # ``None`` = el morado de fábrica.
    color_acento: Optional[str] = None
    # ``None`` = la letra de siempre bajo la raya. Misma forma que la receta.
    estilo_firma: Optional[EstiloFirma] = None
    # ``None`` (o vacía) = la leyenda de fábrica.
    leyenda_pie: Optional[str] = Field(default=None, max_length=LIMITE_LEYENDA_ORDEN)

    model_config = {"extra": "forbid"}

    @field_validator("leyenda_pie", "nombre_impreso")
    @classmethod
    def _texto_limpio(cls, valor):
        """Un texto hecho de espacios no es un texto: manda el de fábrica."""
        if valor is None:
            return None
        limpia = " ".join("".join(" " if ord(ch) < 32 else ch for ch in valor).split()).strip()
        return limpia or None

    @field_validator("color_acento")
    @classmethod
    def _color_valido(cls, valor):
        if valor is None:
            return None
        if not es_hex_valido(valor):
            raise ValueError("El color debe ser un hexadecimal tipo #RRGGBB")
        return normalizar_hex(valor)


class DoctorProfileBase(BaseModel):
    specialty_id: int
    professional_id: str
    phone: Optional[str] = None
    clinic_address: Optional[str] = None
    university: Optional[str] = None
    logo_url: Optional[str] = None
    signature_url: Optional[str] = None
    general_registry: Optional[str] = None
    specialty_license: Optional[str] = None
    health_registry: Optional[str] = None
    council_cert: Optional[str] = None


class DoctorProfileCreate(DoctorProfileBase):
    user_id: int
    university: str


class DoctorProfileUpdate(BaseModel):
    specialty_id: Optional[int] = None
    professional_id: Optional[str] = None
    phone: Optional[str] = None
    clinic_address: Optional[str] = None
    university: Optional[str] = None
    logo_url: Optional[str] = None
    signature_url: Optional[str] = None
    general_registry: Optional[str] = None
    specialty_license: Optional[str] = None
    health_registry: Optional[str] = None
    council_cert: Optional[str] = None
    prescription_display_name: Optional[str] = Field(default=None, max_length=150)
    prescription_settings: Optional[AjustesReceta] = None
    prescription_footer_text: Optional[str] = Field(
        default=None, max_length=LIMITE_LEYENDA
    )
    prescription_accent_color: Optional[str] = None
    prescription_signature_style: Optional[EstiloFirma] = None
    order_settings: Optional[AjustesOrden] = None
    # Contacto impreso (ronda 3). Vacío o null lo borra.
    contact_email: Optional[str] = Field(default=None, max_length=LIMITE_CORREO)
    mobile_phone: Optional[str] = Field(default=None, max_length=LIMITE_CELULAR)

    @field_validator("contact_email")
    @classmethod
    def _correo_valido(cls, valor):
        return limpiar_correo(valor)

    @field_validator("mobile_phone")
    @classmethod
    def _celular_valido(cls, valor):
        return limpiar_celular(valor)

    @field_validator("prescription_accent_color")
    @classmethod
    def _acento_valido(cls, valor):
        """Un color que el PDF no sepa pintar es mejor rechazarlo al guardar."""
        if valor is None:
            return None
        if not es_hex_valido(valor):
            raise ValueError("El color debe ser un hexadecimal tipo #RRGGBB")
        return str(valor).strip()


class DoctorProfileResponse(BaseModel):
    id: int
    user_id: int
    specialty_id: int
    specialty: SpecialtyResponse
    professional_id: str
    phone: Optional[str] = None
    clinic_address: Optional[str] = None
    university: Optional[str] = None
    logo_url: Optional[str] = None
    signature_url: Optional[str] = None
    general_registry: Optional[str] = None
    specialty_license: Optional[str] = None
    health_registry: Optional[str] = None
    council_cert: Optional[str] = None
    contact_email: Optional[str] = None
    mobile_phone: Optional[str] = None
    prescription_display_name: Optional[str] = None
    # Siempre completo: el perfil que nunca tocó la configuración devuelve los
    # valores de fábrica, para que la pantalla no tenga que adivinarlos.
    prescription_settings: AjustesReceta = AjustesReceta()
    prescription_footer_text: str = LEYENDA_POR_DEFECTO
    prescription_accent_color: str = COLOR_ACENTO_POR_DEFECTO
    prescription_signature_style: EstiloFirma = EstiloFirma()
    # Siempre completo, como los de la receta: sin configurar, los de fábrica.
    order_settings: AjustesOrden = AjustesOrden()

    @field_validator("order_settings", mode="before")
    @classmethod
    def _completar_ajustes_orden(cls, valor):
        """Lo guardado sobre los valores de fábrica; lo que no se entienda se ignora."""
        return normalizar_ajustes_orden(valor)

    @field_validator("prescription_settings", mode="before")
    @classmethod
    def _completar_ajustes(cls, valor):
        """Un perfil sin configurar (NULL) o a medias vale igual.

        Lo guardado se superpone a los valores de fabrica y lo que no se
        reconozca se ignora: la pantalla siempre recibe el juego completo.
        """
        if valor is None:
            return AJUSTES_RECETA_POR_DEFECTO
        if isinstance(valor, dict):
            completo = dict(AJUSTES_RECETA_POR_DEFECTO)
            for clave, v in valor.items():
                if clave in completo and isinstance(v, bool):
                    completo[clave] = v
            return completo
        return valor

    @field_validator("prescription_footer_text", mode="before")
    @classmethod
    def _completar_leyenda(cls, valor):
        """Sin leyenda guardada manda la de fábrica, no una cadena vacía."""
        limpia = " ".join(str(valor).split()).strip() if isinstance(valor, str) else ""
        return limpia[:LIMITE_LEYENDA] if limpia else LEYENDA_POR_DEFECTO

    @field_validator("prescription_accent_color", mode="before")
    @classmethod
    def _completar_acento(cls, valor):
        """Sin color guardado manda el morado de siempre."""
        return normalizar_hex(valor) or COLOR_ACENTO_POR_DEFECTO

    @field_validator("prescription_signature_style", mode="before")
    @classmethod
    def _completar_estilo(cls, valor):
        """Un estilo a medias o con basura se completa antes de salir."""
        return normalizar_estilo_firma(valor)

    class Config:
        from_attributes = True


class PrevisualizacionRecetaRequest(BaseModel):
    """Lo que la pantalla de configuración manda para ver el PDF de muestra.

    Va suelto del perfil guardado: la idea es ver cómo quedaría **antes** de
    guardar nada.
    """

    prescription_display_name: Optional[str] = Field(default=None, max_length=150)
    prescription_settings: Optional[AjustesReceta] = None
    prescription_footer_text: Optional[str] = Field(
        default=None, max_length=LIMITE_LEYENDA
    )
    prescription_accent_color: Optional[str] = None
    prescription_signature_style: Optional[EstiloFirma] = None

    @field_validator("prescription_accent_color")
    @classmethod
    def _acento_valido(cls, valor):
        if valor is None:
            return None
        if not es_hex_valido(valor):
            raise ValueError("El color debe ser un hexadecimal tipo #RRGGBB")
        return str(valor).strip()


class PrevisualizacionOrdenRequest(BaseModel):
    """Lo que manda la pantalla para ver la orden de muestra antes de guardar."""

    order_settings: Optional[AjustesOrden] = None
    # Sin valor, el de ``order_settings`` (o el guardado).
    modo: Optional[Literal["separado", "una_hoja"]] = None

    model_config = {"extra": "forbid"}
