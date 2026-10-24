"""La receta se configura doctor por doctor.

Dos cosas se comprueban aquí:

1. **Lo que cada médico decide** — con qué nombre firma y qué elementos se
   imprimen — acaba de verdad en el PDF.
2. **Lo que nadie decidió sigue igual.** La receta se entrega impresa a la
   paciente: un doctor que no ha tocado su configuración no puede encontrarse
   con una receta distinta de la de ayer.

El texto se saca del propio PDF. ReportLab comprime el flujo de la página, así
que las pruebas apagan la compresión (``rl_config.pageCompression``) y leen las
cadenas del contenido. Se evita así depender de una librería de lectura de PDF
que hoy no está declarada en ``requirements.txt``.
"""

import re
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
import reportlab.rl_config
from fastapi.testclient import TestClient
from sqlalchemy import Boolean, Integer, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base, utcnow
from app.main import app
from app.models.doctor_profile import DoctorProfile
from app.models.prescription import Prescription
from app.models.specialty import Specialty
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession
from app.utils.colores import (
    COLOR_ACENTO_POR_DEFECTO,
    COLOR_CAMPO_POR_DEFECTO,
    COLOR_LINEA_POR_DEFECTO,
    es_hex_valido,
    normalizar_hex,
    tonos,
)
from app.utils.pdf import fuente_de_firma, generate_prescription_pdf
from app.utils.receta_config import (
    AJUSTES_RECETA_POR_DEFECTO,
    ESTILO_FIRMA_POR_DEFECTO,
    LEYENDA_POR_DEFECTO,
    lineas_credenciales,
    normalizar_estilo_firma,
    nombre_para_receta,
    resolver_ajustes,
    resolver_estilo_firma,
    resolver_leyenda,
)

PREFIX = settings.API_V1_PREFIX

NOMBRE_COMPLETO = "YARA MONTSERRAT GUTIERREZ ROMERO"


@pytest.fixture(autouse=True)
def _pdf_sin_comprimir():
    """Sin compresión el texto del PDF se puede leer tal cual."""
    anterior = reportlab.rl_config.pageCompression
    reportlab.rl_config.pageCompression = 0
    yield
    reportlab.rl_config.pageCompression = anterior


def _texto_del_pdf(datos: bytes) -> str:
    """Todas las cadenas dibujadas en el PDF, en un solo texto.

    ReportLab escapa en octal lo que no es ASCII imprimible, asi que una "\u00d1"
    viaja como ``\\321``. Se desescapa para poder comparar contra el texto tal
    como lo veria la paciente y no contra su forma escapada.
    """
    cadenas = re.findall(rb"\((?:\\.|[^\\()])*\)", datos)

    def _desescapar(cruda: bytes) -> str:
        return re.sub(
            r"\\([0-7]{1,3}|.)",
            lambda m: chr(int(m.group(1), 8)) if m.group(1).isdigit() else m.group(1),
            cruda[1:-1].decode("latin-1"),
        )

    return " | ".join(_desescapar(c) for c in cadenas)


def _perfil(**cambios):
    """Un perfil de doctora completo, para variar solo lo que interesa."""
    base = dict(
        logo_url=None,
        signature_url=None,
        clinic_address="AV. DE LA SALUD 123, COLIMA",
        phone="312 123 4567",
        professional_id="7654321",
        general_registry="RGP-9",
        specialty_license="ESP-7",
        health_registry="SSA-5",
        council_cert="CONACEM-3",
        specialty=SimpleNamespace(name="GINECOLOGIA Y OBSTETRICIA"),
        user=SimpleNamespace(full_name=NOMBRE_COMPLETO),
        prescription_display_name=None,
        prescription_settings=None,
    )
    base.update(cambios)
    return SimpleNamespace(**base)


def _paciente():
    return SimpleNamespace(
        id=42,
        first_name="MARIA",
        last_name="LOPEZ HERNANDEZ",
        date_of_birth=date(1990, 1, 1),
        allergies="PENICILINA",
    )


def _receta():
    return SimpleNamespace(
        id=7,
        folio_number="RX-000123",
        created_at=datetime(2026, 9, 20, 10, 0),
        medications=[
            {"name": "PARACETAMOL", "dosage": "500 mg", "frequency": "Cada 8 horas"}
        ],
        instructions="Tomar abundantes liquidos.",
    )


