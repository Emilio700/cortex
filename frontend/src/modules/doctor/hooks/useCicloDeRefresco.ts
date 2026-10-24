/**
 * Cuándo se vuelve a preguntar al servidor (plan 28, §4.3 y D-9).
 *
 * - Al volver a la pestaña o a la ventana (`visibilitychange`, `focus`) y al
 *   recuperar la red (`online`): todo.
 * - Cada `intervaloMs` (60 s) **solo con la pestaña visible**: todo. Con la
 *   pestaña oculta no se sondea; al volver, el `visibilitychange` ya refresca.
 *   Cubre lo que cambia sin aviso (una cita confirmada o cancelada).
 * - Con el latido de avisos del plan 27 (`useLatidoAvisos`, cada 15 s a la
 *   vista, una sola pestaña sondea): solo cuando trae `cambio` (llegó una
 *   paciente a sala, se resolvió un aviso) y solo lo que eso mueve
 *   (`alCambiarAvisos`), no todas las secciones cada 15 s. Fuera del
 *   proveedor de avisos el latido no llega y queda el temporizador.
 */
import { useEffect, useRef } from 'react'

import { useLatidoAvisos } from '../../../shared/avisos/AvisosContext'

export const INTERVALO_DE_REFRESCO_MS = 60_000

const pestanaVisible = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

interface Opciones {
  intervaloMs?: number
  habilitado?: boolean
  /** Lo que se recarga cuando el latido de avisos dice que algo cambió. */
  alCambiarAvisos?: () => void
}

export const useCicloDeRefresco = (
  refrescar: () => void,
  { intervaloMs = INTERVALO_DE_REFRESCO_MS, habilitado = true, alCambiarAvisos }: Opciones = {},
) => {
  // Siempre la última versión, sin reiniciar los temporizadores en cada render.
  const ultimo = useRef(refrescar)
  ultimo.current = refrescar
  const ultimoAlCambiar = useRef(alCambiarAvisos)
  ultimoAlCambiar.current = alCambiarAvisos

  useLatidoAvisos((latido) => {
    if (habilitado && latido.cambio) ultimoAlCambiar.current?.()
  })

  useEffect(() => {
    if (!habilitado) return
    // `focus` y `visibilitychange` llegan juntos al volver a la pestaña: se
    // juntan en uno para no pedir todo dos veces.
    let ultimaVez = 0
    const disparar = () => {
      const ahora = Date.now()
      if (ahora - ultimaVez < 1000) return
      ultimaVez = ahora
      ultimo.current()
    }
    const alCambiarVisibilidad = () => {
      if (pestanaVisible()) disparar()
    }
    const temporizador = window.setInterval(() => {
      if (pestanaVisible()) disparar()
    }, intervaloMs)

    window.addEventListener('focus', disparar)
    window.addEventListener('online', disparar)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      window.clearInterval(temporizador)
      window.removeEventListener('focus', disparar)
      window.removeEventListener('online', disparar)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [intervaloMs, habilitado])
}
