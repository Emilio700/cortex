"""Reconstruccion del historial de embarazos a partir de las citas del legacy.

Cada caso viene de datos reales de la base del consultorio: el expediente 62,
que es el que motivo el analisis, los formatos de ``peso`` y ``t_a`` tal como
se teclearon, y las tres formas en que los contadores G/P/C/A se contradicen.
Un desenlace inventado aqui es un dato falso en un expediente clinico, asi que
lo que se fija sobre todo es CUANDO el codigo se niega a concluir.
"""
from datetime import date
from decimal import Decimal

from scripts.reconstruir_embarazos import (
    CESAREA,
    DESCONOCIDO,
    EN_CURSO,
    PARTO,
    PERDIDA,
    agrupar_embarazos,
    embarazo_del_expediente,
    frecuencia_cardiaca_fetal,
    incoherencias,
    inferir_desenlaces,
    marcar_estado,
    nota_embarazo,
    peso_kg,
    reconstruir_paciente,
    semanas_gestacion,
    tension,
    visita_desde_cita,
)

CERO = "0000-00-00"


def cita(id_cita, dia, fur=CERO, fpp=CERO, g=0, p=0, c=0, a=0, **extra):
    """Una fila de ``citas`` como la entrega pymysql.

    Las fechas vacias llegan como la cadena '0000-00-00', no como None.
    """
    fila = {
        "id_cita": id_cita,
        "clave": 62,
        "cita": id_cita,
        "fecha": dia,
        "fec_cita": dia,
        "efectiva": dia,
        "feul_reg": fur,
        "fe_parto": fpp,
        "gestas": g,
        "paras": p,
        "cesar": c,
        "aborto": a,
        "peso": "",
        "t_a": "",
        "usg": "",
    }
    fila.update(extra)
    return fila


# --------------------------------------------------------------------------
# Normalizacion de los campos tecleados a mano
# --------------------------------------------------------------------------
def test_peso_con_coma_separa_kilos_de_gramos():
    # '58,400 KG' son 58 kg 400 g, no 58400.
    assert peso_kg("58,400 KG") == Decimal("58.4")
    assert peso_kg("67,500 KG") == Decimal("67.5")


def test_peso_admite_los_formatos_sueltos_del_legacy():
    assert peso_kg("46,KG") == Decimal("46")
    assert peso_kg("52, KG") == Decimal("52")
    assert peso_kg("62.500") == Decimal("62.500")
    assert peso_kg("57") == Decimal("57")


def test_peso_ilegible_o_fuera_de_rango_se_descarta():
    assert peso_kg("") is None
    assert peso_kg(None) is None
    assert peso_kg("KG") is None
    assert peso_kg("TUBO NEURAL") is None
    assert peso_kg("5") is None  # nadie pesa 5 kg
    assert peso_kg("580") is None


def test_tension_solo_acepta_un_par_plausible():
    assert tension("117/74") == (117, 74)
    assert tension(" 100 / 70 ") == (100, 70)
    assert tension("") == (None, None)
    assert tension("100/70/60") == (None, None)
    assert tension("70/110") == (None, None)  # invertida
    assert tension("999/10") == (None, None)


def test_frecuencia_cardiaca_se_transcribe_del_texto_del_usg():
    usg = (
        "PRODUCTO UNICO VIVO TUBO NEURAL CERRADO PLACENTA CORPORAL I "
        "CORAZON FETAL RITMICO CON 150 LPM EDAD GESTACIONAL 21.4 SEMANAS"
    )
    assert frecuencia_cardiaca_fetal(usg) == 150
    assert frecuencia_cardiaca_fetal("UTERO Y OVARIOS NORMAL") is None
    assert frecuencia_cardiaca_fetal(None) is None


def test_edad_gestacional_se_calcula_de_la_fur_no_del_texto():
    # El '21.4 SEMANAS' del USG son 21 semanas y 4 dias, no 21.4 semanas:
    # por eso la edad se calcula y no se transcribe.
    assert semanas_gestacion(date(2018, 8, 15), date(2019, 1, 23)) == Decimal("23.0")
    assert semanas_gestacion(None, date(2019, 1, 23)) is None
    assert semanas_gestacion(date(2019, 1, 23), date(2018, 8, 15)) is None
    # Mas de 45 semanas: la FUR no corresponde a esa consulta.
    assert semanas_gestacion(date(2018, 1, 1), date(2019, 6, 1)) is None


