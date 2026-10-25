"""Traduce al español los errores de validación que Pydantic devuelve en inglés.

Por qué existe este módulo
--------------------------
Cuando un dato no cuadra con el schema, FastAPI ni siquiera llega al router:
Pydantic corta antes y responde un 422 con textos suyos, en inglés y con el
nombre técnico del campo:

    {"detail": [{"loc": ["body", "duration_minutes"],
                 "msg": "Input should be a valid integer",
                 "type": "int_parsing"}]}

Eso no se arregla router por router, porque ningún router se ejecuta. Se
arregla en un solo sitio: un manejador de ``RequestValidationError`` en
``app/main.py`` que pasa por aquí cada error.

Qué se devuelve
---------------
Se conserva la **forma** que ya sabe leer el frontend (una lista al estilo de
Pydantic, ver ``frontend/src/shared/utils/errors.ts``): cada entrada mantiene
su ``loc`` y su ``type`` para quien tenga que depurar, y lo que cambia es el
``msg``, que pasa a estar en español y a nombrar el campo como se ve en la
pantalla, no como se llama en la base de datos.

Regla de la guía de diseño: nada de jerga. Si un campo no está en el
diccionario de etiquetas, el mensaje **no enseña su nombre técnico**; dice que
hay un dato mal y deja el ``loc`` en el cuerpo de la respuesta para soporte.
"""
from typing import Any, Dict, List, Optional, Sequence

# --- Cómo se llama cada campo para quien usa el sistema ---------------------
#
# La clave es el nombre del campo en el schema; el valor, el nombre que lleva
# la etiqueta en la pantalla. Un campo que no esté aquí no se nombra: se
# prefiere un mensaje genérico antes que enseñar "blood_pressure_systolic".

