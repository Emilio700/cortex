/**
 * Cuántos resultados llegaron y la doctora todavía no revisa.
 *
 * Nada empujaba a la doctora a la bandeja: un resultado recibido podía quedarse
 * ahí semanas. El número sale del mismo listado de la bandeja filtrado por
 * «Resultado recibido» y con `limit=1`: el servidor ya cuenta el total, así que
 * es una sola llamada y no una por orden.
 */
import { useCallback, useEffect, useState } from 'react'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { Badge } from '../../../_nav'

/** La bandeja lo emite al guardar un resultado, para que el número no se quede viejo. */
export const EVENTO_RESULTADOS_ACTUALIZADOS = 'gems:resultados-actualizados'

/** Estado de la orden cuyo resultado ya llegó y falta que la doctora lo revise. */
export const ESTADO_SIN_REVISAR = 'result_received'

export const avisarResultadosActualizados = () => {
  window.dispatchEvent(new Event(EVENTO_RESULTADOS_ACTUALIZADOS))
}

export const useResultadosSinRevisar = (habilitado = true) => {
  // `null` mientras no se sabe: un fallo de red nunca se muestra como «0»,
  // porque «0» le dice a la doctora que no tiene nada que revisar.
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(habilitado)

  const cargar = useCallback(async () => {
    if (!habilitado) return
    setCargando(true)
    try {
      const response = await apiClient.get('/clinical-tracking/orders/inbox', {
        params: { status: ESTADO_SIN_REVISAR, skip: 0, limit: 1 },
      })
      const recibido = response.data?.total
      if (typeof recibido !== 'number') throw new Error('La bandeja no devolvió el total.')
      setTotal(recibido)
      setError(null)
    } catch (caught) {
      setTotal(null)
      setError(mensajeDeError(caught, 'No se pudieron contar los resultados sin revisar.'))
    } finally {
      setCargando(false)
    }
  }, [habilitado])

  useEffect(() => {
    if (!habilitado) return
    void cargar()
    // Al volver a la ventana y al guardar en la bandeja: son los dos momentos en
    // que el número pudo cambiar sin que esta pantalla se enterara.
    const alCambiar = () => void cargar()
    window.addEventListener('focus', alCambiar)
    window.addEventListener(EVENTO_RESULTADOS_ACTUALIZADOS, alCambiar)
    return () => {
      window.removeEventListener('focus', alCambiar)
      window.removeEventListener(EVENTO_RESULTADOS_ACTUALIZADOS, alCambiar)
    }
  }, [habilitado, cargar])

  return { total, error, cargando, recargar: cargar }
}

/**
 * Insignia de «Órdenes y resultados» con los resultados sin revisar.
 *
 * Con cero no se dibuja nada; si no se pudo contar se dibuja «?», nunca «0»:
 * un cero falso le diría a la doctora que no tiene nada pendiente.
 */
export const insigniaDeResultados = (
  total: number | null,
  error: string | null,
): Badge | undefined => {
  if (error) {
    return { color: 'secondary', text: '?', title: 'No se pudieron contar los resultados sin revisar' }
  }
  if (!total) return undefined
  return {
    color: 'danger',
    text: String(total),
    title: total === 1 ? '1 resultado sin revisar' : `${total} resultados sin revisar`,
  }
}
