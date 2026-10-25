/**
 * Origen «radiografia» del selector de Neuro 3D (tramo RX).
 *
 * Trae el ajuste vigente más reciente del paciente (el servidor manda: sólo se
 * dibuja lo que guardó y no está anulado) y arma la opción del selector. Sin
 * ajuste, la opción queda deshabilitada y dice por qué. La página dobla la
 * columna con `ajuste` cuando el origen que se ve es «radiografia».
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import type { OpcionDeOrigen } from '../componentes/SelectorOrigen'
import { columnaRxApi, type AjusteRxGuardado } from './columnaRxApi'

export interface OrigenRadiografia {
  opcion: OpcionDeOrigen
  /** El ajuste vigente; `null` si no hay, si no se pudo consultar o si todavía no llega. */
  ajuste: AjusteRxGuardado | null
  /** La primera consulta sigue en curso (las recargas no cuentan). */
  cargando: boolean
  /** Vuelve a pedir el vigente (pudo guardarse o anularse uno). */
  recargar: () => void
}

export function useOrigenRadiografia(patientId: number | null): OrigenRadiografia {
  const { can } = useAuth()
  const veRx = patientId !== null && can('spine_rx.read')
  // Empieza en «cargando» si se va a consultar: un pedido de «radiografia» no
  // debe darse por imposible antes de que llegue la respuesta.
  const [estado, setEstado] = useState<AjusteRxGuardado | null | 'cargando' | 'error'>(() => (veRx ? 'cargando' : null))
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!veRx || patientId === null) return
    let vigente = true
    // Al recargar no se vuelve a «cargando»: la escena seguiría con el ajuste
    // que ya tenía y se rehace sólo si el vigente cambió.
    if (recarga === 0) setEstado('cargando')
    columnaRxApi
      .vigente(patientId)
      .then((a) => vigente && setEstado((x) => (x && typeof x === 'object' && a && x.id === a.id ? x : a)))
      .catch(() => vigente && setEstado('error'))
    return () => {
      vigente = false
    }
  }, [veRx, patientId, recarga])

  const recargar = useCallback(() => setRecarga((n) => n + 1), [])
  const ajuste = estado && typeof estado === 'object' ? estado : null
  const motivo =
    patientId === null
      ? 'Abre Neuro 3D desde el expediente de un paciente.'
      : !veRx
        ? 'Tu cuenta no puede ver los ajustes de radiografía.'
        : estado === 'cargando'
          ? 'Buscando el ajuste del paciente…'
          : estado === 'error'
            ? 'No se pudo consultar el ajuste de radiografía.'
            : !ajuste
              ? 'Este paciente no tiene radiografías marcadas.'
              : null

  return {
    opcion: motivo ? { disponible: false, motivo } : { disponible: true },
    ajuste,
    cargando: veRx && estado === 'cargando',
    recargar,
  }
}