ETIQUETAS: Dict[str, str] = {
    # Sesión y cuentas
    "email": "Correo electrónico",
    "personal_email": "Correo personal",
    "password": "Contraseña",
    "current_password": "Contraseña actual",
    "new_password": "Contraseña nueva",
    "full_name": "Nombre completo",
    "role": "Rol",
    "base_role": "Rol base",
    "user_id": "Usuario",
    "username": "Usuario",
    "is_active": "Activo",
    "token": "Código",
    "refresh_token": "Sesión",
    # Paciente
    "patient_id": "Paciente",
    "first_name": "Nombre",
    "last_name": "Apellidos",
    "date_of_birth": "Fecha de nacimiento",
    "gender": "Sexo",
    "phone": "Teléfono",
    "cell_phone": "Celular",
    "address": "Dirección",
    "allergies": "Alergias",
    "blood_type": "Tipo de sangre",
    "religion": "Religión",
    "patient_type": "Tipo de paciente",
    "notas_referencia": "Notas de referencia",
    "expediente_legacy": "Número de expediente",
    "personal_history": "Antecedentes personales",
    "family_history": "Antecedentes familiares",
    "gynecological_history": "Antecedentes ginecológicos",
    "dominant_hand": "Lateralidad",
    "neurological_history": "Antecedentes neurológicos",
    "implanted_devices": "Implantes y dispositivos",
    "anticoagulants": "Anticoagulantes",
    "owner_doctor_id": "Doctor responsable",
    "menarca_age": "Edad de la menarca",
    "menstrual_rhythm": "Ritmo menstrual",
    "ivsa_age": "Edad de inicio de vida sexual",
    "birth_control": "Método anticonceptivo",
    "last_menstrual_period": "Fecha de la última regla",
    "expected_delivery_date": "Fecha probable de parto",
    "gestas": "Embarazos",
    "paras": "Partos",
    "cesareas": "Cesáreas",
    "abortos": "Abortos",
    # Cita
    "appointment_id": "Cita",
    "doctor_id": "Doctor",
    "room_id": "Sala",
    "room_name": "Nombre de la sala",
    "scheduled_at": "Fecha y hora de la cita",
    "duration_minutes": "Duración en minutos",
    "duration_hours": "Duración en horas",
    "appointment_type": "Tipo de cita",
    "motivo_extra": "Motivo de la cita",
    "status": "Estado",
    "notes": "Notas",
    "cancellation_reason": "Motivo de la cancelación",
    "cirugia_type": "Tipo de cirugía",
    "hospital": "Hospital",
    "anestesiologo": "Anestesiólogo",
    "preop_notes": "Notas pre-operatorias",
    "postop_notes": "Notas post-operatorias",
    "reason": "Motivo",
    # Signos vitales (triage)
    "weight_kg": "Peso en kilos",
    "maternal_weight_kg": "Peso de la mamá en kilos",
    "height_cm": "Estatura en centímetros",
    "blood_pressure_systolic": "Presión sistólica (la alta)",
    "blood_pressure_diastolic": "Presión diastólica (la baja)",
    "systolic_bp": "Presión sistólica (la alta)",
    "diastolic_bp": "Presión diastólica (la baja)",
    "temperature_celsius": "Temperatura",
    "chief_complaint": "Motivo de la consulta",
    "observations": "Observaciones",
    # Nota de consulta
    "subjective": "Lo que refiere el paciente",
    "objective": "Exploración",
    "assessment": "Diagnóstico",
    "plan": "Plan",
    "plan_notes": "Notas del plan",
    "diagnosis": "Diagnóstico",
    "findings": "Hallazgos",
    "summary": "Resumen",
    "next_review_on": "Próxima revisión",
    "next_visit_on": "Próxima visita",
    "follow_up_on": "Seguimiento",
    # Receta y medicamentos
    "prescription_id": "Receta",
    "medications": "Medicamentos",
    "medication_name": "Medicamento",
    "generic_name": "Nombre genérico",
    "brand_name": "Nombre comercial",
    "active_ingredient": "Sustancia activa",
    "presentation": "Presentación",
    "dose": "Dosis",
    "frequency": "Frecuencia",
    "duration": "Duración",
    "route": "Vía de administración",
    "instructions": "Indicaciones",
    "indication": "Indicación",
    # Certificados y consentimientos
    "certificate_type": "Tipo de certificado",
    "consent_type": "Tipo de consentimiento",
    "consent_id": "Consentimiento",
    "acknowledgements": "Puntos que el paciente debe confirmar",
    "patient_signed_name": "Nombre de quien firma",
    "signature_data_url": "Firma",
    "folio_number": "Folio",
    "start_date": "Fecha inicial",
    "end_date": "Fecha final",
    "start_at": "Inicio",
    "end_at": "Fin",
    "start_time": "Hora de inicio",
    "end_time": "Hora de fin",
    "starts_at": "Inicio",
    "expires_at": "Vencimiento",
    # Embarazo y control prenatal
    "pregnancy_id": "Embarazo",
    "fetus_count": "Número de fetos",
    "is_multiple_gestation": "Embarazo múltiple",
    "gestational_age_weeks": "Semanas de embarazo",
    "estimated_delivery_date": "Fecha probable de parto",
    "ultrasound_date": "Fecha del ultrasonido",
    "visit_date": "Fecha de la visita",
    "fundal_height_cm": "Altura del fondo uterino",
    "fetal_heart_rate_bpm": "Frecuencia cardiaca fetal",
    "fetal_movements": "Movimientos fetales",
    "fetal_presentation": "Presentación fetal",
    "estimated_weight_g": "Peso fetal estimado",
    "sequence_number": "Número de feto",
    # Estudios y documentos
    "study_name": "Estudio",
    "study_date": "Fecha del estudio",
    "document_type": "Tipo de documento",
    "file_name": "Nombre del archivo",
    "mime_type": "Tipo de archivo",
    "category": "Categoría",
    "caption": "Descripción de la imagen",
    "title": "Título",
    "description": "Descripción",
    "results": "Resultados",
    "report_text": "Reporte",
    "lab_name": "Laboratorio",
    # Pagos y servicios
    "amount": "Importe",
    "total_amount": "Importe total",
    "price": "Precio",
    "method": "Forma de pago",
    "service_id": "Servicio",
    "service_name": "Servicio",
    "code": "Clave",
    "paid_at": "Fecha del pago",
    "referencia": "Referencia de la terminal",
    "motivo": "Motivo",
    "modo": "Cómo se cobra",
    # Sucursales, salas y agenda
    "tenant_id": "Sucursal",
    "name": "Nombre",
    "slug": "Identificador corto",
    "display_order": "Orden",
    "weekday": "Día de la semana",
    "day": "Día",
    "days_off": "Días de descanso",
    "step_minutes": "Intervalo en minutos",
    "specialty_id": "Especialidad",
    "specialty": "Especialidad",
    "specialty_license": "Cédula de especialidad",
    "professional_id": "Cédula profesional",
    "university": "Universidad",
    "clinic_address": "Dirección del consultorio",
    "logo_url": "Logotipo",
    "custom_role_id": "Rol personalizado",
    "message": "Mensaje",
    "priority": "Prioridad",
    "skip": "Página",
    "limit": "Cantidad por página",
    # Escalas neurológicas (Cortex, feat/escalas-neuro)
    "escala": "Escala",
    "version_escala": "Versión de la escala",
    "respuestas": "Respuestas de la escala",
    "aplicada_en": "Fecha en que se aplicó",
    "notas": "Notas de la escala",
    "incluir_anuladas": "Incluir anuladas",
    # Columna desde radiografías (Cortex, feat/columna-desde-radiografias)
    "puntos": "Puntos marcados",
    "calibracion": "Escala de la radiografía",
    "opciones": "Opciones del ajuste",
    "lateral": "Radiografía lateral",
    "ap": "Radiografía AP",
    "tipo": "Tipo de imagen",
    "incluir_anulados": "Incluir anulados",
}