# --------------------------------------------------------------------------
# Agrupacion por FUR
# --------------------------------------------------------------------------
def test_agrupa_las_citas_del_expediente_62_en_cuatro_embarazos():
    citas = [
        cita(63, date(2011, 2, 23)),
        cita(150, date(2012, 2, 16), date(2010, 6, 15), date(2011, 3, 22), g=1),
        cita(2189, date(2012, 5, 7), date(2011, 11, 17), date(2012, 8, 24), g=1),
        cita(2591, date(2012, 7, 24), date(2011, 11, 17), date(2012, 8, 24), g=1, p=1),
        cita(14673, date(2019, 1, 23), date(2018, 8, 15), date(2019, 5, 22), g=3, p=1),
        cita(19317, date(2022, 1, 13), date(2021, 6, 5), date(2022, 3, 12), g=4, p=2, c=1, a=1),
    ]
    embarazos = agrupar_embarazos(citas)
    assert [e["fur"] for e in embarazos] == [
        date(2010, 6, 15),
        date(2011, 11, 17),
        date(2018, 8, 15),
        date(2021, 6, 5),
    ]
    assert [e["fpp"] for e in embarazos] == [
        date(2011, 3, 22),
        date(2012, 8, 24),
        date(2019, 5, 22),
        date(2022, 3, 12),
    ]
    assert len(embarazos[1]["citas"]) == 2


def test_una_cita_sin_fur_no_abre_ningun_embarazo():
    assert agrupar_embarazos([cita(1, date(2011, 2, 23))]) == []


def test_dos_fur_cercanas_son_el_mismo_embarazo_corregido():
    # Caso real (expediente 94): 2018-06-15 y 2018-06-22.
    citas = [
        cita(1, date(2018, 8, 1), date(2018, 6, 15)),
        cita(2, date(2018, 9, 1), date(2018, 6, 22)),
    ]
    embarazos = agrupar_embarazos(citas)
    assert len(embarazos) == 1
    assert embarazos[0]["fur"] == date(2018, 6, 15)
    assert embarazos[0]["furs_alternas"] == [date(2018, 6, 22)]
    assert len(embarazos[0]["citas"]) == 2


def test_fpp_que_no_cuadra_con_la_fur_se_recalcula():
    # La FPP arrastrada de otro embarazo no se cree: se usa FUR + 280 dias.
    citas = [cita(1, date(2019, 1, 1), date(2018, 8, 15), date(2012, 8, 24))]
    emb = agrupar_embarazos(citas)[0]
    assert emb["fpp_tecleada"] is None
    assert emb["fpp"] == date(2019, 5, 22)


# --------------------------------------------------------------------------
# Desenlaces
# --------------------------------------------------------------------------
def _desenlaces(citas):
    embarazos = agrupar_embarazos(citas)
    inferir_desenlaces(embarazos, citas)
    return embarazos


def test_paras_que_sube_despues_de_la_fpp_es_un_parto():
    citas = [
        cita(1, date(2011, 2, 23)),
        cita(2, date(2012, 2, 16), date(2010, 6, 15), date(2011, 3, 22), g=1),
        cita(3, date(2012, 5, 7), date(2011, 11, 17), date(2012, 8, 24), g=1),
        cita(4, date(2012, 7, 24), date(2011, 11, 17), date(2012, 8, 24), g=1, p=1),
    ]
    embarazos = _desenlaces(citas)
    assert embarazos[0]["outcome"] == PARTO
    assert "paras" in embarazos[0]["motivo"]


