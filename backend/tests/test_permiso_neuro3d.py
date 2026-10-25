"""Permiso del Atlas Neuro 3D (tramo C).

El atlas es un modelo anatómico esquemático: no lee ni escribe nada del
expediente. Por eso es un permiso aparte y no viene con ``clinical_images.read``:
se puede dar el atlas a quien explica sin abrirle las imágenes del paciente, y
quitárselo sin tocar nada clínico. Guardar una captura en el expediente sigue
pidiendo ``clinical_images.upload``.
"""
from app.models.permission import (
    ALL_PERMISSIONS,
    ROLE_DEFAULT_PERMISSIONS,
    get_default_permissions,
)


def test_el_permiso_existe_en_el_catalogo_con_descripcion_en_espanol():
    assert ALL_PERMISSIONS["neuro3d.read"] == "Ver el atlas Neuro 3D"


def test_lo_tienen_por_omision_el_medico_la_administracion_y_master():
    for rol in ("doctor", "admin", "master"):
        assert "neuro3d.read" in get_default_permissions(rol), rol


def test_recepcion_no_lo_tiene_por_omision():
    # Recepción no explica lesiones; si un consultorio lo quiere, se concede
    # por usuario desde Master.
    assert "neuro3d.read" not in ROLE_DEFAULT_PERMISSIONS["secretaria"]


def test_no_arrastra_permisos_de_imagen_clinica():
    # Ver el atlas no debe abrir ni subir imágenes del paciente.
    nombre = "neuro3d.read"
    assert not nombre.startswith("clinical_images.")
    assert "clinical_images.upload" not in get_default_permissions("admin")
