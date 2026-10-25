"""Módulos opcionales por consultorio (base-modulos-extra).

Lo que no puede fallar:

- con el módulo apagado, sus rutas responden 404 (no 403: no se revela que existe);
- solo admin y master lo cambian, y cada cambio queda en la bitácora;
- apagarlo no borra nada de lo que el módulo guardó;
- la pantalla solo ofrece módulos ya construidos (``disponible``).

Las pruebas inyectan módulos ficticios en el catálogo para no depender de uno
real. El único real construido es ``neuro3d_paciente`` (feat/modelo-3d-desde-tc).
"""
from typing import Annotated

import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _usuario,
    client,
    db_session,
    escenario,
)

from app.core import modulos as catalogo
from app.core.config import settings
from app.core.deps import get_db
from app.models.audit_log import AuditLog
from app.models.tenant_modulo import TenantModulo
from app.models.user import Role
from app.services import estado_servicios

FICTICIO = catalogo.ModuloOpcional(
    "ficticio", "Módulo de prueba", "Solo existe en estas pruebas.", disponible=True
)
CON_SERVICIO = catalogo.ModuloOpcional(
    "con_servicio", "Con servicio", "Necesita Orthanc.",
    servicio_requerido="orthanc", disponible=True,
)


@pytest.fixture(autouse=True)
def catalogo_de_prueba(monkeypatch):
    monkeypatch.setitem(catalogo.MODULOS_OPCIONALES, FICTICIO.id, FICTICIO)
    monkeypatch.setitem(catalogo.MODULOS_OPCIONALES, CON_SERVICIO.id, CON_SERVICIO)
    monkeypatch.setattr(settings, "ORTHANC_URL", "")


@pytest.fixture
def app_del_modulo(db_session):
    """Una app mínima con una ruta protegida por ``require_modulo``.

    Es aparte de la app real para no dejar una ruta de prueba registrada en ella.
    """
    app = FastAPI()
    ruta = APIRouter(dependencies=[Depends(catalogo.require_modulo("ficticio"))])

    @ruta.get("/ficticio/datos")
    def datos(db: Annotated[object, Depends(get_db)]):
        return {"ok": True}

    app.include_router(ruta)
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as cliente:
        yield cliente


def _cambiar(client, cabeceras, modulo, activo):
    return client.put(f"{PREFIX}/modulos/{modulo}", headers=cabeceras, json={"activo": activo})


# ── El catálogo ─────────────────────────────────────────────────────────────


# Construidos, cada uno en la rama que lo hizo.
CONSTRUIDOS = {"neuro3d_paciente"}  # feat/modelo-3d-desde-tc


def test_el_catalogo_trae_los_modulos_acordados_y_solo_los_construidos_estan_disponibles():
    reales = {k: v for k, v in catalogo.MODULOS_OPCIONALES.items() if k not in ("ficticio", "con_servicio")}
    assert set(reales) == {
        "inventario", "tareas", "encuestas", "interoperabilidad", "patologia", "ecg",
        "goniometro", "telemedicina", "whatsapp",
        "pacs_orthanc", "dictado", "asistente_ia", "laboratorios_ocr", "neuro3d_paciente",
    }
    assert {k for k, m in reales.items() if m.disponible} == CONSTRUIDOS
    assert all(not m.activo_por_defecto for m in reales.values())
    for requiere in ("pacs_orthanc", "dictado", "asistente_ia", "neuro3d_paciente"):
        assert reales[requiere].servicio_requerido
    assert reales["laboratorios_ocr"].servicio_requerido is None


def test_la_lista_solo_ofrece_modulos_construidos(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["admin"])
    respuesta = client.get(f"{PREFIX}/modulos", headers=cabeceras)
    assert respuesta.status_code == 200
    ids = {m["id"] for m in respuesta.json()["modulos"]}
    assert ids == {"ficticio", "con_servicio"} | CONSTRUIDOS
    assert respuesta.json()["activos"] == []


def test_un_modulo_no_construido_no_se_puede_encender(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["admin"])
    assert _cambiar(client, cabeceras, "inventario", True).status_code == 404
    assert _cambiar(client, cabeceras, "no-existe", True).status_code == 404
    assert db_session.query(TenantModulo).count() == 0


# ── require_modulo ──────────────────────────────────────────────────────────


def test_modulo_apagado_responde_404_y_encendido_200(client, app_del_modulo, db_session, escenario):
    medico = _auth_headers(db_session, escenario["doctora"])
    apagado = app_del_modulo.get("/ficticio/datos", headers=medico)
    assert apagado.status_code == 404
    assert apagado.json()["detail"] == catalogo.MENSAJE_MODULO_INACTIVO

    admin = _auth_headers(db_session, escenario["admin"])
    assert _cambiar(client, admin, "ficticio", True).status_code == 200
    assert app_del_modulo.get("/ficticio/datos", headers=medico).status_code == 200


def test_el_modulo_se_enciende_solo_en_su_consultorio(client, app_del_modulo, db_session, escenario):
    admin = _auth_headers(db_session, escenario["admin"])
    assert _cambiar(client, admin, "ficticio", True).status_code == 200
    ajena = _auth_headers(db_session, escenario["doctora_ajena"])
    assert app_del_modulo.get("/ficticio/datos", headers=ajena).status_code == 404
    assert client.get(f"{PREFIX}/modulos", headers=ajena).json()["activos"] == []


# ── Quién lo cambia ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("quien", ["doctora", "secretaria"])
def test_ni_el_medico_ni_recepcion_cambian_modulos(client, db_session, escenario, quien):
    cabeceras = _auth_headers(db_session, escenario[quien])
    assert _cambiar(client, cabeceras, "ficticio", True).status_code == 403
    assert db_session.query(TenantModulo).count() == 0
    # Leer sí: el menú lo necesita.
    assert client.get(f"{PREFIX}/modulos", headers=cabeceras).status_code == 200


