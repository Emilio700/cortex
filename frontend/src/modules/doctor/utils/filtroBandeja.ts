/**
 * Pedirle a la bandeja que se abra en un filtro (plan 26, I2).
 *
 * Las pantallas viven en pestañas que no se desmontan (TabsOutlet): si la
 * bandeja ya estaba abierta en otro filtro, un `?filtro=` en la URL no llegaba,
 * porque la página solo leía la URL al montarse y la pestaña navega sin
 * `search`. Así «Revisarlos en la bandeja» caía en «Todo lo pendiente».
 *
 * Quien quiere abrir la bandeja en un filtro llama a `pedirFiltroBandeja()`
 * antes de navegar: si la bandeja ya está montada recibe el evento y cambia de
 * filtro; si no, lo toma al montarse.
 */
import type { FiltroBandeja } from '../types/clinicalTracking'

export const EVENTO_FILTRO_BANDEJA = 'gems:filtro-bandeja'

let pendiente: FiltroBandeja | null = null

export const pedirFiltroBandeja = (filtro: FiltroBandeja) => {
  pendiente = filtro
  window.dispatchEvent(new CustomEvent<FiltroBandeja>(EVENTO_FILTRO_BANDEJA, { detail: filtro }))
}

/** El filtro pedido que nadie ha tomado todavía; al leerlo se consume. */
export const tomarFiltroPendiente = (): FiltroBandeja | null => {
  const filtro = pendiente
  pendiente = null
  return filtro
}
