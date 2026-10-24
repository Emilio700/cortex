"""El pipeline corre las tres verificaciones y gatea develop (T-01).

No es código de la aplicación, así que se prueba leyendo la configuración: si
alguien quita una de las tres verificaciones del workflow, o deja de gatear
develop, o borra el script local, estas pruebas fallan. Es la barrera de "push
con error de tipo o prueba rota no llega a develop".
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
WORKFLOW = RAIZ / ".github" / "workflows" / "production-readiness.yml"
SCRIPT_LOCAL = RAIZ / "scripts" / "verificar_todo.ps1"


def test_el_workflow_corre_las_tres_verificaciones():
    texto = WORKFLOW.read_text(encoding="utf-8")
    assert "npm run type-check" in texto, "falta tsc --noEmit (type-check) en el pipeline"
    assert "npm run test" in texto, "falta vitest (npm run test) en el pipeline"
    assert "pytest" in texto, "falta pytest en el pipeline"


def test_el_workflow_gatea_develop_en_push():
    texto = WORKFLOW.read_text(encoding="utf-8")
    # develop tiene que estar entre las ramas que disparan el push, para que un
    # push con algo roto no aterrice en la rama de integracion.
    assert "develop" in texto, "el pipeline no gatea develop en push"


def test_existe_el_verificador_local_con_las_tres():
    assert SCRIPT_LOCAL.exists(), "falta scripts/verificar_todo.ps1"
    texto = SCRIPT_LOCAL.read_text(encoding="utf-8")
    assert "type-check" in texto
    assert "npm run test" in texto
    assert "pytest" in texto
