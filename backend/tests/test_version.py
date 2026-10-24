"""La versión de la API es la misma que muestra la interfaz (plan 32).

La fuente es ``frontend/package.json``: el pie de la interfaz la lee de ahí.
Si alguien sube una y no la otra, esta prueba lo dice antes del despliegue.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.version import APP_VERSION
from app.main import app

PAQUETE = Path(__file__).resolve().parents[2] / "frontend" / "package.json"


def test_la_api_anuncia_su_version():
    # Sin `with`: no arranca el ciclo de vida (programador, base de datos).
    respuesta = TestClient(app).get("/")
    assert respuesta.json()["version"] == APP_VERSION
    assert app.version == APP_VERSION


@pytest.mark.skipif(not PAQUETE.exists(), reason="la imagen del backend no trae el frontend")
def test_la_version_coincide_con_la_de_la_interfaz():
    version_interfaz = json.loads(PAQUETE.read_text(encoding="utf-8"))["version"]
    assert APP_VERSION == version_interfaz
