"""La cadena de migraciones tiene una sola cabeza.

Varias ramas crean migraciones en paralelo (plan 32). Si dos nacen de la misma
revisión, ``alembic upgrade head`` se niega a correr en el despliegue y el
backend no arranca. Esta prueba lo detecta en el CI, antes de llegar al
servidor.

Se leen los archivos en vez de usar ``alembic.script``: dentro de pytest la
carpeta ``backend/alembic`` tapa al paquete instalado y su import falla.
"""
import ast
from pathlib import Path

VERSIONES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _revisiones():
    for archivo in sorted(VERSIONES.glob("*.py")):
        valores = {}
        for nodo in ast.parse(archivo.read_text(encoding="utf-8")).body:
            if isinstance(nodo, (ast.Assign, ast.AnnAssign)):
                destinos = nodo.targets if isinstance(nodo, ast.Assign) else [nodo.target]
                for destino in destinos:
                    if isinstance(destino, ast.Name) and destino.id in ("revision", "down_revision"):
                        valores[destino.id] = ast.literal_eval(nodo.value)
        if "revision" in valores:
            yield archivo.name, valores["revision"], valores.get("down_revision")


def test_las_migraciones_tienen_una_sola_cabeza():
    revisiones = list(_revisiones())
    assert revisiones, "No se encontró ninguna migración"
    padres = set()
    for _, _, abajo in revisiones:
        if isinstance(abajo, (tuple, list)):
            padres.update(abajo)
        elif abajo:
            padres.add(abajo)
    cabezas = [f"{nombre} ({rev})" for nombre, rev, _ in revisiones if rev not in padres]
    assert len(cabezas) == 1, f"Hay {len(cabezas)} cabezas de Alembic: {cabezas}. Re-encadena la más nueva."


def test_cada_down_revision_existe():
    conocidas = {rev for _, rev, _ in _revisiones()}
    for nombre, _, abajo in _revisiones():
        for padre in (abajo if isinstance(abajo, (tuple, list)) else [abajo]):
            assert padre is None or padre in conocidas, f"{nombre} apunta a {padre}, que no existe"
