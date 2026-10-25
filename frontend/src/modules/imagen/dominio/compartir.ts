/**
 * Piezas del enlace temporal para compartir un estudio.
 *
 * El enlace se arma en el navegador con el token que devuelve el servidor, que
 * sólo lo da una vez. Aquí vive todo lo que se puede probar sin red: cuánto dura,
 * cómo se dice cuánto falta y la dirección que se copia.
 */

export interface DuracionDeEnlace {
  horas: number
  etiqueta: string
}

/** Máximo una semana: un enlace que no vence deja de ser temporal. */
export const DURACIONES_DE_ENLACE: ReadonlyArray<DuracionDeEnlace> = [
  { horas: 1, etiqueta: '1 hora' },
  { horas: 24, etiqueta: '24 horas' },
  { horas: 72, etiqueta: '3 días' },
  { horas: 168, etiqueta: '7 días' },
]

export const DURACION_POR_OMISION = 24

export interface EnlaceCompartido {
  id: number
  recipient_note: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  access_count: number
  last_access_at: string | null
  created_by: string | null
  estado: 'activo' | 'vencido' | 'revocado'
}

export interface EnlaceCreado extends EnlaceCompartido {
  /** Sólo existe en la respuesta de creación. */
  token: string
  avisos: string[]
}

/** La dirección completa, para pegarla en un mensaje (el visor usa `#/` en la ruta). */
export function urlDelEnlace(origen: string, token: string): string {
  return `${origen.replace(/\/+$/, '')}/#/compartido/${token}`
}

/**
 * «vence en 3 h», «vence en 2 días», «venció». El servidor manda la hora en UTC
 * sin zona (como el resto de las columnas): se interpreta como UTC.
 */
export function textoDeVencimiento(expiraEn: string, ahora: Date = new Date()): string {
  const texto = /[zZ]|[+-]\d{2}:?\d{2}$/.test(expiraEn) ? expiraEn : `${expiraEn}Z`
  const limite = new Date(texto).getTime()
  if (Number.isNaN(limite)) return 'sin fecha de vencimiento'
  const minutos = Math.floor((limite - ahora.getTime()) / 60000)
  if (minutos <= 0) return 'venció'
  if (minutos < 60) return `vence en ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `vence en ${horas} h`
  return `vence en ${Math.floor(horas / 24)} días`
}

/** Etiqueta corta del estado, con su tono para la insignia. */
export function estadoDeEnlace(enlace: Pick<EnlaceCompartido, 'estado'>): {
  texto: string
  color: 'success' | 'secondary' | 'danger'
} {
  if (enlace.estado === 'activo') return { texto: 'Activo', color: 'success' }
  if (enlace.estado === 'revocado') return { texto: 'Revocado', color: 'danger' }
  return { texto: 'Vencido', color: 'secondary' }
}

/** «3 accesos», «1 acceso», «Sin abrir». */
export function textoDeAccesos(cantidad: number): string {
  if (cantidad <= 0) return 'Sin abrir'
  return cantidad === 1 ? '1 acceso' : `${cantidad} accesos`
}
