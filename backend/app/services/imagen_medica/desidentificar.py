"""Quitar la identidad de un corte DICOM al compartirlo fuera del sistema.

Un enlace temporal le da el estudio a alguien que no es del consultorio. El
archivo original lleva el nombre del paciente, su fecha de nacimiento y hasta el
hospital en sus cabeceras, y un visor cualquiera las muestra. Por eso lo que se
sirve por el enlace pasa por aquí: se vacían esos campos y se quitan las
etiquetas privadas del fabricante, donde a veces se guarda de todo.

Se conserva lo que hace útil la imagen: los píxeles tal cual, la geometría, el
espaciado, la ventana, la fecha del estudio y las descripciones de serie. La
fecha se queda a propósito: sin ella no se puede comparar con un previo, y es la
decisión clínica que justifica compartir. El original guardado en el
consultorio **no se toca**: esto trabaja sobre una copia en memoria.

Límite que no se puede resolver aquí: el texto «quemado» dentro de los píxeles
(a algunos equipos les gusta imprimir el nombre sobre la imagen). Se puede
detectar si el equipo lo declara (``BurnedInAnnotation``) y avisar, no borrar.
"""
from io import BytesIO

import pydicom

# Campos que identifican al paciente, a quien lo atendió o dónde. Se vacían (en
# vez de quitarse) para que el archivo siga siendo DICOM válido.
_VACIAR = (
    "PatientName",
    "PatientID",
    "PatientBirthDate",
    "PatientBirthTime",
    "PatientAddress",
    "PatientTelephoneNumbers",
    "PatientMotherBirthName",
    "OtherPatientIDs",
    "OtherPatientNames",
    "PatientComments",
    "ReferringPhysicianName",
    "PerformingPhysicianName",
    "OperatorsName",
    "PhysiciansOfRecord",
    "NameOfPhysiciansReadingStudy",
    "RequestingPhysician",
    "InstitutionName",
    "InstitutionAddress",
    "InstitutionalDepartmentName",
    "StationName",
    "AccessionNumber",
    "StudyID",
    "DeviceSerialNumber",
    "ImageComments",
)

# Secuencias que repiten datos de la orden o del paciente.
_QUITAR = (
    "RequestAttributesSequence",
    "ReferencedPatientSequence",
    "OtherPatientIDsSequence",
)

NOMBRE_ANONIMO = "ANONIMO"


def desidentificar(contenido: bytes) -> bytes:
    """Devuelve una copia del corte sin datos de identidad.

    Lanza ``ValueError`` si los bytes no son un DICOM legible: es preferible un
    error a servir, por descuido, el original con su nombre.
    """
    try:
        ds = pydicom.dcmread(BytesIO(contenido), force=False)
    except Exception as error:  # pydicom lanza varios tipos según el daño
        raise ValueError("El corte no es un DICOM legible.") from error

    for nombre in _VACIAR:
        if nombre in ds:
            ds.data_element(nombre).value = ""
    ds.PatientName = NOMBRE_ANONIMO
    ds.PatientID = NOMBRE_ANONIMO
    for nombre in _QUITAR:
        if nombre in ds:
            delattr(ds, nombre)
    ds.remove_private_tags()
    # Dice, dentro del propio archivo, que ya pasó por este proceso.
    ds.PatientIdentityRemoved = "YES"
    ds.DeidentificationMethod = "Cortex: perfil basico (nombre, ID, nacimiento, medicos, institucion)"

    salida = BytesIO()
    ds.save_as(salida)
    return salida.getvalue()


def declara_texto_grabado(contenido: bytes) -> bool:
    """¿El equipo declara que imprimió texto sobre los píxeles?

    Sólo lee la cabecera. ``False`` no garantiza que no lo haya: significa que el
    equipo no lo declaró.
    """
    try:
        ds = pydicom.dcmread(BytesIO(contenido), stop_before_pixels=True, force=False)
    except Exception:
        return False
    return str(getattr(ds, "BurnedInAnnotation", "")).upper() == "YES"
