/**
 * Lo que llega del servidor para los avisos, revisado antes de usarlo.
 *
 * Los avisos se pintan en todas las pantallas (campana, emergentes, franja,
 * centro). Una respuesta mal formada —un proxy que devuelve HTML, un backend
 * viejo sin un campo— tumbaba el diseño entero en blanco. Aquí se decide: o la
 * respuesta tiene la forma esperada, o se trata como un fallo de lectura, que
 * la interfaz ya sabe decir («No se pudieron actualizar los avisos»).
 */
import type {
  EstadoAvisos,
  Notification,
  NotificationListResponse,
  PreferenciasAvisos,
} from '../types/notification'

export class RespuestaInvalida extends Error {
  constructor(que: string) {
    super(`La respuesta de ${que} no tiene la forma esperada.`)
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const listaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

export function validarEstado(datos: unknown): EstadoAvisos {
  if (
    !esObjeto(datos) ||
    !esNumero(datos.sin_leer) ||
    !esObjeto(datos.abiertos) ||
    !esNumero(datos.abiertos.accionable) ||
    !esNumero(datos.abiertos.urgente)
  ) {
    throw new RespuestaInvalida('/notifications/estado')
  }
  return datos as unknown as EstadoAvisos
}

/** Un aviso sin id numérico o sin título no se puede mostrar ni marcar: se descarta. */
const esAviso = (v: unknown): v is Notification =>
  esObjeto(v) && esNumero(v.id) && typeof v.type === 'string' && typeof v.title === 'string'

export function validarLista(datos: unknown): NotificationListResponse {
  if (!esObjeto(datos) || !Array.isArray(datos.items)) throw new RespuestaInvalida('/notifications')
  return {
    ...(datos as unknown as NotificationListResponse),
    items: datos.items.filter(esAviso).map((a) => ({ ...a, message: typeof a.message === 'string' ? a.message : '' })),
  }
}

export function validarPreferencias(datos: unknown): PreferenciasAvisos {
  if (
    !esObjeto(datos) ||
    typeof datos.sonido !== 'boolean' ||
    typeof datos.navegador !== 'boolean' ||
    !listaDeTextos(datos.tipos_silenciados) ||
    !listaDeTextos(datos.tipos_silenciables)
  ) {
    throw new RespuestaInvalida('/notifications/preferencias')
  }
  return {
    ...(datos as unknown as PreferenciasAvisos),
    recordatorio_una_hora: datos.recordatorio_una_hora === true,
  }
}