def _triaje():
    return SimpleNamespace(
        weight_kg=62,
        height_cm=163,
        blood_pressure_systolic=110,
        blood_pressure_diastolic=70,
        temperature_celsius=36.5,
        chief_complaint="SANGRADO IRREGULAR DESDE HACE DOS MESES",
    )


def _soap():
    return SimpleNamespace(
        subjective="REFIERE DOLOR PELVICO",
        objective="UTERO AUMENTADO DE TAMANO",
        assessment="MIOMATOSIS UTERINA",
        plan="SOLICITAR ULTRASONIDO",
    )


def _receta_en_texto(perfil) -> str:
    return _texto_de(_receta(), perfil)


def _texto_de(receta, perfil) -> str:
    pdf = generate_prescription_pdf(
        receta, perfil, _paciente(), _triaje(), soap_note=_soap()
    )
    return _texto_del_pdf(pdf.read())


# ---------------------------------------------------------------------------
# Lo que no se configuró sigue igual
# ---------------------------------------------------------------------------

def test_sin_configurar_la_receta_se_sigue_generando():
    """Los demás doctores no han tocado nada: su receta no puede romperse."""
    texto = _receta_en_texto(_perfil())

    assert NOMBRE_COMPLETO in texto
    assert "MARIA LOPEZ HERNANDEZ" in texto
    assert "PARACETAMOL 500 mg" in texto
    assert "R.G.P. RGP-9" in texto
    assert "SSA SSA-5" in texto
    assert "AV. DE LA SALUD 123, COLIMA" in texto
    assert "Tel. 312 123 4567" in texto
    assert "Folio: RX-000123" in texto


def test_un_perfil_sin_columna_de_ajustes_no_revienta():
    """Perfiles antiguos (sin los campos nuevos) se siguen imprimiendo."""
    antiguo = _perfil()
    del antiguo.prescription_display_name
    del antiguo.prescription_settings

    texto = _receta_en_texto(antiguo)
    assert NOMBRE_COMPLETO in texto


# ---------------------------------------------------------------------------
# El nombre de la receta
# ---------------------------------------------------------------------------

def test_el_nombre_configurado_se_usa_en_la_receta():
    """La Dra. Yara quiere firmar sin Montserrat, y es válido."""
    texto = _receta_en_texto(_perfil(prescription_display_name="Dra. Yara Gutierrez"))

    assert "Dra. Yara Gutierrez" in texto
    assert NOMBRE_COMPLETO not in texto


def test_el_nombre_no_duplica_el_tratamiento():
    """El "Dr. Dr." ya salió impreso una vez; no puede volver a pasar."""
    for configurado in ["Dra. Yara Gutierrez", "DR. ADOLFO PEREZ", "Doctora Yara"]:
        texto = _receta_en_texto(_perfil(prescription_display_name=configurado))
        assert "Dr. Dr." not in texto
        assert "Dra. Dra." not in texto
        assert configurado in texto


def test_sin_tratamiento_escrito_se_antepone_el_de_la_usuaria():
    """``users.full_name`` se guarda sin título; el que va es el capturado."""
    dra = SimpleNamespace(full_name=NOMBRE_COMPLETO, tratamiento="Dra.")
    assert nombre_para_receta(
        _perfil(prescription_display_name="Yara Gutierrez", user=dra)
    ) == "Dra. Yara Gutierrez"
    assert nombre_para_receta(_perfil(user=dra)) == f"Dra. {NOMBRE_COMPLETO}"
    texto = _receta_en_texto(_perfil(user=dra))
    assert f"Dra. {NOMBRE_COMPLETO}" in texto
    assert f"Dr. {NOMBRE_COMPLETO}" not in texto


def test_sin_tratamiento_capturado_va_el_nombre_solo():
    """Un "Dr." puesto a una doctora es peor que no poner nada (plan 23, ajustes)."""
    assert nombre_para_receta(_perfil(prescription_display_name="Yara Gutierrez")) == (
        "Yara Gutierrez"
    )
    assert nombre_para_receta(_perfil()) == NOMBRE_COMPLETO
    texto = _receta_en_texto(_perfil())
    assert f"Dr. {NOMBRE_COMPLETO}" not in texto


