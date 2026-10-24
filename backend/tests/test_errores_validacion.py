"""Los errores de validación (422) tienen que salir en español y decir qué campo.

Pydantic corta la petición antes de que el router se ejecute, así que sus
textos en inglés ("Field required", "Input should be a valid integer",
"Input should be 'cash', 'card', 'transfer' or 'other'") no se arreglan
router por router. Se arreglan en el manejador de ``RequestValidationError``
de ``app/main.py``.

Las pruebas no inventan la forma de los errores: se los piden a Pydantic
validando los **schemas de verdad** de la aplicación, para que el día que
Pydantic cambie sus `type` esto se entere.
"""
from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, ValidationError

from app.core.errores_validacion import (
    etiqueta_de_campo,
    mensaje_de_error,
    resumen,
    traducir_errores,
)
from app.main import app as app_real
from app.schemas.appointment import AppointmentCreate
from app.schemas.payment import PaymentCreate


def errores_de(modelo, datos) -> list[dict]:
    """Los errores tal como los escribe Pydantic al validar un schema real."""
    with pytest.raises(ValidationError) as exc:
        modelo.model_validate(datos)
    return exc.value.errors()


def msgs(modelo, datos) -> list[str]:
    return [e["msg"] for e in traducir_errores(errores_de(modelo, datos))]


# --- Nada de inglés --------------------------------------------------------


def test_un_campo_obligatorio_que_falta_se_dice_en_espanol_y_con_su_nombre():
    """Antes: "Field required" sobre `scheduled_at`."""
    salida = msgs(AppointmentCreate, {"patient_id": 1, "doctor_id": 2})
    assert any("Fecha y hora de la cita" in m for m in salida), salida
    assert any(m.startswith("Falta llenar") for m in salida), salida
    assert all("Field required" not in m for m in salida)


def test_un_numero_mal_escrito_lo_explica_sin_hablar_de_enteros_de_python():
    """Antes: "Input should be a valid integer, unable to parse string..."."""
    salida = msgs(
        AppointmentCreate,
        {
            "patient_id": 1,
            "doctor_id": 2,
            "scheduled_at": datetime(2026, 9, 21, 10, 0),
            "duration_minutes": "media hora",
        },
    )
    assert salida == ["«Duración en minutos» debe ser un número entero, sin letras ni decimales."]


def test_la_lista_de_valores_permitidos_se_traduce():
    """Antes: "Input should be 'cash', 'card', 'transfer' or 'other'"."""
    salida = msgs(
        PaymentCreate,
        {"patient_id": 1, "amount": 500, "method": "paypal"},
    )
    assert salida == ["«Forma de pago» solo puede ser: Efectivo, Tarjeta, Transferencia u Otro."]
    assert "cash" not in salida[0]


def test_los_limites_numericos_se_dicen_con_el_numero():
    """`duration_minutes` va de 15 a 120; el mensaje tiene que decirlo."""
    base = {"patient_id": 1, "doctor_id": 2, "scheduled_at": datetime(2026, 9, 21, 10, 0)}
    corta = msgs(AppointmentCreate, {**base, "duration_minutes": 5})
    larga = msgs(AppointmentCreate, {**base, "duration_minutes": 500})
    assert corta == ["«Duración en minutos» debe ser de al menos 15."]
    assert larga == ["«Duración en minutos» debe ser como máximo 120."]


def test_una_fecha_ilegible_no_habla_de_formatos():
    salida = msgs(
        AppointmentCreate,
        {"patient_id": 1, "doctor_id": 2, "scheduled_at": "el jueves"},
    )
    assert salida == ["«Fecha y hora de la cita» no es una fecha y hora válida."]


def test_el_texto_demasiado_corto_dice_cuanto_falta():
    class Ficha(BaseModel):
        first_name: str = Field(min_length=2)

    salida = msgs(Ficha, {"first_name": "A"})
    assert salida == ["«Nombre» es demasiado corto: escribe al menos 2 caracteres."]


def test_ningun_mensaje_deja_pasar_texto_en_ingles():
    """Barrido sobre un puñado de schemas reales."""
    casos = [
        (AppointmentCreate, {}),
        (AppointmentCreate, {"patient_id": "x", "doctor_id": None, "scheduled_at": 3.5}),
        (PaymentCreate, {"method": "bitcoin"}),
    ]
    sospechosas = ("Input should", "Field required", "valid integer", "string_type", "Value error")
    for modelo, datos in casos:
        for m in msgs(modelo, datos):
            assert not any(s in m for s in sospechosas), (modelo.__name__, m)


