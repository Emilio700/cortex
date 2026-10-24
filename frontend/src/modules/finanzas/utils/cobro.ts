/**
 * Utilidades de cobro compartidas por la consulta, recepción y la agenda.
 *
 * Viven juntas porque las tres pantallas tienen que decir lo mismo con las
 * mismas palabras: si la agenda dice "cobrada" y el modal de pago dice otra
 * cosa, la secretaria no sabe a cuál creerle y vuelve a cobrar.
 */
import type { CamposCobroDeCita, CobroResumen, EstadoCobro, Payment } from '../types'
import { formatearInstante, instanteDelServidor } from '../../../shared/utils/date'

export const formatoMoneda = (valor: string | number | null | undefined): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(valor ?? 0))

export const METODOS: Record<string, { label: string; color: string }> = {
  cash: { label: 'Efectivo', color: 'success' },
  card: { label: 'Tarjeta', color: 'info' },
  transfer: { label: 'Transferencia', color: 'warning' },
  other: { label: 'Otro', color: 'secondary' },
}

export const etiquetaMetodo = (metodo: string): string => METODOS[metodo]?.label ?? metodo

/** Tarjeta y transferencia se concilian contra el estado de cuenta: ahí sí sirve el folio. */
export const pideReferencia = (metodo: string): boolean => metodo === 'card' || metodo === 'transfer'

export const ESTADO_COBRO: Record<EstadoCobro, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente de cobro', color: 'warning' },
  cobrada: { label: 'Cobrada', color: 'success' },
  sin_cargo: { label: 'Sin cargo', color: 'secondary' },
}

/**
 * Fecha de un pago tal como la manda el servidor: UTC pero sin la "Z". Leída
 * así, el navegador la tomaría como hora local y "cobrada a las 11:05" saldría
 * a las 17:05, que es justo el dato con el que la secretaria decide si ya se
 * cobró. Si algún día llega con zona, se respeta.
 */
export const fechaDelServidor = (iso: string): Date => instanteDelServidor(iso)

export const horaCorta = (iso: string): string =>
  formatearInstante(iso, { hour: '2-digit', minute: '2-digit' })

/**
 * "Ya la cobró Cintia a las 11:05: $800.00 con tarjeta."
 *
 * Es la frase que evita el cobro doble, así que dice lo que la secretaria
 * necesita para no volver a pasar la tarjeta: quién, cuánto, cómo y a qué hora.
 */
export const describirCobro = (cobro: CobroResumen | Payment): string => {
  const quien = cobro.received_by_name ? `Ya la cobró ${cobro.received_by_name}` : 'Ya cobrada'
  const cuando = cobro.paid_at ? ` a las ${horaCorta(cobro.paid_at)}` : ''
  return `${quien}${cuando}: ${formatoMoneda(cobro.amount)} con ${etiquetaMetodo(
    String(cobro.method),
  ).toLowerCase()}.`
}

export const estadoCobroDe = (cita: CamposCobroDeCita | null | undefined): EstadoCobro | null =>
  cita?.estado_cobro ?? null

/**
 * UUID por intento de cobro. `crypto.randomUUID` sólo existe en contexto
 * seguro; si la clínica abriera el sistema por http, sin respaldo el botón de
 * cobrar reventaría a media consulta.
 */
export const nuevoIdDeIntento = (): string => {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Fecha local `YYYY-MM-DD` (no UTC: en México el día UTC cambia a las 18:00). */
export const hoyLocal = (): string => {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/**
 * Error de una operación de cobro que conserva lo que dijo el servidor.
 *
 * El 409 de cobro doble trae el pago que ya existe; perderlo en un `new
 * Error(msg)` obligaría a la pantalla a adivinar si la cita quedó cobrada.
 */
export class ErrorDeCobro extends Error {
  status?: number
  cobroExistente?: Payment
  /**
   * Sólo en la consulta express: la consulta del día que hace pensar que es
   * la misma. Con esto la pantalla pregunta en vez de rendirse.
   */
  citaExistente?: CitaExistente

  constructor(mensaje: string, status?: number, cobroExistente?: Payment, citaExistente?: CitaExistente) {
    super(mensaje)
    this.name = 'ErrorDeCobro'
    this.status = status
    this.cobroExistente = cobroExistente
    this.citaExistente = citaExistente
  }
}

export interface CitaExistente {
  id: number
  scheduled_at: string
  status: string
  origen: string
}

/** Lee `detail` sólo si es texto: un objeto pintado tal cual sale "[object Object]". */
export const detalleDeError = (err: any, respaldo: string): string => {
  const detalle = err?.response?.data?.detail
  return typeof detalle === 'string' && detalle.trim() ? detalle : respaldo
}

export const aErrorDeCobro = (err: any, respaldo: string): ErrorDeCobro =>
  new ErrorDeCobro(
    detalleDeError(err, respaldo),
    err?.response?.status,
    err?.response?.data?.cobro_existente ?? undefined,
    err?.response?.data?.cita_existente ?? undefined,
  )
