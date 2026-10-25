/**
 * El mensaje que se le muestra a la persona cuando algo falla.
 *
 * `mensajeDeError` (compartido) sólo entiende errores del servidor: lee
 * `response.data.detail`, o traduce el código HTTP. Un `Error` normal de este
 * módulo —«Este navegador no permite copiar imágenes», «La serie no tiene cortes
 * guardados»— lo convertiría en «Ocurrió un error inesperado», y la persona se
 * quedaría sin saber qué hacer. Aquí se separan los dos casos.
 */
import { mensajeDeError } from '../../../shared/utils/errors'

export function mensajeDeFallo(error: unknown): string {
  const candidato = error as { response?: unknown; request?: unknown } | null
  // Vino del servidor o de la red: lo traduce el helper compartido.
  if (candidato && (candidato.response || candidato.request)) return mensajeDeError(error)
  // Un error de este módulo ya trae un mensaje escrito para la persona.
  if (error instanceof Error && error.message.trim()) return error.message
  return mensajeDeError(error)
}