def test_admin_y_master_cambian_modulos(client, db_session, escenario):
    master = _usuario(db_session, escenario["tenant"], "master@cortex.test", Role.MASTER)
    admin = _auth_headers(db_session, escenario["admin"])
    assert _cambiar(client, admin, "ficticio", True).json()["activo"] is True
    respuesta = _cambiar(client, _auth_headers(db_session, master), "ficticio", False)
    assert respuesta.status_code == 200
    assert respuesta.json()["activo"] is False


def test_cada_cambio_queda_en_la_bitacora(client, db_session, escenario):
    admin = _auth_headers(db_session, escenario["admin"])
    _cambiar(client, admin, "ficticio", True)
    _cambiar(client, admin, "ficticio", True)  # sin cambio: no deja huella
    _cambiar(client, admin, "ficticio", False)
    huellas = db_session.query(AuditLog).filter(AuditLog.entity_type == "tenant_modulo").order_by(AuditLog.id).all()
    assert [h.action for h in huellas] == ["modulo.activado", "modulo.desactivado"]
    assert huellas[0].actor_user_id == escenario["admin"].id
    assert huellas[0].tenant_id == escenario["admin"].tenant_id
    assert huellas[1].details == {"modulo": "ficticio", "activo": False, "anterior": True}


def test_apagar_no_borra_nada(client, db_session, escenario):
    admin = _auth_headers(db_session, escenario["admin"])
    _cambiar(client, admin, "ficticio", True)
    total_bitacora = db_session.query(AuditLog).count()
    _cambiar(client, admin, "ficticio", False)
    fila = db_session.query(TenantModulo).one()
    assert fila.activo is False
    # La bitácora solo crece y el paciente del escenario sigue ahí.
    assert db_session.query(AuditLog).count() == total_bitacora + 1
    assert escenario["paciente"].id is not None
    _cambiar(client, admin, "ficticio", True)
    assert db_session.query(TenantModulo).one().id == fila.id


def test_no_se_enciende_sin_su_servicio(client, db_session, escenario, monkeypatch):
    admin = _auth_headers(db_session, escenario["admin"])
    respuesta = _cambiar(client, admin, "con_servicio", True)
    assert respuesta.status_code == 409
    assert "servicio" in respuesta.json()["detail"]
    lista = client.get(f"{PREFIX}/modulos", headers=admin).json()["modulos"]
    assert {m["id"]: m["servicio_configurado"] for m in lista}["con_servicio"] is False

    monkeypatch.setattr(settings, "ORTHANC_URL", "http://orthanc:8042")
    assert _cambiar(client, admin, "con_servicio", True).status_code == 200


# ── Estado de servicios ─────────────────────────────────────────────────────


@pytest.fixture
def sin_servicios(monkeypatch):
    for variable in ("ORTHANC_URL", "WHISPER_URL", "PRESIDIO_URL", "SEGMENTADOR_URL"):
        monkeypatch.setattr(settings, variable, "")
    monkeypatch.setattr(settings, "IA_PROVEEDOR", "ninguno")


def test_sin_configurar_todo_sale_no_configurado(client, db_session, escenario, sin_servicios):
    admin = _auth_headers(db_session, escenario["admin"])
    respuesta = client.get(f"{PREFIX}/servicios/estado", headers=admin)
    assert respuesta.status_code == 200
    estados = {s["id"]: s["estado"] for s in respuesta.json()}
    assert estados == {
        "orthanc": "no_configurado", "whisper": "no_configurado", "presidio": "no_configurado",
        "segmentador": "no_configurado", "ia": "no_configurado",
    }


def test_un_servicio_que_no_contesta_sale_sin_respuesta(sin_servicios, monkeypatch):
    # Puerto 9 (discard) en localhost: se rechaza al instante, sin esperar el límite.
    monkeypatch.setattr(settings, "WHISPER_URL", "http://127.0.0.1:9")
    estados = {s["id"]: s["estado"] for s in estado_servicios.estado_de_servicios()}
    assert estados["whisper"] == "sin_respuesta"


def test_la_ia_configurada_no_se_da_por_en_linea(sin_servicios, monkeypatch):
    monkeypatch.setattr(settings, "IA_PROVEEDOR", "deepseek")
    ia = next(s for s in estado_servicios.estado_de_servicios() if s["id"] == "ia")
    assert ia["estado"] == "configurado"


def test_solo_admin_ve_el_estado_de_servicios(client, db_session, escenario, sin_servicios):
    medico = _auth_headers(db_session, escenario["doctora"])
    assert client.get(f"{PREFIX}/servicios/estado", headers=medico).status_code == 403


# ── Configuración de producción ─────────────────────────────────────────────


def _ajustes_de_produccion(**extra):
    from app.core.config import Settings

    return Settings(
        DATABASE_URL="postgresql://x:y@localhost/z",
        SECRET_KEY="k" * 40,
        ENVIRONMENT="production",
        CORS_ORIGINS="https://cortex.example",
        FRONTEND_URL="https://cortex.example",
        **extra,
    )


def test_produccion_exige_llave_si_el_proveedor_es_remoto():
    with pytest.raises(ValueError, match="IA_API_KEY"):
        _ajustes_de_produccion(IA_PROVEEDOR="deepseek")
    assert _ajustes_de_produccion(IA_PROVEEDOR="deepseek", IA_API_KEY="sk-prueba")
    assert _ajustes_de_produccion(IA_PROVEEDOR="ollama")
    assert _ajustes_de_produccion()
