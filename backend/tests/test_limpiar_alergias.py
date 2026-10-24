"""Reparto del campo de alergias.

El campo se imprime en las recetas, asi que un falso positivo borra
informacion de seguridad clinica: los casos de abajo son textos reales de
produccion y fijan que solo se mueva lo que se reconoce con certeza.
"""
from scripts.limpiar_alergias import clasificar, normaliza_hemotipo


def test_hemotipo_en_sus_muchas_variantes():
    assert normaliza_hemotipo("hemotipo: O +") == (True, "O+")
    assert normaliza_hemotipo("HEMOTIPO: A +") == (True, "A+")
    assert normaliza_hemotipo('hemotipo:"A" POSITIVO') == (True, "A+")
    assert normaliza_hemotipo("hemotipo: B neg") == (True, "B-")
    assert normaliza_hemotipo("HEMOTIPO: AB positivo") == (True, "AB+")
    assert normaliza_hemotipo("hemotipo: 0 +") == (True, "O+")  # cero por la O
    assert normaliza_hemotipo("Hmotipo: A +") == (True, "A+")  # erratas reales


def test_hemotipo_sin_dato_se_reconoce_pero_no_inventa():
    """'hemotipo:' a secas debe salir de alergias sin guardar nada."""
    assert normaliza_hemotipo("hemotipo:") == (True, None)
    assert normaliza_hemotipo("hemotipo:??") == (True, None)


def test_no_confunde_una_alergia_con_un_hemotipo():
    assert normaliza_hemotipo("AMPICILINA") == (False, None)
    assert normaliza_hemotipo("PENICILINA") == (False, None)


def test_una_alergia_de_verdad_se_queda_donde_esta():
    sangre, extras, resto = clasificar("AMPICILINA")
    assert sangre is None
    assert extras == []
    assert resto == ["AMPICILINA"]


def test_antecedente_clinico_se_queda_donde_esta():
    sangre, extras, resto = clasificar("HTA")
    assert resto == ["HTA"]


def test_reparte_un_campo_multilinea():
    sangre, extras, resto = clasificar("hemotipo: O +\r\nHOGAR")
    assert sangre == "O+"
    assert extras == ["Ocupacion: HOGAR"]
    assert resto == []


def test_conserva_la_nota_clinica_y_mueve_el_resto():
    sangre, extras, resto = clasificar("embarazo gemelar\r\nhemotipo: o +\r\nempleada")
    assert sangre == "O+"
    assert extras == ["Ocupacion: EMPLEADA"]
    assert resto == ["embarazo gemelar"]  # lo clinico nunca se pierde


def test_fecha_de_ultima_regla():
    sangre, extras, resto = clasificar("FUR: 28 OCT. 15")
    assert extras == ["FUR: 28 OCT. 15"]
    assert resto == []


def test_campo_vacio():
    assert clasificar("") == (None, [], [])
    assert clasificar(None) == (None, [], [])


# --- Separacion de las notas de referencia del doctor ---

from scripts.mover_referencias import clasificar as clasificar_referencia
from scripts.mover_referencias import repartir


def test_una_alergia_nunca_se_saca_del_campo():
    assert clasificar_referencia("AMPICILINA") == "alergia"
    assert clasificar_referencia("alergia a mariscos") == "alergia"
    assert clasificar_referencia("PENICILINA") == "alergia"


def test_un_antecedente_clinico_se_queda():
    assert clasificar_referencia("HTA") == "clinico"
    assert clasificar_referencia("embarazo gemelar") == "clinico"
    assert clasificar_referencia("OTB") == "clinico"
    assert clasificar_referencia("birads 2") == "clinico"


def test_una_referencia_personal_se_mueve():
    assert clasificar_referencia("MAESTRA E. FISICA") == "referencia"
    assert clasificar_referencia("HOTELERIA") == "referencia"
    assert clasificar_referencia("secretaria poder judicial") == "referencia"
    assert clasificar_referencia("ISSSTE") == "referencia"


def test_reparte_una_mezcla_conservando_lo_clinico():
    queda, mueve = repartir("MAESTRA UAS; candidata pellets")
    assert queda == "candidata pellets"  # pellets es tratamiento
    assert mueve == "MAESTRA UAS"


def test_ante_la_duda_lo_clinico_manda_en_la_misma_frase():
    queda, mueve = repartir("retiro implante; mariscos")
    assert mueve is None  # ninguna de las dos partes es una referencia
    assert queda == "retiro implante; mariscos"


def test_no_confundir_lo_clinico_con_una_referencia():
    """Casos reales mal clasificados en la primera pasada."""
    assert clasificar_referencia("VASECTOMIA") == "clinico"
    assert clasificar_referencia("emenorrea sec") == "clinico"  # errata real
    assert clasificar_referencia("antecedente de uso de H. iny") == "clinico"


def test_ninguna_significa_que_si_se_pregunto():
    """Vacio es 'no registrado'; 'ninguna' es 'se pregunto y no tiene'."""
    assert clasificar_referencia("ninguna") == "alergia"
    assert clasificar_referencia("ninguno!") == "alergia"