# --- Cómo se llaman los valores que acepta cada lista -----------------------
#
# Pydantic enumera los valores permitidos con su nombre técnico
# ("'cash', 'card', 'transfer' or 'other'"). Se traducen para que el mensaje
# diga lo mismo que dicen los desplegables de la pantalla.

VALORES: Dict[str, str] = {
    # Cita
    "consulta": "Consulta",
    "cirugia": "Cirugía",
    "procedimiento": "Procedimiento",
    "agendada": "Agendada",
    "confirmada": "Confirmada",
    "en_sala": "En sala",
    "en_consulta": "En consulta",
    "cancelada": "Cancelada",
    "atendida": "Atendida",
    # Pagos
    "cash": "Efectivo",
    "card": "Tarjeta",
    "transfer": "Transferencia",
    "other": "Otro",
    # Cuentas
    "master": "Master",
    "admin": "Administración",
    "secretaria": "Secretaría",
    "doctor": "Doctor",
    # Consentimientos
    "draft": "Borrador",
    "signed": "Firmado",
    "rejected": "Rechazado",
    "revoked": "Revocado",
    "cancelled": "Cancelado",
    # Episodios clínicos
    "active": "Activo",
    "monitoring": "En vigilancia",
    "resolved": "Resuelto",
    "archived": "Archivado",
    "completed": "Terminado",
    # Documentos e imágenes
    "lab_result": "Resultado de laboratorio",
    "imaging_study": "Estudio de imagen",
    "external_note": "Nota externa",
    "clinical_photo": "Foto clínica",
    "reference": "Referencia",
    "ultrasound": "Ultrasonido",
    "procedure": "Procedimiento",
    # Certificados
    "sick_leave": "Incapacidad",
    "fitness": "Aptitud",
    # Equipo tratante
    "collaborator": "Colaborador",
    "assistant": "Auxiliar",
    "temporary": "Temporal",
    # Prerregistro
    "pending": "Pendiente",
    "contacted": "Contactada",
    "converted": "Convertida",
    "discarded": "Descartada",
    # Feto
    "reported": "Referidos",
    "not_reported": "No referidos",
    "not_assessed": "No valorado",
    "cephalic": "Cefálica",
    "breech": "Pélvica",
    "transverse": "Transversa",
}

