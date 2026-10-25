/**
 * Reglas puras de las pantallas de Sistema (base-modulos-extra): cómo se nombra
 * cada estado de un servicio y cuándo un módulo no se deja encender.
 */
import type { ModuloDelConsultorio } from '../../../shared/services/modulos'

export type EstadoDeServicio = 'no_configurado' | 'en_linea' | 'sin_respuesta' | 'configurado'

export interface ServicioAuxiliar {
  id: string
  nombre: string
  para_que: string
  estado: EstadoDeServicio
  /** Ya redactado en español por el servidor. */
  detalle: string
}

export interface PresentacionDeEstado {
  texto: string
  /** Color de CoreUI, con el significado de DESIGN.md (verde, ámbar, rojo). */
  color: 'success' | 'warning' | 'danger' | 'secondary'
}

/**
 * «Configurado» no es «en línea»: a la IA no se le hace una consulta de prueba
 * (cuesta), así que no se pinta en verde lo que nadie comprobó.
 */
export function presentacionDeEstado(estado: EstadoDeServicio | string): PresentacionDeEstado {
  switch (estado) {
    case 'en_linea':
      return { texto: 'En línea', color: 'success' }
    case 'sin_respuesta':
      return { texto: 'Sin respuesta', color: 'danger' }
    case 'configurado':
      return { texto: 'Configurado, sin probar', color: 'warning' }
    case 'no_configurado':
      return { texto: 'No configurado', color: 'secondary' }
    default:
      return { texto: 'Desconocido', color: 'secondary' }
  }
}

export const NOMBRES_DE_SERVICIO: Record<string, string> = {
  orthanc: 'Orthanc (PACS)',
  whisper: 'Whisper (dictado)',
  presidio: 'Presidio',
  segmentador: 'el segmentador',
  ia: 'un proveedor de IA',
}

/**
 * Por qué un módulo no se puede encender, o `null` si se puede.
 *
 * Apagar siempre se puede: nunca se deja a un consultorio atrapado con un
 * módulo encendido porque su servicio se cayó.
 */
export function motivoParaNoEncender(modulo: ModuloDelConsultorio): string | null {
  if (modulo.activo) return null
  if (modulo.servicio_requerido && !modulo.servicio_configurado) {
    const servicio = NOMBRES_DE_SERVICIO[modulo.servicio_requerido] ?? modulo.servicio_requerido
    return `Necesita ${servicio}, que no está configurado en el servidor. Revisa Estado de servicios.`
  }
  return null
}