def test_un_tratamiento_escrito_en_el_nombre_gana_sobre_el_capturado():
    """Si ella escribió "Dra. Yara" en su perfil no se le antepone otro."""
    dr = SimpleNamespace(full_name=NOMBRE_COMPLETO, tratamiento="Dr.")
    assert nombre_para_receta(
        _perfil(prescription_display_name="Dra. Yara Gutierrez", user=dr)
    ) == "Dra. Yara Gutierrez"


def test_el_nombre_se_puede_ocultar():
    texto = _receta_en_texto(_perfil(prescription_settings={"mostrar_nombre": False}))
    assert NOMBRE_COMPLETO not in texto


# ---------------------------------------------------------------------------
# Interruptores
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "clave,fragmento",
    [
        ("mostrar_registro_ssa", "SSA SSA-5"),
        ("mostrar_registro_general", "R.G.P. RGP-9"),
        ("mostrar_cedula_especialidad", "ESP-7"),
        ("mostrar_consejo", "CONACEM-3"),
        ("mostrar_telefono", "Tel. 312 123 4567"),
        ("mostrar_direccion", "AV. DE LA SALUD 123, COLIMA"),
        ("mostrar_pie_legal", "CUIDAMOS TU SALUD"),
        ("mostrar_alergias", "PENICILINA"),
        ("mostrar_fecha_nacimiento", "FECHA DE NACIMIENTO"),
        ("mostrar_edad", "EDAD:"),
    ],
)
def test_un_elemento_desactivado_no_aparece(clave, fragmento):
    """Lo encendido sale y lo apagado no: si no, el interruptor miente."""
    assert fragmento in _receta_en_texto(_perfil(prescription_settings={clave: True}))
    assert fragmento not in _receta_en_texto(_perfil(prescription_settings={clave: False}))


def test_la_especialidad_y_la_cedula_se_pueden_encender():
    apagado = _receta_en_texto(_perfil())
    assert "GINECOLOGIA Y OBSTETRICIA" not in apagado
    assert "7654321" not in apagado

    encendido = _receta_en_texto(
        _perfil(
            prescription_settings={
                "mostrar_especialidad": True,
                "mostrar_cedula_profesional": True,
                # Solo caben cuatro lineas: se apagan dos para verlas.
                "mostrar_registro_ssa": False,
                "mostrar_consejo": False,
            }
        )
    )
    assert "GINECOLOGIA Y OBSTETRICIA" in encendido
    assert "7654321" in encendido


def test_la_fecha_y_el_folio_no_se_pueden_quitar():
    """Identifican la receta; no llevan interruptor."""
    texto = _receta_en_texto(
        _perfil(prescription_settings={c: False for c in AJUSTES_RECETA_POR_DEFECTO})
    )
    assert "FECHA:" in texto
    assert "20/09/2026" in texto
    assert "Folio: RX-000123" in texto
    assert "MARIA LOPEZ HERNANDEZ" in texto


def test_una_credencial_vacia_no_deja_la_etiqueta_suelta():
    """Un SSA sin número no le dice nada a nadie."""
    lineas = lineas_credenciales(
        _perfil(health_registry="   ", general_registry=None),
        AJUSTES_RECETA_POR_DEFECTO,
    )
    assert not any(linea.startswith("SSA") for linea in lineas)
    assert not any(linea.startswith("R.G.P.") for linea in lineas)


# ---------------------------------------------------------------------------
# El expediente fuera de la receta
# ---------------------------------------------------------------------------

def test_el_expediente_no_sale_en_la_receta():
    """La receta se entrega impresa: el diagnóstico no viaja en ella."""
    texto = _receta_en_texto(_perfil())

    assert "EXPEDIENTE" not in texto
    assert "EXP-42" not in texto
    assert "NOTAS DE CONSULTA" not in texto
    assert "MIOMATOSIS UTERINA" not in texto
    assert "REFIERE DOLOR PELVICO" not in texto
    assert "SOLICITAR ULTRASONIDO" not in texto
    assert "SANGRADO IRREGULAR" not in texto
    assert "DIAGN" not in texto


def test_los_signos_vitales_estan_apagados_de_origen():
    """También son expediente, pero pueden hacer falta para dosificar."""
    assert "Signos vitales" not in _receta_en_texto(_perfil())

    encendidos = _receta_en_texto(
        _perfil(prescription_settings={"mostrar_signos_vitales": True})
    )
    assert "Signos vitales" in encendidos
    assert "Peso 62 kg" in encendidos