def test_cesar_que_sube_es_una_cesarea_y_aborto_una_perdida():
    base = [cita(1, date(2013, 5, 17), date(2013, 3, 28), date(2014, 1, 4), g=2)]
    cesarea = _desenlaces(base + [cita(2, date(2015, 10, 23), CERO, CERO, g=2, c=1)])
    assert cesarea[0]["outcome"] == CESAREA
    perdida = _desenlaces(base + [cita(2, date(2015, 10, 23), CERO, CERO, g=2, a=1)])
    assert perdida[0]["outcome"] == PERDIDA


def test_dos_contadores_que_suben_a_la_vez_dejan_el_desenlace_desconocido():
    # Expediente 62: en una sola consulta subieron paras, cesar y aborto.
    citas = [
        cita(1, date(2019, 5, 2), date(2018, 8, 15), date(2019, 5, 22), g=3, p=1),
        cita(2, date(2022, 1, 13), CERO, CERO, g=4, p=2, c=1, a=1),
    ]
    embarazos = _desenlaces(citas)
    assert embarazos[0]["outcome"] == DESCONOCIDO
    assert "varios contadores" in embarazos[0]["motivo"]


def test_contadores_que_retroceden_dejan_el_desenlace_desconocido():
    citas = [
        cita(1, date(2016, 6, 14), date(2015, 9, 17), date(2016, 6, 24), g=3, p=1, c=1),
        cita(2, date(2019, 2, 9), CERO, CERO, g=3, p=3, c=0, a=1),
    ]
    embarazos = _desenlaces(citas)
    assert embarazos[0]["outcome"] == DESCONOCIDO
    assert "retrocedieron" in embarazos[0]["motivo"]


def test_no_se_atribuye_el_incremento_si_entre_medias_termino_otro_embarazo():
    citas = [
        cita(1, date(2012, 8, 8), date(2011, 11, 17), date(2012, 8, 24), g=1, p=1),
        cita(2, date(2019, 1, 23), date(2018, 8, 15), date(2019, 5, 22), g=3, p=1),
        cita(3, date(2022, 1, 13), CERO, CERO, g=4, p=2),
    ]
    embarazos = _desenlaces(citas)
    # El parto de 2022 pudo ser del embarazo de 2011 o del de 2018.
    assert embarazos[0]["outcome"] == DESCONOCIDO
    assert "otro embarazo" in embarazos[0]["motivo"]


def test_que_solo_suba_gestas_no_es_evidencia_de_desenlace():
    # 'gestas' cuenta embarazos, no dice en que acabaron: no basta.
    citas = [
        cita(1, date(2012, 8, 8), date(2011, 11, 17), date(2012, 8, 24), g=1),
        cita(2, date(2018, 10, 27), CERO, CERO, g=3),
    ]
    embarazos = _desenlaces(citas)
    assert embarazos[0]["outcome"] == DESCONOCIDO
    assert "no volvieron a moverse" in embarazos[0]["motivo"]


def test_sin_cita_posterior_a_la_fpp_no_hay_desenlace():
    citas = [cita(1, date(2021, 8, 1), date(2021, 6, 5), date(2022, 3, 12), g=4)]
    embarazos = _desenlaces(citas)
    assert embarazos[0]["outcome"] == DESCONOCIDO
    assert "posterior a la FPP" in embarazos[0]["motivo"]


def test_el_desenlace_nunca_trae_fecha_porque_el_legacy_no_la_guardo():
    citas = [
        cita(1, date(2013, 5, 17), date(2013, 3, 28), date(2014, 1, 4), g=2),
        cita(2, date(2015, 10, 23), CERO, CERO, g=2, c=1),
    ]
    assert _desenlaces(citas)[0]["outcome_date"] is None


# --------------------------------------------------------------------------
# Estado (activo / terminado)
# --------------------------------------------------------------------------
def test_solo_el_ultimo_embarazo_reciente_sigue_activo():
    citas = [
        cita(1, date(2011, 2, 23), date(2010, 6, 15), date(2011, 3, 22)),
        cita(2, date(2026, 8, 1), date(2026, 6, 1), date(2027, 3, 8)),
    ]
    embarazos = marcar_estado(_desenlaces(citas), hoy=date(2026, 9, 19))
    assert embarazos[0]["status"] == "completed"
    assert embarazos[1]["status"] == "active"
    assert embarazos[1]["outcome"] == EN_CURSO