# Nombre genérico cuando el campo no está en el diccionario: antes eso que
# enseñar "blood_pressure_systolic" a quien atiende el mostrador.
CAMPO_DESCONOCIDO = "uno de los datos"


def etiqueta_de_campo(loc: Sequence[Any]) -> Optional[str]:
    """Nombre en español del campo que falla, o None si no se sabe cómo se llama.

    ``loc`` viene de FastAPI con el origen delante (``body``, ``query``,
    ``path``...) y puede llevar índices cuando el dato va dentro de una lista:
    ``("body", "medications", 0, "dose")``. Se busca de derecha a izquierda el
    primer nombre reconocible, que es el más concreto.
    """
    partes = [p for p in loc if isinstance(p, str) and p not in ("body", "query", "path", "header", "cookie")]
    for parte in reversed(partes):
        if parte in ETIQUETAS:
            return ETIQUETAS[parte]
    return None


def posicion_en_lista(loc: Sequence[Any]) -> Optional[int]:
    """Número de renglón (empezando en 1) cuando el dato va dentro de una lista."""
    indices = [p for p in loc if isinstance(p, int) and not isinstance(p, bool)]
    return indices[-1] + 1 if indices else None


def _valores_permitidos(esperado: Any) -> str:
    """Traduce el "'cash', 'card' or 'other'" de Pydantic a la lista en español.

    Lo que no esté en el diccionario se deja tal cual: es preferible un valor
    sin traducir a perderlo de la lista.
    """
    texto = str(esperado)
    crudos: List[str] = []
    for trozo in texto.replace(" or ", ", ").split(","):
        limpio = trozo.strip().strip("'\"")
        if limpio:
            crudos.append(VALORES.get(limpio, limpio))
    if not crudos:
        return texto
    if len(crudos) == 1:
        return crudos[0]
    # "A, B o C". Con "o" delante de palabra que empieza por o-/ho-, "u".
    ultimo = crudos[-1]
    conjuncion = "u" if ultimo[:1].lower() in ("o",) or ultimo[:2].lower() == "ho" else "o"
    return f"{', '.join(crudos[:-1])} {conjuncion} {ultimo}"


def _numero(valor: Any) -> str:
    """Los límites enteros se escriben sin el .0 que arrastra Pydantic."""
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor)