def test_las_alergias_se_siguen_imprimiendo():
    """Es dato de seguridad de la paciente, no expediente."""
    assert "ALERGIAS: PENICILINA" in _receta_en_texto(_perfil())


# ---------------------------------------------------------------------------
# El JSON de ajustes
# ---------------------------------------------------------------------------

def test_un_json_con_basura_no_tumba_la_receta():
    perfil = _perfil(
        prescription_settings={
            "mostrar_logo": 1,          # entero, no booleano
            "mostrar_telefono": "si",   # texto
            "inventado": True,          # clave que no existe
            "mostrar_consejo": False,   # este si es valido
        }
    )
    ajustes = resolver_ajustes(perfil)

    assert ajustes["mostrar_logo"] is True       # se ignora el entero
    assert ajustes["mostrar_telefono"] is True   # se ignora el texto
    assert ajustes["mostrar_consejo"] is False   # este manda
    assert "inventado" not in ajustes


def test_los_ajustes_se_guardan_como_json_no_como_enteros():
    """Un booleano en una columna INTEGER ya tumbó producción una vez."""
    columnas = DoctorProfile.__table__.columns
    tipo = columnas["prescription_settings"].type
    assert not isinstance(tipo, (Integer, Boolean))
    assert columnas["prescription_display_name"].type.python_type is str
    # Y ninguna columna nueva con pinta de booleano suelto.
    sospechosas = [
        c for c in columnas if c.name.startswith(("mostrar_", "show_", "is_", "has_"))
    ]
    for columna in sospechosas:
        assert isinstance(columna.type, Boolean), f"{columna.name} deberia ser Boolean"


