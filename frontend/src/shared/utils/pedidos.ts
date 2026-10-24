/**
 * Pedirle algo a otra pantalla antes de navegar a ella (plan 28).
 *
 * Las pantallas viven en pestañas que no se desmontan (`TabsOutlet`) y la
 * pestaña se dibuja sin la parte `?…` de la URL, así que un `?fecha=` no le
 * llega a una Agenda que ya estaba abierta. Es el mismo problema que resolvió
 * `filtroBandeja.ts` para la bandeja; esto lo generaliza:
 *
 * - quien pide llama `pedir(clave, datos)` y luego navega;
 * - si la pantalla ya está montada, recibe el evento y lo atiende al momento;
 * - si no, lo toma al montarse con `tomar(clave)` (o `useAtenderPedido`).
 *
 * Un pedido se consume al atenderse: volver a la pestaña después no lo repite.
 */
import { useEffect, useRef } from 'react'

const EVENTO = 'gems:pedido-de-pantalla'

const pendientes = new Map<string, unknown>()

export interface PedidosConocidos {
  /**
   * Abrir la Agenda en un día (`AAAA-MM-DD`) y, si `nueva`, con «Nueva cita»
   * abierto; con `paciente`, ya elegida en la cita nueva.
   */
  'agenda:dia': {
    fecha: string
    nueva?: boolean
    paciente?: { id: number; first_name: string; last_name: string; phone?: string; email?: string }
  }
  /** Ver en la Agenda solo las citas de una paciente. */
  'agenda:paciente': { id: number; nombre: string }
  /** Abrir el registro de pago en Cobros. */
  'pagos:registrar': true
  /** Abrir el alta de paciente. */
  'pacientes:nuevo': true
  /** Enfocar el buscador de pacientes del encabezado. */
  'buscador:enfocar': true
  /** Abrir «Mis consultas» en un periodo. */
  'consultas:periodo': 'hoy' | 'todo'
}

type Clave = keyof PedidosConocidos

/**
 * Deja el pedido y avisa. Devuelve `true` si una pantalla montada lo atendió
 * en ese momento: quien pide puede así no prometer algo que nadie hizo.
 */
export const pedir = <K extends Clave>(clave: K, datos: PedidosConocidos[K]): boolean => {
  pendientes.set(clave, datos)
  const detalle = { clave, datos, atendido: false }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: detalle }))
  return detalle.atendido
}

/** El pedido que nadie ha atendido todavía; al leerlo se consume. */
export const tomar = <K extends Clave>(clave: K): PedidosConocidos[K] | null => {
  if (!pendientes.has(clave)) return null
  const datos = pendientes.get(clave) as PedidosConocidos[K]
  pendientes.delete(clave)
  return datos
}

/**
 * Atiende los pedidos de `clave`: el que quedó pendiente al montarse y los que
 * lleguen mientras la pantalla esté montada.
 */
export const useAtenderPedido = <K extends Clave>(
  clave: K,
  atender: (datos: PedidosConocidos[K]) => void,
) => {
  const ultimo = useRef(atender)
  ultimo.current = atender

  useEffect(() => {
    const pendiente = tomar(clave)
    if (pendiente !== null) ultimo.current(pendiente)
    const alPedir = (evento: Event) => {
      const detalle = (evento as CustomEvent<{ clave: string; datos: PedidosConocidos[K]; atendido: boolean }>)
        .detail
      if (detalle?.clave !== clave) return
      pendientes.delete(clave)
      detalle.atendido = true
      ultimo.current(detalle.datos)
    }
    window.addEventListener(EVENTO, alPedir)
    return () => window.removeEventListener(EVENTO, alPedir)
  }, [clave])
}
