/**
 * Valoración de un resultado y canal de comunicación (plan 26, D-8 y D-9).
 *
 * La valoración reemplaza a la casilla «Resultado crítico»: es opcional, de
 * cada resultado, y elegir «Crítico» es lo que abre la incidencia en el inicio
 * del médico. El orden va de mejor a peor y el número es el que usa la
 * gráfica del expediente.
 */
export type Valoracion = 'excelente' | 'bien' | 'regular' | 'malo' | 'critico'

export const VALORACIONES: ReadonlyArray<{
  valor: Valoracion
  etiqueta: string
  /** Color de CoreUI: estado, con su texto al lado; nunca solo el color. */
  color: string
  nivel: number
}> = [
  { valor: 'excelente', etiqueta: 'Excelente', color: 'success', nivel: 5 },
  { valor: 'bien', etiqueta: 'Bien', color: 'info', nivel: 4 },
  { valor: 'regular', etiqueta: 'Regular', color: 'warning', nivel: 3 },
  { valor: 'malo', etiqueta: 'Malo', color: 'danger', nivel: 2 },
  { valor: 'critico', etiqueta: 'Crítico', color: 'danger', nivel: 1 },
]

const POR_VALOR = new Map(VALORACIONES.map((v) => [v.valor, v]))

export const datosValoracion = (valor?: string | null) =>
  valor ? POR_VALOR.get(valor as Valoracion) ?? null : null

export const etiquetaValoracion = (valor?: string | null): string =>
  datosValoracion(valor)?.etiqueta ?? (valor || 'Sin valorar')

/** Medio por el que se le comunicó o entregó el resultado al paciente (D-8). */
export type CanalComunicacion = 'en_mano' | 'llamada' | 'whatsapp' | 'correo'

export const CANALES: ReadonlyArray<{ valor: CanalComunicacion; etiqueta: string }> = [
  { valor: 'en_mano', etiqueta: 'Entregado en mano' },
  { valor: 'llamada', etiqueta: 'Llamada' },
  { valor: 'whatsapp', etiqueta: 'WhatsApp' },
  { valor: 'correo', etiqueta: 'Correo' },
]

export const etiquetaCanal = (valor?: string | null): string =>
  CANALES.find((c) => c.valor === valor)?.etiqueta ?? (valor || '')