# ---------------------------------------------------------------------------
# Los endpoints del perfil
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sesion = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield sesion
    finally:
        sesion.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def doctora(db_session):
    tenant = Tenant(name="G & G de prueba", is_active=True)
    especialidad = Specialty(name="Ginecologia", slug="ginecologia", is_active=True)
    db_session.add_all([tenant, especialidad])
    db_session.commit()

    usuaria = User(
        email="yara@gems.com",
        hashed_password="no-usado",
        full_name=NOMBRE_COMPLETO,
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(usuaria)
    db_session.commit()

    perfil = DoctorProfile(
        user_id=usuaria.id,
        specialty_id=especialidad.id,
        professional_id="7654321",
        university="UNIVERSIDAD DE COLIMA",
        clinic_address="AV. DE LA SALUD 123",
        phone="312 123 4567",
    )
    db_session.add(perfil)
    db_session.commit()

    sesion = UserSession(
        id=str(uuid4()),
        user_id=usuaria.id,
        tenant_id=tenant.id,
        refresh_jti=str(uuid4()),
        expires_at=utcnow() + timedelta(days=1),
    )
    db_session.add(sesion)
    db_session.commit()
    token = security.create_access_token(
        data={"sub": str(usuaria.id), "role": usuaria.role.value, "sid": sesion.id}
    )
    return {"headers": {"Authorization": f"Bearer {token}"}, "perfil": perfil}


def test_el_perfil_devuelve_los_ajustes_completos(client, doctora):
    """Quien nunca configuró nada recibe los valores de fábrica, no un nulo."""
    respuesta = client.get(f"{PREFIX}/doctor-profile/me", headers=doctora["headers"])

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["prescription_display_name"] is None
    assert datos["prescription_settings"] == AJUSTES_RECETA_POR_DEFECTO


def test_guardar_la_configuracion_de_la_receta(client, doctora, db_session):
    respuesta = client.put(
        f"{PREFIX}/doctor-profile/me",
        headers=doctora["headers"],
        json={
            "prescription_display_name": "Dra. Yara Gutierrez",
            "prescription_settings": {"mostrar_logo": False, "mostrar_registro_ssa": False},
        },
    )

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["prescription_display_name"] == "Dra. Yara Gutierrez"
    assert datos["prescription_settings"]["mostrar_logo"] is False
    assert datos["prescription_settings"]["mostrar_registro_ssa"] is False
    assert datos["prescription_settings"]["mostrar_firma"] is True

    guardado = (
        db_session.query(DoctorProfile)
        .filter(DoctorProfile.id == doctora["perfil"].id)
        .first()
    )
    db_session.refresh(guardado)
    # Booleanos de verdad en el JSON, no ceros y unos.
    assert guardado.prescription_settings["mostrar_logo"] is False
    assert guardado.prescription_settings["mostrar_firma"] is True


def test_un_ajuste_que_no_es_booleano_se_rechaza(client, doctora):
    """Antes de la base, el 422. Nada de un 1 guardado como interruptor."""
    respuesta = client.put(
        f"{PREFIX}/doctor-profile/me",
        headers=doctora["headers"],
        json={"prescription_settings": {"mostrar_logo": 1}},
    )
    assert respuesta.status_code == 422


def test_la_vista_previa_devuelve_un_pdf_sin_guardar_nada(client, doctora, db_session):
    """El médico ve cómo queda antes de decidir."""
    respuesta = client.post(
        f"{PREFIX}/doctor-profile/me/prescription-preview",
        headers=doctora["headers"],
        json={
            "prescription_display_name": "Dra. Yara Gutierrez",
            "prescription_settings": {
                **AJUSTES_RECETA_POR_DEFECTO,
                "mostrar_telefono": False,
            },
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"].startswith("application/pdf")
    texto = _texto_del_pdf(respuesta.content)
    assert "Dra. Yara Gutierrez" in texto
    assert "312 123 4567" not in texto
    assert "EXPEDIENTE" not in texto

    # Previsualizar no guarda: el perfil sigue sin configurar.
    guardado = (
        db_session.query(DoctorProfile)
        .filter(DoctorProfile.id == doctora["perfil"].id)
        .first()
    )
    db_session.refresh(guardado)
    assert guardado.prescription_display_name is None
    assert guardado.prescription_settings is None


# ---------------------------------------------------------------------------
# Por medicamento: presentación, vía, cantidad y sus propias indicaciones
# ---------------------------------------------------------------------------

def _con_medicamento(**campos):
    """Una receta con un solo medicamento, para leer el renglón sin ruido."""
    receta = _receta()
    base = {
        "name": "PARACETAMOL",
        "dosage": "500 mg",
        "frequency": "Cada 8 horas",
    }
    base.update(campos)
    receta.medications = [base]
    return receta


def test_la_presentacion_la_via_y_la_cantidad_se_imprimen():
    """Lo que la farmacia necesita para surtir sin llamar al consultorio."""
    texto = _texto_de(
        _con_medicamento(
            presentation="Tabletas",
            route="Via oral",
            quantity="15 tabletas",
        ),
        _perfil(),
    )

    assert "PARACETAMOL Tabletas 500 mg" in texto
    assert "Via oral" in texto
    assert "Surtir: 15 tabletas" in texto


def test_un_medicamento_de_antes_de_este_lote_se_imprime_igual():
    """La presentacion pegada dentro del nombre no se duplica."""
    texto = _texto_de(
        _con_medicamento(name="GYNOTRAN OVULOS", dosage="1 ovulo"),
        _perfil(),
    )
    assert "GYNOTRAN OVULOS 1 ovulo" in texto
    assert "GYNOTRAN OVULOS OVULOS" not in texto


def test_las_indicaciones_propias_del_medicamento_se_imprimen():
    """Se capturaban desde siempre y no salian en ningun lado."""
    con_notas = _texto_de(
        _con_medicamento(notes="Tomar con abundante agua"), _perfil()
    )
    assert "Indicaciones: Tomar con abundante agua" in con_notas

    sin_notas = _texto_de(_con_medicamento(), _perfil())
    assert "Indicaciones:" not in sin_notas


def test_un_medicamento_sin_los_campos_nuevos_no_agrega_renglones():
    """Nadie esta obligado a llenarlos: el renglon de siempre sale igual."""
    texto = _texto_de(_con_medicamento(), _perfil())

    assert "1.   PARACETAMOL 500 mg" in texto
    assert "Cada 8 horas" in texto
    assert "Surtir:" not in texto
    assert "Via oral" not in texto


# ---------------------------------------------------------------------------
# La leyenda del pie
# ---------------------------------------------------------------------------

def test_sin_leyenda_escrita_sale_la_de_siempre():
    texto = _receta_en_texto(_perfil())
    assert "CUIDAMOS TU SALUD, ACOMPAÑAMOS TU VIDA." in texto


def test_la_leyenda_del_pie_se_puede_editar():
    texto = _receta_en_texto(
        _perfil(prescription_footer_text="AGENDA TU CITA AL 312 123 4567")
    )
    assert "AGENDA TU CITA AL 312 123 4567" in texto
    assert LEYENDA_POR_DEFECTO not in texto


def test_una_leyenda_en_blanco_no_deja_el_pie_vacio():
    """Blanco no es una leyenda: es una receta a la que le falta el pie."""
    assert resolver_leyenda(_perfil(prescription_footer_text="   ")) == LEYENDA_POR_DEFECTO
    assert resolver_leyenda(_perfil(prescription_footer_text=None)) == LEYENDA_POR_DEFECTO
    assert "CUIDAMOS TU SALUD" in _receta_en_texto(
        _perfil(prescription_footer_text="   ")
    )


# ---------------------------------------------------------------------------
# El color del membrete
# ---------------------------------------------------------------------------

def test_el_color_de_fabrica_devuelve_exactamente_los_tonos_de_siempre():
    """Quien no abra esta pantalla tiene que imprimir la receta de ayer."""
    assert tonos(None) == (
        COLOR_ACENTO_POR_DEFECTO,
        COLOR_LINEA_POR_DEFECTO,
        COLOR_CAMPO_POR_DEFECTO,
    )
    assert tonos("#8B2E83") == (
        COLOR_ACENTO_POR_DEFECTO,
        COLOR_LINEA_POR_DEFECTO,
        COLOR_CAMPO_POR_DEFECTO,
    )
    assert tonos("#8b2e83") == tonos("#8B2E83")


def test_un_color_invalido_cae_al_de_fabrica():
    """La receta no deja de imprimirse porque el color guardado no se entienda."""
    for basura in ("", "morado", "#12345", "#GGGGGG", None, 42):
        assert tonos(basura) == tonos(None)


def test_cada_color_da_sus_tres_tonos():
    acento, linea, campo = tonos("#0F6E4F")

    assert acento == "#0F6E4F"
    assert linea != acento and campo != linea
    # El campo es una raya, no texto: va mas claro que el acento.
    assert tonos("#1E88E5")[2] != tonos("#0F6E4F")[2]


def test_un_color_muy_claro_se_oscurece_para_que_se_lea():
    """Un amarillo tal cual imprimiria el nombre casi invisible sobre blanco."""
    acento, _, _ = tonos("#FFE600")

    assert acento != "#FFE600"
    # La luminosidad baja: el canal mas claro del elegido ya no lo es tanto.
    assert int(acento[1:3], 16) < 0xFF


def test_el_color_se_normaliza_al_guardar():
    assert normalizar_hex("#8b2e83") == "#8B2E83"
    assert normalizar_hex("8B2E83") == "#8B2E83"
    assert normalizar_hex("  #8B2E83 ") == "#8B2E83"
    assert normalizar_hex("morado") is None
    assert es_hex_valido("#0F6E4F") is True
    assert es_hex_valido("#0F6E4") is False


# ---------------------------------------------------------------------------
# El bloque de la firma
# ---------------------------------------------------------------------------

def _firma_de_prueba(tmp_path):
    """Un PNG con la forma de una firma: ancho y bajito, como los reales."""
    from PIL import Image

    ruta = tmp_path / "firma.png"
    Image.new("RGBA", (600, 200), (255, 255, 255, 0)).save(ruta)
    return str(ruta)


def test_el_nombre_se_imprime_debajo_de_la_imagen_de_firma(tmp_path):
    """El nombre se callaba en cuanto habia imagen; ya no."""
    texto = _texto_de(
        _receta(),
        _perfil(
            signature_url=_firma_de_prueba(tmp_path),
            prescription_display_name="Dra. Yara Gutierrez",
        ),
    )

    assert "Dra. Yara Gutierrez" in texto
    # Y las credenciales siguen ahi.
    assert "R.G.P. RGP-9" in texto


def test_apagar_el_nombre_lo_apaga_tambien_con_imagen(tmp_path):
    texto = _texto_de(
        _receta(),
        _perfil(
            signature_url=_firma_de_prueba(tmp_path),
            prescription_display_name="Dra. Yara Gutierrez",
            prescription_settings={"mostrar_nombre": False},
        ),
    )

    assert "Dra. Yara Gutierrez" not in texto


def test_la_fuente_de_la_firma_sigue_lo_que_eligio_la_doctora():
    assert fuente_de_firma(ESTILO_FIRMA_POR_DEFECTO) == "Helvetica-Bold"

    sin_negritas = {**ESTILO_FIRMA_POR_DEFECTO, "negritas": False}
    assert fuente_de_firma(sin_negritas) == "Helvetica"

    cursiva = {**ESTILO_FIRMA_POR_DEFECTO, "cursiva": True, "negritas": False}
    assert fuente_de_firma(cursiva) == "Helvetica-Oblique"

    serif = {**ESTILO_FIRMA_POR_DEFECTO, "fuente": "serif", "cursiva": True}
    assert fuente_de_firma(serif) == "Times-BoldItalic"

    # Sin una fuente de firma instalada, "cursiva" cae a Times-Italic: es lo
    # mas parecido a una rubrica que trae ReportLab de origen.
    manuscrita = {**ESTILO_FIRMA_POR_DEFECTO, "fuente": "cursiva"}
    assert fuente_de_firma(manuscrita) in ("FirmaManuscrita", "Times-BoldItalic")


def test_un_estilo_con_basura_no_tumba_la_receta():
    """Un tamaño en texto o un 400 no pueden salirse del papel."""
    estilo = resolver_estilo_firma(
        _perfil(
            prescription_signature_style={
                "fuente": "comic-sans",     # no existe
                "tamano": "grande",         # no es numero
                "negritas": 1,              # no es booleano
                "color": "morado",          # no es hex
                "inventado": True,          # no existe
            }
        )
    )

    assert estilo["fuente"] == ESTILO_FIRMA_POR_DEFECTO["fuente"]
    assert estilo["tamano"] == ESTILO_FIRMA_POR_DEFECTO["tamano"]
    assert estilo["negritas"] == ESTILO_FIRMA_POR_DEFECTO["negritas"]
    assert estilo["color"] is None

    assert normalizar_estilo_firma({"tamano": 400})["tamano"] <= 26
    assert normalizar_estilo_firma({"tamano": True})["tamano"] == ESTILO_FIRMA_POR_DEFECTO["tamano"]
    assert normalizar_estilo_firma(None) == ESTILO_FIRMA_POR_DEFECTO


def test_el_nombre_se_puede_agrandar_y_pintar():
    """No es cosmetico: es lo que pidio el consultorio para la firma."""
    texto = _texto_de(
        _receta(),
        _perfil(
            prescription_display_name="Dra. Yara Gutierrez",
            prescription_signature_style={
                "fuente": "serif",
                "tamano": 22,
                "negritas": True,
                "cursiva": False,
                "color": "#0F6E4F",
                "linea_firma": False,
            },
        ),
    )

    assert "Dra. Yara Gutierrez" in texto


# ---------------------------------------------------------------------------
# El motivo de consulta, receta por receta
# ---------------------------------------------------------------------------

def test_el_motivo_no_se_imprime_si_la_receta_no_lo_trae():
    """Es expediente clinico y sigue apagado de origen."""
    texto = _texto_de(_receta(), _perfil())

    assert "MOTIVO DE CONSULTA" not in texto
    # Y no se toma de la nota ni del triaje por su cuenta: eso lo decide la
    # doctora en la receta, no el codigo al imprimir.
    assert "SANGRADO IRREGULAR" not in texto
    assert "MIOMATOSIS UTERINA" not in texto


def test_el_motivo_se_imprime_cuando_la_receta_lo_trae():
    receta = _receta()
    receta.diagnosis = "SANGRADO IRREGULAR"

    texto = _texto_de(receta, _perfil())

    # La etiqueta y el texto son dos cadenas distintas del PDF: la etiqueta va
    # en el color del membrete y el motivo en el gris del cuerpo.
    assert "MOTIVO DE CONSULTA:" in texto
    assert "SANGRADO IRREGULAR" in texto


def test_una_receta_sin_el_campo_motivo_no_revienta():
    """Las recetas emitidas antes de este lote no traen la columna."""
    receta = _receta()
    assert not hasattr(receta, "diagnosis")

    assert "MOTIVO DE CONSULTA" not in _texto_de(receta, _perfil())


# ---------------------------------------------------------------------------
# Los endpoints del estilo propio
# ---------------------------------------------------------------------------

def test_el_perfil_devuelve_el_estilo_de_fabrica_completo(client, doctora):
    """Igual que los ajustes: la pantalla no tiene que adivinar nada."""
    respuesta = client.get(f"{PREFIX}/doctor-profile/me", headers=doctora["headers"])

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["prescription_footer_text"] == LEYENDA_POR_DEFECTO
    assert datos["prescription_accent_color"] == COLOR_ACENTO_POR_DEFECTO
    assert datos["prescription_signature_style"] == ESTILO_FIRMA_POR_DEFECTO


def test_guardar_el_estilo_propio_de_la_receta(client, doctora, db_session):
    respuesta = client.put(
        f"{PREFIX}/doctor-profile/me",
        headers=doctora["headers"],
        json={
            "prescription_footer_text": "AGENDA TU CITA AL 312 123 4567",
            "prescription_accent_color": "#0F6E4F",
            "prescription_signature_style": {
                "fuente": "cursiva",
                "tamano": 20,
                "negritas": False,
                "cursiva": True,
                "color": "#0F6E4F",
                "linea_firma": True,
            },
        },
    )

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["prescription_footer_text"] == "AGENDA TU CITA AL 312 123 4567"
    assert datos["prescription_accent_color"] == "#0F6E4F"
    assert datos["prescription_signature_style"]["tamano"] == 20
    assert datos["prescription_signature_style"]["linea_firma"] is True

    guardado = (
        db_session.query(DoctorProfile)
        .filter(DoctorProfile.id == doctora["perfil"].id)
        .first()
    )
    db_session.refresh(guardado)
    assert guardado.prescription_accent_color == "#0F6E4F"
    assert guardado.prescription_signature_style["fuente"] == "cursiva"
    # El JSON guarda booleanos de verdad, no ceros y unos.
    assert guardado.prescription_signature_style["linea_firma"] is True


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"prescription_accent_color": "morado"},
        {"prescription_accent_color": "#12345"},
        {"prescription_signature_style": {"fuente": "comic-sans"}},
        {"prescription_signature_style": {"tamano": 400}},
        {"prescription_signature_style": {"negritas": 1}},
        {"prescription_signature_style": {"color": "morado"}},
    ],
)
def test_un_estilo_que_no_se_entiende_se_rechaza(client, doctora, cuerpo):
    """Antes de la base el 422, no un color guardado que nadie sabe pintar."""
    respuesta = client.put(
        f"{PREFIX}/doctor-profile/me", headers=doctora["headers"], json=cuerpo
    )
    assert respuesta.status_code == 422


