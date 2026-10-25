/**
 * «Ver en Neuro 3D» desde la herramienta de marcado: qué origen pidió el médico.
 *
 * No viaja en la URL porque las pestañas de Cortex abren cada pantalla sin su
 * `?…` (`TabsOutlet` arma la ruta sólo con el `pathname`), y si la pestaña de
 * Neuro 3D ya estaba abierta ni siquiera se vuelve a montar. Se deja aquí,
 * por paciente, y Neuro 3D lo toma una vez (al abrir o al volver a su pestaña).
 *
 * Es una comodidad de este navegador, no un dato: si el almacenamiento no está
 * disponible, Neuro 3D simplemente abre en el esquemático.
 */
import type { OrigenModelo } from '../dominio/origenModelo'

const clave = (patientId: number) => `cortex.neuro3d.origen.${patientId}`

export const pedirOrigen = (patientId: number, origen: OrigenModelo) => {
  try {
    sessionStorage.setItem(clave(patientId), origen)
  } catch {
    /* sin almacenamiento: Neuro 3D abre en el esquemático y el médico lo cambia */
  }
}

/** Lee y borra lo pedido: se aplica una sola vez. */
export const tomarOrigenPedido = (patientId: number): OrigenModelo | null => {
  try {
    const v = sessionStorage.getItem(clave(patientId))
    sessionStorage.removeItem(clave(patientId))
    return v === 'esquematico' || v === 'radiografia' || v === 'tc' ? v : null
  } catch {
    return null
  }
}