def test_un_embarazo_viejo_nunca_queda_activo():
    citas = [cita(1, date(2021, 8, 1), date(2021, 6, 5), date(2022, 3, 12))]
    embarazos = marcar_estado(_desenlaces(citas), hoy=date(2026, 9, 19))
    assert embarazos[0]["status"] == "completed"
    assert embarazos[0]["outcome"] == DESCONOCIDO


def test_un_embarazo_reciente_con_desenlace_deducido_ya_no_esta_activo():
    citas = [
        cita(1, date(2026, 8, 1), date(2025, 12, 1), date(2026, 9, 7), g=1),
        cita(2, date(2026, 9, 15), CERO, CERO, g=1, p=1),
    ]
    embarazos = marcar_estado(_desenlaces(citas), hoy=date(2026, 9, 19))
    assert embarazos[0]["outcome"] == PARTO
    assert embarazos[0]["status"] == "completed"


# --------------------------------------------------------------------------
# La FUR suelta del expediente
# --------------------------------------------------------------------------
def test_se_rescata_la_fur_del_expediente_cuando_ninguna_cita_la_respalda():
    # Desde 2022 el sistema anterior dejo de copiar la FUR a las citas.
    citas = [cita(1, date(2016, 6, 14), date(2015, 9, 17), date(2016, 6, 24))]
    embarazos = reconstruir_paciente(
        citas, date(2022, 12, 5), date(2023, 9, 12), hoy=date(2026, 9, 19)
    )
    assert len(embarazos) == 2
    assert embarazos[1]["fur"] == date(2022, 12, 5)
    assert embarazos[1]["solo_expediente"] is True
    assert embarazos[1]["citas"] == []


def test_no_se_duplica_el_embarazo_que_las_citas_ya_respaldan():
    citas = [cita(1, date(2016, 6, 14), date(2015, 9, 17), date(2016, 6, 24))]
    embarazos = reconstruir_paciente(citas, date(2015, 9, 17), date(2016, 6, 24))
    assert len(embarazos) == 1
    assert embarazos[0]["solo_expediente"] is False


def test_sin_fur_en_ningun_lado_no_se_inventa_un_embarazo():
    assert reconstruir_paciente([cita(1, date(2016, 6, 14))], None, None) == []
    assert embarazo_del_expediente(None, None, []) is None


# --------------------------------------------------------------------------
# Incoherencias
# --------------------------------------------------------------------------
def test_detecta_la_fur_posterior_a_la_consulta():
    # Expediente 5707: FUR 2020-05-24 en una cita del 2020-05-18.
    citas = [cita(1, date(2020, 5, 18), date(2020, 5, 24), CERO)]
    clases = [p[0] for p in incoherencias(agrupar_embarazos(citas))]
    assert "fur_posterior_a_la_cita" in clases


def test_detecta_la_fur_anterior_al_nacimiento_de_la_paciente():
    citas = [cita(1, date(2016, 1, 1), date(2015, 6, 1), CERO)]
    embarazos = agrupar_embarazos(citas)
    clases = [p[0] for p in incoherencias(embarazos, date(2016, 3, 1))]
    assert "fur_anterior_al_nacimiento" in clases
    # Expediente 7321: FUR 2024-04-20 con nacimiento 2021-12-13.
    clases = [p[0] for p in incoherencias(embarazos, date(2010, 1, 1))]
    assert "fur_antes_de_los_9_anios" in clases


def test_una_paciente_sin_problemas_no_genera_incoherencias():
    citas = [cita(1, date(2019, 1, 23), date(2018, 8, 15), date(2019, 5, 22))]
    assert incoherencias(agrupar_embarazos(citas), date(1990, 5, 2)) == []