def mensaje_de_error(error: Dict[str, Any]) -> str:
    """Frase en español para un error suelto de Pydantic.

    Se traduce **por el `type`**, no por el texto inglés: el `type` es estable
    entre versiones de Pydantic y el texto no.
    """
    tipo = str(error.get("type", ""))
    ctx = error.get("ctx") or {}
    loc = error.get("loc") or ()

    nombre = etiqueta_de_campo(loc)
    campo = f"«{nombre}»" if nombre else CAMPO_DESCONOCIDO
    renglon = posicion_en_lista(loc)
    coletilla = f" (renglón {renglon})" if renglon else ""

    if tipo == "missing":
        cuerpo = (
            f"Falta llenar {campo}{coletilla}."
            if nombre
            else f"Falta llenar {campo}{coletilla}. Revisa que no hayas dejado nada en blanco."
        )
    elif tipo in ("int_parsing", "int_type", "int_from_float"):
        cuerpo = f"{campo}{coletilla} debe ser un número entero, sin letras ni decimales."
    elif tipo in ("float_parsing", "float_type", "decimal_parsing", "decimal_type"):
        cuerpo = f"{campo}{coletilla} debe ser un número. Usa punto para los decimales."
    elif tipo in ("bool_parsing", "bool_type"):
        cuerpo = f"{campo}{coletilla} solo puede ser sí o no."
    elif tipo in ("string_type", "string_pattern_mismatch"):
        cuerpo = f"{campo}{coletilla} no tiene el formato correcto."
    elif tipo == "string_too_short":
        minimo = ctx.get("min_length")
        cuerpo = (
            f"{campo}{coletilla} es demasiado corto: escribe al menos {_numero(minimo)} caracteres."
            if minimo is not None
            else f"{campo}{coletilla} es demasiado corto."
        )
    elif tipo == "string_too_long":
        maximo = ctx.get("max_length")
        cuerpo = (
            f"{campo}{coletilla} es demasiado largo: no puede pasar de {_numero(maximo)} caracteres."
            if maximo is not None
            else f"{campo}{coletilla} es demasiado largo."
        )
    elif tipo in ("greater_than", "greater_than_equal"):
        limite = ctx.get("gt", ctx.get("ge"))
        minimo = "mayor que" if tipo == "greater_than" else "de al menos"
        cuerpo = f"{campo}{coletilla} debe ser {minimo} {_numero(limite)}."
    elif tipo in ("less_than", "less_than_equal"):
        limite = ctx.get("lt", ctx.get("le"))
        maximo = "menor que" if tipo == "less_than" else "como máximo"
        cuerpo = f"{campo}{coletilla} debe ser {maximo} {_numero(limite)}."
    elif tipo in ("too_short", "too_long"):
        cuerpo = (
            f"{campo}{coletilla} no tiene la cantidad de elementos que se espera."
        )
    elif tipo in ("enum", "literal_error"):
        opciones = _valores_permitidos(ctx.get("expected", ""))
        cuerpo = f"{campo}{coletilla} solo puede ser: {opciones}."
    elif tipo in ("datetime_parsing", "datetime_type", "datetime_from_date_parsing"):
        cuerpo = f"{campo}{coletilla} no es una fecha y hora válida."
    elif tipo in ("date_parsing", "date_type", "date_from_datetime_parsing", "date_from_datetime_inexact"):
        cuerpo = f"{campo}{coletilla} no es una fecha válida."
    elif tipo in ("time_parsing", "time_type"):
        cuerpo = f"{campo}{coletilla} no es una hora válida."
    elif tipo in ("list_type", "tuple_type", "set_type"):
        cuerpo = f"{campo}{coletilla} debe venir como una lista."
    elif tipo in ("dict_type", "model_type", "model_attributes_type"):
        cuerpo = f"{campo}{coletilla} no llegó con la estructura que se espera."
    elif tipo == "extra_forbidden":
        cuerpo = f"Se envió {campo}{coletilla}, que no corresponde a este formulario."
    elif tipo == "json_invalid":
        cuerpo = "La información no llegó completa. Vuelve a intentarlo."
    elif tipo == "value_error":
        # Los validadores propios ya escriben su mensaje; Pydantic le antepone
        # "Value error, ". Se le quita y se respeta lo que escribió el schema.
        propio = str(error.get("msg", "")).replace("Value error, ", "").strip()
        cuerpo = propio or f"{campo}{coletilla} no es válido."
    elif tipo in ("url_parsing", "url_type", "url_syntax_violation"):
        cuerpo = f"{campo}{coletilla} no es una dirección web válida."
    elif tipo in ("uuid_parsing", "uuid_type"):
        cuerpo = f"{campo}{coletilla} no tiene un identificador válido."
    else:
        cuerpo = f"{campo}{coletilla} no es válido."

    if not nombre and tipo != "value_error":
        cuerpo += " Revisa el formulario."
    return cuerpo


def traducir_errores(errores: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Traduce la lista entera conservando la forma que lee el frontend.

    Cada entrada mantiene su ``loc`` y su ``type`` (útiles para soporte) y
    cambia solo el ``msg``. Se quitan los repetidos: dos reglas que fallan
    sobre el mismo campo con el mismo texto se dicen una sola vez.
    """
    traducidos: List[Dict[str, Any]] = []
    vistos = set()
    for error in errores:
        msg = mensaje_de_error(error)
        loc = list(error.get("loc") or ())
        clave = (tuple(str(p) for p in loc), msg)
        if clave in vistos:
            continue
        vistos.add(clave)
        traducidos.append({"loc": loc, "msg": msg, "type": error.get("type", "")})
    return traducidos


def resumen(errores: Sequence[Dict[str, Any]]) -> str:
    """Todos los fallos en una sola frase, para pintarlos de un tirón."""
    mensajes = [e["msg"] for e in errores]
    return " ".join(mensajes) if mensajes else "Revisa los datos del formulario."