def test_la_vista_previa_usa_el_estilo_sin_guardar(client, doctora, db_session):
    respuesta = client.post(
        f"{PREFIX}/doctor-profile/me/prescription-preview",
        headers=doctora["headers"],
        json={
            "prescription_footer_text": "LEYENDA DE LA VISTA PREVIA",
            "prescription_accent_color": "#0F6E4F",
            "prescription_signature_style": {**ESTILO_FIRMA_POR_DEFECTO, "tamano": 20},
        },
    )

    assert respuesta.status_code == 200
    texto = _texto_del_pdf(respuesta.content)
    assert "LEYENDA DE LA VISTA PREVIA" in texto
    # El motivo se decide receta por receta en la consulta: si el ejemplo lo
    # trajera, esta pantalla diria que la receta lo imprime siempre.
    assert "MOTIVO DE CONSULTA" not in texto

    # Previsualizar sigue sin guardar nada.
    guardado = (
        db_session.query(DoctorProfile)
        .filter(DoctorProfile.id == doctora["perfil"].id)
        .first()
    )
    db_session.refresh(guardado)
    assert guardado.prescription_footer_text is None
    assert guardado.prescription_accent_color is None
    assert guardado.prescription_signature_style is None


def test_las_columnas_nuevas_son_del_tipo_que_les_toca():
    """Un color no se guarda en un entero ni un estilo en una columna suelta."""
    columnas = DoctorProfile.__table__.columns
    assert columnas["prescription_accent_color"].type.python_type is str
    assert columnas["prescription_footer_text"].type.python_type is str
    assert not isinstance(
        columnas["prescription_signature_style"].type, (Integer, Boolean)
    )
    # El motivo vive en la receta, no en el perfil de la doctora.
    assert "diagnosis" in Prescription.__table__.columns
