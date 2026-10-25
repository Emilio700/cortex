/**
 * La evolución de una escala en el tiempo, para la gráfica del expediente.
 *
 * Reglas:
 * - Las anuladas no cuentan: se capturaron mal y por eso se anularon.
 * - Una aplicación sin total (Glasgow con un componente no valorable) no se
 *   pinta como cero: se cuenta aparte y se dice.
 * - El cambio se dice en texto y con su dirección según la escala: en el ODI
 *   bajar es mejorar; en el Glasgow, subir. Empeorar se pinta como **aviso**,
 *   no como alarma: el número no sabe por qué cambió.
 */
import type { Escala, Tono } from './tipos'
import { formatearPuntaje } from './motor'

export interface Aplicacion {
  id: number
  escala: string
  puntaje: number | null
  aplicada_en: string
  anulado_at: string | null
}

export interface PuntoEvolucion {
  id: number
  fecha: string
  puntaje: number
}

export interface Evolucion {
  puntos: PuntoEvolucion[]
  sinTotal: number
  cambio: { texto: string; tono: Tono } | null
}

export function evolucionDe<T extends Aplicacion>(escala: Escala, aplicaciones: T[]): Evolucion {
  const vigentes = aplicaciones
    .filter((a) => a.escala === escala.id && !a.anulado_at)
    .sort((a, b) => a.aplicada_en.localeCompare(b.aplicada_en) || a.id - b.id)
  const puntos = vigentes
    .filter((a) => a.puntaje !== null)
    .map((a) => ({ id: a.id, fecha: a.aplicada_en, puntaje: a.puntaje as number }))
  const sinTotal = vigentes.length - puntos.length

  let cambio: Evolucion['cambio'] = null
  if (puntos.length >= 2) {
    const primero = puntos[0].puntaje
    const ultimo = puntos[puntos.length - 1].puntaje
    const diferencia = Math.round((ultimo - primero) * 10) / 10
    const desde = `${formatearPuntaje(escala, primero)} → ${formatearPuntaje(escala, ultimo)}`
    if (diferencia === 0) {
      cambio = { texto: `Sin cambio desde la primera aplicación (${desde}).`, tono: 'neutral' }
    } else {
      const mejora = escala.mayorEsMejor ? diferencia > 0 : diferencia < 0
      const signo = diferencia > 0 ? '+' : '−'
      const unidad = escala.presentacion === 'porcentaje' ? ' puntos porcentuales' : ''
      cambio = {
        texto: `${signo}${Math.abs(diferencia)}${unidad} desde la primera aplicación (${desde}).`,
        tono: mejora ? 'ok' : 'aviso',
      }
    }
  }
  return { puntos, sinTotal, cambio }
}

/** Las escalas que el paciente tiene aplicadas (vigentes), de la más reciente a la más vieja. */
export function escalasConRegistro<T extends Aplicacion>(aplicaciones: T[]): string[] {
  const vistas: string[] = []
  for (const a of [...aplicaciones].sort((x, y) => y.aplicada_en.localeCompare(x.aplicada_en))) {
    if (!a.anulado_at && !vistas.includes(a.escala)) vistas.push(a.escala)
  }
  return vistas
}
