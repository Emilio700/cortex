/**
 * Traduce los errores de la API a mensajes entendibles en español.
 *
 * Sin esto, axios propaga textos como "Request failed with status code 401",
 * que no le dicen nada a quien usa el sistema a diario.
 */
const MENSAJES_POR_ESTADO: Record<number, string> = {
  400: 'Los datos enviados no son válidos. Revísalos e intenta de nuevo.',
  401: 'Correo o contraseña incorrectos.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No se encontró la información solicitada.',
  409: 'Ese registro ya existe o está en conflicto con otro.',
  422: 'Falta información o algún dato tiene un formato incorrecto.',
  429: 'Demasiados intentos. Espera un minuto y vuelve a intentar.',
  500: 'Ocurrió un error en el sistema. Si continúa, avisa al equipo de soporte.',
  502: 'El sistema no está respondiendo. Intenta de nuevo en un momento.',
  503: 'El sistema no está disponible por el momento. Intenta más tarde.',
}

/**
 * Devuelve el mensaje del backend si viene en español y es legible; si no,
 * uno genérico según el código HTTP. `respaldo` cubre el caso sin respuesta
 * (por ejemplo, sin conexión).
 */
export function mensajeDeError(err: any, respaldo = 'Ocurrió un error inesperado.'): string {
  const detalle = err?.response?.data?.detail

  if (typeof detalle === 'string' && detalle.trim()) {
    return detalle
  }

  // FastAPI devuelve una lista de errores en los fallos de validación (422).
  if (Array.isArray(detalle) && detalle.length > 0) {
    const primero = detalle[0]
    if (typeof primero?.msg === 'string') {
      return primero.msg
    }
  }

  const estado: number | undefined = err?.response?.status
  if (estado && MENSAJES_POR_ESTADO[estado]) {
    return MENSAJES_POR_ESTADO[estado]
  }

  if (err?.request && !err?.response) {
    return 'No se pudo conectar con el sistema. Revisa tu conexión a internet.'
  }

  return respaldo
}

/**
 * Nombres de campo del backend, en el idioma en que la doctora los lee.
 *
 * Sin esto un 422 llega diciendo "scheduled_at: field required", que es el
 * nombre de la columna y no el del campo que se dejó vacío en pantalla.
 */
const ETIQUETAS_DE_CAMPO: Record<string, string> = {
  patient_id: 'Paciente',
  doctor_id: 'Doctora',
  scheduled_at: 'Fecha y hora',
  duration_minutes: 'Duración',
  notes: 'Notas',
  room_id: 'Sala',
  status: 'Estado',
  cancellation_reason: 'Motivo de cancelación',
}

/**
 * Traduce un error de validación de FastAPI nombrando **todos** los campos.
 *
 * Se diferencia de `mensajeDeError` en que ahí se toma sólo el primer error de
 * la lista: para agendar eso no alcanza, porque un formulario puede llegar con
 * tres campos mal y corregir uno por vuelta desespera a quien lo llena.
 *
 * Vivía duplicado en el hook de la secretaría; está aquí porque la doctora
 * agenda contra el mismo endpoint y merece los mismos mensajes.
 */
export function parseErrorDetail(err: any): string {
  const raw = err?.response?.data?.detail
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && raw.length > 0) {
    const parts = raw.map((e: any) => {
      const loc = e.loc || []
      const fieldName = loc[loc.length - 1] || ''
      const label = ETIQUETAS_DE_CAMPO[fieldName] || fieldName
      const msg = e.msg || ''

      if (msg.includes('field required')) return `"${label}" es obligatorio`
      if (msg.includes('none is not an allowed value')) return `"${label}" no puede estar vacío`
      if (msg.includes('value_error')) return `"${label}" tiene un valor inválido`
      return `${label}: ${msg}`
    })
    return parts.join('. ')
  }
  return 'Error de validación'
}

/**
 * Resultado de cargar algo del expediente que puede no existir todavía.
 *
 * Existe para separar dos cosas que antes se veían igual: "esta consulta aún
 * no tiene nota" y "no pude leer la nota". Los hooks devolvían `null` en los
 * dos casos, así que un 500 o un problema de permisos se dibujaba como un
 * formulario vacío — invitando a la doctora a reescribir encima de datos que
 * sí existían. Un formulario en blanco tiene que significar que está en
 * blanco, nunca que no supimos.
 */
export type Cargado<T> =
    /** Llegó el dato. */
    | { estado: 'ok'; dato: T }
    /** El servidor confirmó que todavía no hay registro (204 No Content). */
    | { estado: 'sin-registro' }
    /** No se pudo leer: red caída, sin permiso, error del servidor. */
    | { estado: 'error'; mensaje: string }

/**
 * Envuelve una petición de lectura y la clasifica.
 *
 * El backend responde **204 sin contenido** cuando el registro no existe
 * todavía, y reserva 404 para "la cita no existe" y 403 para "no tienes
 * acceso". Así el código HTTP basta para distinguir, sin adivinar por el
 * texto del mensaje.
 */
export async function cargar<T>(
    peticion: Promise<{ status: number; data: T }>,
): Promise<Cargado<T>> {
    try {
        const respuesta = await peticion
        if (respuesta.status === 204) return { estado: 'sin-registro' }
        return { estado: 'ok', dato: respuesta.data }
    } catch (err: any) {
        return { estado: 'error', mensaje: mensajeDeError(err) }
    }
}
