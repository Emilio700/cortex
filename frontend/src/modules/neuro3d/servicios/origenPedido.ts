/**
 * «Ver en Neuro 3D»: con qué origen abrir el modelo de un paciente.
 *
 * Lo usan las dos entradas: la herramienta de marcado de radiografías
 * (`'radiografia'`) y el visor de TC (`'tc'`, con el modelo que se acaba de
 * generar). No viaja sólo en la URL porque las pestañas de Cortex abren cada
 * pantalla sin su `?…` (`TabsOutlet` arma la ruta sólo con el `pathname`), y si
 * la pestaña de Neuro 3D ya estaba abierta ni siquiera se vuelve a montar.
 *
 * Se deja aquí, por paciente (una pestaña de Neuro 3D de otro paciente no se lo
 * lleva), y Neuro 3D lo toma una vez: al abrir, al llegar el evento o al volver
 * a su pestaña. El evento avisa a una pestaña de Neuro 3D que ya estaba abierta.
 *
 * Es una comodidad de este navegador, no un dato: si el almacenamiento no está
 * disponible, Neuro 3D abre en el esquemático y el médico elige el origen.
 */
import type { OrigenModelo } from '../dominio/origenModelo'

export interface OrigenPedido {
  origen: OrigenModelo
  /** Con `'tc'`: el modelo que pidió el visor (si no, el más reciente listo). */
  modeloId?: number
}

export const EVENTO_ORIGEN_PEDIDO = 'cortex:neuro3d-origen-pedido'

const clave = (patientId: number) => `cortex.neuro3d.origen.${patientId}`

const esOrigen = (v: unknown): v is OrigenModelo => v === 'esquematico' || v === 'radiografia' || v === 'tc'

export const pedirOrigen = (patientId: number, origen: OrigenModelo, modeloId?: number) => {
  const pedido: OrigenPedido = modeloId ? { origen, modeloId } : { origen }
  try {
    sessionStorage.setItem(clave(patientId), JSON.stringify(pedido))
  } catch {
    /* sin almacenamiento: Neuro 3D abre en el esquemático y el médico lo cambia */
  }
  window.dispatchEvent(new CustomEvent<{ patientId: number }>(EVENTO_ORIGEN_PEDIDO, { detail: { patientId } }))
}

/** Lee y borra lo pedido para ese paciente: se aplica una sola vez. */
export const tomarOrigenPedido = (patientId: number): OrigenPedido | null => {
  try {
    const crudo = sessionStorage.getItem(clave(patientId))
    sessionStorage.removeItem(clave(patientId))
    if (!crudo) return null
    // Un origen suelto (formato anterior) también vale.
    if (esOrigen(crudo)) return { origen: crudo }
    const v = JSON.parse(crudo) as Partial<OrigenPedido>
    if (!esOrigen(v.origen)) return null
    const modeloId = Number(v.modeloId)
    return Number.isInteger(modeloId) && modeloId > 0 ? { origen: v.origen, modeloId } : { origen: v.origen }
  } catch {
    return null
  }
}

/** Lo mismo desde la URL, para un enlace pegado o abierto fuera de pestañas. */
export const origenPedidoDeLaUrl = (parametros: URLSearchParams): OrigenPedido | null => {
  const modeloId = Number(parametros.get('modelo'))
  if (Number.isInteger(modeloId) && modeloId > 0) return { origen: 'tc', modeloId }
  const origen = parametros.get('origen')
  return esOrigen(origen) ? { origen } : null
}
