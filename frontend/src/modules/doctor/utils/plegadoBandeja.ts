/**
 * Qué tarjetas de la bandeja están abiertas (plan 32, punto 3).
 *
 * Plegadas por omisión: con un paciente de 11 estudios ya no cabía nada más
 * en la pantalla. Lo que el médico abre o cierra a mano se recuerda solo en
 * su navegador; si el almacenamiento falla (ventana privada, sitio bloqueado)
 * la bandeja funciona igual, solo que sin memoria.
 */
import { useEffect, useState } from 'react'

import type { OrdenEnBandeja, PacienteEnBandeja } from '../types/clinicalTracking'
import { formatearFechaISO, formatearHoraDeCita } from '../../../shared/utils/date'

const LLAVE = 'gems.bandeja.plegado'

/** patient_id → abierta (true) o cerrada (false), solo lo que eligió a mano. */
export type Eleccion = Record<number, boolean>

export const leerEleccion = (): Eleccion => {
  try {
    const crudo = window.localStorage.getItem(LLAVE)
    const valor = crudo ? JSON.parse(crudo) : {}
    return valor && typeof valor === 'object' ? (valor as Eleccion) : {}
  } catch {
    return {}
  }
}

export const guardarEleccion = (eleccion: Eleccion) => {
  try {
    window.localStorage.setItem(LLAVE, JSON.stringify(eleccion))
  } catch {
    // Sin memoria entre visitas; la pantalla sigue funcionando.
  }
}

/**
 * Si la tarjeta se ve abierta. Plegadas por omisión (decisión del plan 32);
 * lo elegido a mano manda. Se abren solas por excepción: un crítico abierto
 * no puede quedar escondido y lo que viene de una búsqueda es lo que se buscó.
 * La primera solo mientras corre el recorrido guiado, para que sus pasos de
 * fila y de grupo tengan qué señalar.
 */
export const estaAbierta = (
  paciente: PacienteEnBandeja,
  indice: number,
  eleccion: Eleccion,
  hayBusqueda: boolean,
  recorridoActivo = false,
): boolean => {
  if (recorridoActivo && indice === 0) return true
  const elegida = eleccion[paciente.patient_id]
  if (elegida !== undefined) return elegida
  return paciente.tiene_criticos || hayBusqueda
}

/**
 * Si hay un recorrido guiado en pantalla. driver.js marca el body con
 * `driver-active` mientras corre; leerlo evita tocar el motor compartido.
 */
export const useRecorridoActivo = (): boolean => {
  const leer = () => typeof document !== 'undefined' && document.body.classList.contains('driver-active')
  const [activo, setActivo] = useState(leer)
  useEffect(() => {
    const observador = new MutationObserver(() => setActivo(leer()))
    observador.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observador.disconnect()
  }, [])
  return activo
}

export interface GrupoDeOrdenes {
  clave: string
  /** «Consulta del 1 oct 2026, 09:30 · Lote G-3 · 6 estudios». */
  titulo: string
  /** La cita, solo si abrirla es releerla (ya atendida). */
  citaParaVer: number | null
  ordenes: OrdenEnBandeja[]
}

/**
 * Agrupa por lote o por consulta, y cada grupo dice de qué cita y de qué fecha
 * viene: «Lote G-3» solo no decía de dónde salió y el rastro se perdía.
 */
export const gruposDe = (ordenes: OrdenEnBandeja[]): GrupoDeOrdenes[] => {
  const mapa = new Map<string, OrdenEnBandeja[]>()
  for (const orden of ordenes) {
    const clave = orden.order_group_id
      ? `g${orden.order_group_id}`
      : orden.appointment_id
        ? `c${orden.appointment_id}`
        : `s${orden.requested_on ?? ''}`
    mapa.set(clave, [...(mapa.get(clave) ?? []), orden])
  }
  return [...mapa.entries()].map(([clave, grupo]) => {
    const primera = grupo[0]
    const partes: string[] = []
    if (primera.appointment_id) {
      partes.push(
        primera.cita_fecha
          ? `Consulta del ${formatearHoraDeCita(primera.cita_fecha, { dateStyle: 'medium', timeStyle: 'short' })}`
          : `Consulta n.º ${primera.appointment_id}`,
      )
    } else {
      partes.push(`Pedido el ${formatearFechaISO(primera.requested_on, 'sin fecha')}, sin consulta`)
    }
    if (primera.order_group_id) partes.push(`Lote G-${primera.order_group_id}`)
    partes.push(`${grupo.length} ${grupo.length === 1 ? 'estudio' : 'estudios'}`)
    return {
      clave,
      titulo: partes.join(' · '),
      citaParaVer:
        primera.appointment_id && primera.cita_estado === 'atendida' ? primera.appointment_id : null,
      ordenes: grupo,
    }
  })
}