# --- Campos dentro de listas ----------------------------------------------


def test_un_error_dentro_de_una_lista_dice_el_renglon():
    error = {"type": "missing", "loc": ("body", "medications", 2, "dose"), "msg": "Field required"}
    assert mensaje_de_error(error) == "Falta llenar «Dosis» (renglón 3)."


# --- Nada de jerga: un campo sin etiqueta no enseña su nombre técnico -------


def test_un_campo_sin_etiqueta_no_ensena_su_nombre_de_base_de_datos():
    error = {"type": "missing", "loc": ("body", "xyz_interno_id"), "msg": "Field required"}
    salida = mensaje_de_error(error)
    assert "xyz_interno_id" not in salida
    assert "Revisa el formulario" in salida


def test_la_etiqueta_mas_concreta_gana_sobre_la_del_contenedor():
    assert etiqueta_de_campo(("body", "medications", 0, "dose")) == "Dosis"
    assert etiqueta_de_campo(("body", "medications")) == "Medicamentos"
    assert etiqueta_de_campo(("body", "sin_etiqueta")) is None


def test_un_validador_propio_conserva_el_mensaje_que_escribio_el_schema():
    error = {
        "type": "value_error",
        "loc": ("body", "notes"),
        "msg": "Value error, La consulta no corresponde al paciente",
    }
    assert mensaje_de_error(error) == "La consulta no corresponde al paciente"


# --- El contrato con el frontend -------------------------------------------


def test_se_conserva_la_forma_de_pydantic_que_lee_el_frontend():
    """`errors.ts` lee `detail[0].msg`; `loc` y `type` siguen ahí para soporte."""
    traducidos = traducir_errores(errores_de(AppointmentCreate, {"patient_id": 1}))
    assert traducidos, "tiene que haber al menos un error"
    for e in traducidos:
        assert set(e) == {"loc", "msg", "type"}
        assert isinstance(e["loc"], list)
        assert isinstance(e["msg"], str) and e["msg"]
    assert traducidos[0]["type"]


def test_el_resumen_junta_todos_los_fallos_en_una_frase():
    traducidos = traducir_errores(errores_de(AppointmentCreate, {}))
    linea = resumen(traducidos)
    assert "Paciente" in linea and "Doctor" in linea and "Fecha y hora de la cita" in linea


def test_no_se_repite_el_mismo_fallo_dos_veces():
    repetido = [
        {"type": "missing", "loc": ("body", "email"), "msg": "Field required"},
        {"type": "missing", "loc": ("body", "email"), "msg": "Field required"},
    ]
    assert len(traducir_errores(repetido)) == 1


# --- De extremo a extremo, por HTTP ----------------------------------------


def _app_de_prueba() -> FastAPI:
    """Una app mínima con los manejadores de `app.main` ya registrados.

    Se reaprovechan los `exception_handlers` de la aplicación real en vez de
    copiarlos: si alguien quita el manejador de `main.py`, esta prueba cae.
    """
    mini = FastAPI(exception_handlers=dict(app_real.exception_handlers))

    class Cita(BaseModel):
        patient_id: int
        scheduled_at: datetime
        duration_minutes: int = Field(default=30, ge=15, le=120)

    @mini.post("/citas")
    def crear(_cita: Cita):  # pragma: no cover - no se llega con datos malos
        return {"ok": True}

    return mini


def test_un_422_llega_al_navegador_en_espanol_y_nombrando_el_campo():
    with TestClient(_app_de_prueba()) as cliente:
        respuesta = cliente.post("/citas", json={"duration_minutes": 5})

    assert respuesta.status_code == 422
    cuerpo = respuesta.json()

    # La forma es la que ya lee `frontend/src/shared/utils/errors.ts`.
    assert isinstance(cuerpo["detail"], list)
    textos = [e["msg"] for e in cuerpo["detail"]]

    assert "Falta llenar «Paciente»." in textos
    assert "Falta llenar «Fecha y hora de la cita»." in textos
    assert "«Duración en minutos» debe ser de al menos 15." in textos
    assert all("Field required" not in t and "Input should" not in t for t in textos)

    # Y el resumen de una línea, para las pantallas que lo pintan de un tirón.
    assert "Paciente" in cuerpo["mensaje"]


def test_el_manejador_esta_registrado_en_la_aplicacion_real():
    from fastapi.exceptions import RequestValidationError

    assert RequestValidationError in app_real.exception_handlers