# --------------------------------------------------------------------------
# Salida hacia GEMS
# --------------------------------------------------------------------------
def test_la_visita_solo_se_crea_con_la_cita_celebrada_y_dentro_del_embarazo():
    emb = agrupar_embarazos(
        [
            cita(1, date(2019, 1, 23), date(2018, 8, 15), date(2019, 5, 22),
                 peso="57", t_a="117/65", usg="CORAZON FETAL RITMICO CON 150 LPM"),
        ]
    )[0]
    visita = visita_desde_cita(emb["citas"][0], emb)
    assert visita["visit_date"] == date(2019, 1, 23)
    assert visita["ega"] == Decimal("23.0")
    assert visita["peso"] == Decimal("57")
    assert (visita["sis"], visita["dia"]) == (117, 65)
    assert visita["fcf"] == 150

    # Una cita que la paciente no cumplio no deja visita.
    no_asistio = dict(emb["citas"][0], efectiva=CERO)
    assert visita_desde_cita(no_asistio, emb) is None
    # Una cita muy posterior a la FPP quedo en el grupo por la FUR arrastrada.
    arrastrada = dict(emb["citas"][0], efectiva=date(2021, 9, 15), fec_cita=date(2021, 9, 15))
    assert visita_desde_cita(arrastrada, emb) is None
    # Una cita sin ningun dato no aporta nada.
    vacia = dict(emb["citas"][0], peso="", t_a="", usg="")
    assert visita_desde_cita(vacia, emb) is None


def test_la_nota_dice_de_donde_sale_el_embarazo_y_que_no_se_sabe():
    citas = [cita(1, date(2019, 1, 23), date(2018, 8, 15), date(2019, 5, 22))]
    emb = reconstruir_paciente(citas, None, None, hoy=date(2026, 9, 19))[0]
    nota = nota_embarazo(emb, "G & G", 62)
    assert nota.startswith("[RECONSTRUIDO DEL SISTEMA ANTERIOR]")
    assert "expediente 62" in nota
    assert "DESENLACE NO DETERMINADO" in nota


def test_la_nota_del_embarazo_sin_citas_avisa_que_solo_se_sabe_la_fecha():
    emb = reconstruir_paciente([], date(2022, 12, 5), date(2023, 9, 12))[0]
    nota = nota_embarazo(emb, "G & G", 14)
    assert "NINGUNA consulta respalda esta FUR" in nota


def test_las_sentencias_de_insercion_cuadran_con_los_modelos():
    """Las columnas se escriben a mano en SQL: aqui se comprueban de verdad.

    Un nombre de columna equivocado solo se veria al correr con --aplicar
    contra la base real, que es exactamente lo que no se puede hacer.
    """
    from datetime import datetime

    from sqlalchemy import create_engine

    import app.models  # noqa: F401  (registra todas las tablas)
    from app.db.session import Base
    from scripts.reconstruir_embarazos import SQL_INSERT_EMBARAZO, SQL_INSERT_VISITA

    motor = create_engine("sqlite://")
    Base.metadata.create_all(motor)
    ahora = datetime(2026, 9, 19, 12, 0)
    citas = [
        cita(1, date(2019, 1, 23), date(2018, 8, 15), date(2019, 5, 22),
             peso="57", t_a="117/65", usg="CORAZON FETAL RITMICO CON 150 LPM"),
    ]
    emb = reconstruir_paciente(citas, None, None, hoy=date(2026, 9, 19))[0]
    with motor.begin() as con:
        pregnancy_id = con.execute(
            SQL_INSERT_EMBARAZO,
            {
                "tenant_id": 2, "patient_id": 62, "doctor_id": 3,
                "status": emb["status"], "lmp": emb["fur"], "edd": emb["fpp"],
                "dating_method": "lmp", "dating_status": "pending",
                "edd_source": "legacy_citas", "outcome": emb["outcome"],
                "outcome_date": emb["outcome_date"],
                "notes": nota_embarazo(emb, "G & G", 62), "ts": ahora,
            },
        ).scalar()
        visita = visita_desde_cita(emb["citas"][0], emb)
        visita.update(tenant_id=2, pregnancy_id=pregnancy_id, doctor_id=3, ts=ahora)
        con.execute(SQL_INSERT_VISITA, visita)
        fila = con.exec_driver_sql(
            "SELECT gestational_age_weeks, maternal_weight_kg, systolic_bp "
            "FROM prenatal_visits"
        ).fetchone()
    assert fila == (23.0, 57.0, 117)
