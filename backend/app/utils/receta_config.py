"""Configuración de la receta, por doctor.

Cada médico decide cómo sale **su** receta: con qué nombre firma y qué
elementos se imprimen. Todo se guarda en ``doctor_profiles``:

* ``prescription_display_name`` — el nombre tal cual debe salir impreso.
* ``prescription_settings`` — un diccionario JSON de interruptores.

**Por qué un JSON y no una columna por interruptor.** Son preferencias de
presentación: nunca se filtran ni se ordenan por ellas, y la lista crece cada
vez que ``pdf.py`` gana un elemento nuevo. Una columna suelta por interruptor
obligaría a una migración por cada casilla. Además evita de raíz el fallo que
ya tumbó producción una vez (un booleano guardado en una columna INTEGER que
PostgreSQL rechaza): en JSON se guarda un ``true``/``false`` de verdad, y el
esquema de Pydantic ``AjustesReceta`` es el que garantiza que sea booleano
antes de llegar a la base.

Las claves desconocidas y los valores que no son booleanos se descartan al
leer: una receta nunca puede dejar de imprimirse porque alguien metiera basura
en el JSON.

El estilo propio de la receta —la leyenda del pie, el color y la tipografía con
la que se firma— vive en columnas aparte y no aquí, porque no son booleanos.
El motivo está escrito abajo, junto a cada valor de fábrica.
"""

import re

from app.utils.colores import normalizar_hex

# Valores por defecto. **Reproducen exactamente lo que se imprime hoy**, con
# una sola excepción deliberada: los signos vitales, que son expediente y el
# consultorio pidió sacarlos de la receta. Así, un doctor que no toque nada
# sigue viendo su receta de siempre.
AJUSTES_RECETA_POR_DEFECTO: dict[str, bool] = {
    # Encabezado
    "mostrar_logo": True,
    "mostrar_firma": True,
    "mostrar_nombre": True,
    "mostrar_especialidad": False,
    "mostrar_cedula_profesional": False,
    "mostrar_registro_general": True,
    "mostrar_cedula_especialidad": True,
    "mostrar_registro_ssa": True,
    "mostrar_consejo": True,
    # Datos del paciente
    "mostrar_edad": True,
    "mostrar_fecha_nacimiento": True,
    "mostrar_alergias": True,
    "mostrar_signos_vitales": False,
    # Pie
    "mostrar_direccion": True,
    "mostrar_telefono": True,
    # Apagados de fábrica: son datos nuevos y ninguna receta existente debe
    # cambiar sin que el médico lo decida.
    "mostrar_correo": False,
    "mostrar_celular": False,
    "mostrar_pie_legal": True,
}

# Tratamientos que el médico puede escribir él mismo delante de su nombre. Si
# el nombre configurado ya empieza por uno, **no se antepone otro**: la nota
# del repo es clara en que ``users.full_name`` se guarda sin título justo para
# que no salga "Dr. Dr.".
_TRATAMIENTOS = (
    "dr",
    "dra",
    "doctor",
    "doctora",
    "lic",
    "mtro",
    "mtra",
    "q.f.b",
    "m.c",
    "md",
)

_TRATAMIENTO_RE = re.compile(
    r"^\s*(" + "|".join(re.escape(t) for t in _TRATAMIENTOS) + r")\.?\s",
    re.IGNORECASE,
)


def resolver_ajustes(doctor_profile) -> dict[str, bool]:
    """Ajustes efectivos de un perfil: los guardados sobre los de fábrica."""
    ajustes = dict(AJUSTES_RECETA_POR_DEFECTO)
    guardados = getattr(doctor_profile, "prescription_settings", None)
    if isinstance(guardados, dict):
        for clave, valor in guardados.items():
            if clave in ajustes and isinstance(valor, bool):
                ajustes[clave] = valor
    return ajustes


def tiene_tratamiento(nombre: str) -> bool:
    """¿El nombre ya viene con un "Dra." delante?"""
    return bool(_TRATAMIENTO_RE.match(nombre or ""))


def anteponer_tratamiento(nombre: str, usuario) -> str:
    """El nombre con el tratamiento de la usuaria, si no trae ya uno escrito.

    Si el nombre ya empieza por "Dra." (o "Lic.", etc.) no se toca: el
    "Dr. Dr." ya se vio impreso una vez. Si no, se antepone el ``tratamiento``
    capturado en la usuaria; si no hay, va el nombre solo. Antes se ponía
    "Dr. " fijo, y a los médicos les salía "Dr." en su propia receta.
    """
    limpio = (nombre or "").strip()
    if not limpio or tiene_tratamiento(limpio):
        return limpio
    tratamiento = (getattr(usuario, "tratamiento", None) or "").strip()
    return f"{tratamiento} {limpio}" if tratamiento else limpio


def nombre_para_receta(doctor_profile) -> str:
    """El nombre del médico tal como debe imprimirse, con su tratamiento.

    La Dra. Yara Montserrat Gutiérrez Romero quiere firmar como
    "Dra. Yara Gutiérrez": escribe eso en su perfil y sale eso, sin que el
    código le anteponga nada. Si no hay nombre configurado se usa
    ``users.full_name``, que se guarda **sin** tratamiento. En los dos casos,
    si el nombre no trae tratamiento escrito se antepone el de la usuaria
    (``users.tratamiento``), y si tampoco hay, el nombre va solo.
    """
    usuario = getattr(doctor_profile, "user", None)
    configurado = (getattr(doctor_profile, "prescription_display_name", None) or "").strip()
    if configurado:
        return anteponer_tratamiento(configurado, usuario)
    return anteponer_tratamiento(getattr(usuario, "full_name", None) or "", usuario)


