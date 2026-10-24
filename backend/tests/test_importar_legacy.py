"""Conversion de los datos del sistema anterior.

Un error aqui corrompe expedientes reales, asi que se fija el comportamiento
de cada helper contra los casos que trae la base legacy: numeros guardados
como texto con 'XXX', telefonos DECIMAL con 0 por vacio y fechas '0000-00-00'.
"""
from datetime import date

from scripts.importar_legacy import (
    _antecedentes_gineco,
    _entero,
    _fecha,
    _historia_personal,
    _telefono,
    _tipo_paciente,
    _txt,
    fila_a_paciente,
)

CLINICA_GYG = {"etiqueta": "G & G", "tenant_id": 2, "desfase_id": 0}
CLINICA_SI = {"etiqueta": "San Ignacio", "tenant_id": 3, "desfase_id": 10000}

FILA_BASE = {
    "clave": 8199,
    "tipo": 1,
    "nombre": "azucena",
    "apepat": "sanchez",
    "apemat": "garcia",
    "email": "  Azucena@Gmail.COM ",
    "religion": "catolica",
    "fec_nac": date(1990, 10, 23),
    "tel_casa": 0,
    "tel_cel": 6691112233,
    "domicilio": "calle luna 123",
    "menarca": "12",
    "ritmo": "28x4",
    "iusa": "XXX",
    "cfertil": "OTB",
    "observa": "hemotipo: O +",
    "feul_reg": None,
    "fe_parto": None,
    "gestas": 2,
    "paras": 1,
    "cesar": 1,
    "aborto": 0,
}


def test_texto_se_normaliza_a_mayusculas():
    assert _txt("azucena") == "AZUCENA"
    assert _txt("  ") is None
    assert _txt(None) is None


def test_entero_ignora_los_marcadores_de_desconocido():
    assert _entero("12") == 12
    assert _entero("XXX") is None
    assert _entero("") is None
    assert _entero(None) is None


def test_telefono_descarta_los_ceros():
    assert _telefono(6691112233) == "6691112233"
    assert _telefono(0) is None
    assert _telefono("0000000000") is None
    assert _telefono(None) is None


def test_fecha_descarta_el_cero_del_legacy():
    assert _fecha(date(1990, 10, 23)) == date(1990, 10, 23)
    assert _fecha("0000-00-00") is None
    assert _fecha(None) is None


def test_tipo_de_paciente():
    assert _tipo_paciente(1) == "OBSTETRICAS"
    assert _tipo_paciente(2) == "GINECOLOGICAS"
    assert _tipo_paciente(0) is None


def test_antecedentes_gineco_conserva_el_formato_original():
    assert _antecedentes_gineco(FILA_BASE) == "G2 P1 C1 A0"
    vacia = dict(FILA_BASE, gestas=0, paras=0, cesar=0, aborto=0)
    assert _antecedentes_gineco(vacia) is None


def test_historia_personal_conserva_el_formato_original():
    assert _historia_personal(FILA_BASE) == (
        "Menarca: 12; Ritmo menstrual: 28x4; IVSA: XXX; Control fertilidad: OTB"
    )


def test_conversion_completa_de_una_paciente():
    p = fila_a_paciente(FILA_BASE, CLINICA_GYG)
    assert p["id"] == 8199
    assert p["expediente_legacy"] == 8199
    assert p["tenant_id"] == 2
    assert p["first_name"] == "AZUCENA"
    assert p["last_name"] == "SANCHEZ GARCIA"
    assert p["cell_phone"] == "6691112233"
    assert p["phone"] is None
    assert p["email"] == "azucena@gmail.com"  # el correo va en minusculas
    assert p["patient_type"] == "OBSTETRICAS"
    assert p["ivsa_age"] is None  # venia como 'XXX'
    assert p["owner_doctor_id"] == 3


def test_san_ignacio_aplica_el_desfase_de_id():
    p = fila_a_paciente(dict(FILA_BASE, clave=246), CLINICA_SI)
    assert p["id"] == 10246
    assert p["expediente_legacy"] == 246  # el expediente conserva el original
    assert p["tenant_id"] == 3


def test_apellido_unico_no_deja_espacios_sobrantes():
    p = fila_a_paciente(dict(FILA_BASE, apemat=""), CLINICA_GYG)
    assert p["last_name"] == "SANCHEZ"