def lineas_credenciales(doctor_profile, ajustes: dict[str, bool]) -> list[str]:
    """Las líneas de credenciales del encabezado, ya filtradas.

    Devuelve solo las que el médico dejó encendidas y que además tienen valor:
    una etiqueta "SSA" sin número no aporta nada al paciente.
    """
    especialidad = getattr(getattr(doctor_profile, "specialty", None), "name", None)
    candidatas = [
        ("mostrar_especialidad", "", especialidad),
        ("mostrar_cedula_profesional", "Céd. Prof. ", getattr(doctor_profile, "professional_id", None)),
        ("mostrar_registro_general", "R.G.P. ", getattr(doctor_profile, "general_registry", None)),
        ("mostrar_cedula_especialidad", "Céd. Esp. ", getattr(doctor_profile, "specialty_license", None)),
        ("mostrar_registro_ssa", "SSA ", getattr(doctor_profile, "health_registry", None)),
        ("mostrar_consejo", "Consejo ", getattr(doctor_profile, "council_cert", None)),
    ]
    lineas: list[str] = []
    for clave, etiqueta, valor in candidatas:
        if not ajustes.get(clave):
            continue
        texto = " ".join(str(valor or "").split()).strip()
        if not texto:
            continue
        lineas.append(f"{etiqueta}{texto}")
    return lineas


# ---------------------------------------------------------------------------
# Estilo propio: leyenda, color y tipografía de la firma
#
# Estas tres cosas van en columnas propias y NO dentro de
# ``prescription_settings``: ese diccionario es de booleanos y su esquema los
# exige estrictos (`StrictBool`, `extra="forbid"`). Meter ahí un texto o un
# color rompería la única garantía que evita el INTEGER que PostgreSQL rechazó
# una vez en producción: que lo guardado como interruptor sea un interruptor.
# ---------------------------------------------------------------------------

# La leyenda que estaba escrita dentro de ``pdf.py``.
LEYENDA_POR_DEFECTO = "CUIDAMOS TU SALUD, ACOMPAÑAMOS TU VIDA."

# Cabe en una línea del pie a 8 pt. Más largo se recorta y el médico escribe
# para nada, así que se avisa antes de guardar, no al imprimir.
LIMITE_LEYENDA = 150

# Cómo se dibuja el nombre en el bloque de la firma. Los valores de fábrica
# son los de siempre: Helvetica-Bold de 15 pt en el gris del membrete.
ESTILO_FIRMA_POR_DEFECTO: dict = {
    "fuente": "sans",
    "tamano": 15,
    "negritas": True,
    "cursiva": False,
    "color": None,
    "linea_firma": False,
}

# Familias que el médico puede elegir. "cursiva" es lo más parecido a una firma
# manuscrita; si el servidor tiene una fuente de verdad, la usa.
FUENTES_FIRMA = ("sans", "serif", "cursiva")

TAMANO_FIRMA_MIN = 10
TAMANO_FIRMA_MAX = 26

# El gris con el que se imprimía el nombre antes de esto.
COLOR_FIRMA_POR_DEFECTO = "#404040"


def resolver_leyenda(doctor_profile) -> str:
    """La leyenda del pie: la escrita por el médico o la de fábrica.

    Vacía o en blanco no es una leyenda: es una receta a la que le falta el
    pie. Se cae a la de fábrica, que es lo que se imprimía antes de que esto
    se pudiera editar.
    """
    guardada = getattr(doctor_profile, "prescription_footer_text", None)
    if isinstance(guardada, str):
        limpia = " ".join(guardada.split()).strip()
        if limpia:
            return limpia[:LIMITE_LEYENDA]
    return LEYENDA_POR_DEFECTO


def resolver_color_acento(doctor_profile) -> str | None:
    """El color elegido, ya normalizado. ``None`` si no hay o no se entiende."""
    return normalizar_hex(getattr(doctor_profile, "prescription_accent_color", None))


def normalizar_estilo_firma(datos) -> dict:
    """Un estilo completo y sin basura, para lo que sea que haya guardado.

    Un valor que no se entiende se descarta y manda el de fábrica: la receta no
    puede dejar de imprimirse porque alguien metiera un tamaño de letra en
    texto, ni salirse del papel porque metiera un 400.
    """
    estilo = dict(ESTILO_FIRMA_POR_DEFECTO)
    if not isinstance(datos, dict):
        return estilo

    fuente = datos.get("fuente")
    if isinstance(fuente, str) and fuente in FUENTES_FIRMA:
        estilo["fuente"] = fuente

    # ``bool`` es subclase de ``int`` en Python: sin esta comprobación un
    # ``True`` guardado como tamaño pasaría por un 1 válido.
    tamano = datos.get("tamano")
    if isinstance(tamano, int) and not isinstance(tamano, bool):
        estilo["tamano"] = min(max(tamano, TAMANO_FIRMA_MIN), TAMANO_FIRMA_MAX)

    for clave in ("negritas", "cursiva", "linea_firma"):
        valor = datos.get(clave)
        if isinstance(valor, bool):
            estilo[clave] = valor

    color = normalizar_hex(datos.get("color"))
    if color:
        estilo["color"] = color

    return estilo


def resolver_estilo_firma(doctor_profile) -> dict:
    """El estilo de firma efectivo del perfil."""
    return normalizar_estilo_firma(
        getattr(doctor_profile, "prescription_signature_style", None)
    )

