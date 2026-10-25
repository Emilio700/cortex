/**
 * «Ver en Neuro 3D» desde el visor: qué modelo abrir.
 *
 * Las pestañas se dibujan sin la parte `?…` de la URL y, al abrir una nueva, la
 * barra la reemplaza por la ruta limpia: un `?modelo=9` se pierde antes de que
 * la pantalla lo lea. Se pasa aquí, igual que el filtro de la bandeja
 * (`doctor/utils/filtroBandeja.ts`): quien pide lo deja, la pantalla lo toma una
 * vez. El evento avisa a una pestaña de Neuro 3D que ya estaba abierta.
 */
export const EVENTO_MODELO_PEDIDO = 'cortex:modelo-3d-pedido'

let pendiente: number | null = null

export const pedirModelo = (modeloId: number) => {
  pendiente = modeloId
  window.dispatchEvent(new CustomEvent<number>(EVENTO_MODELO_PEDIDO, { detail: modeloId }))
}

/** El modelo pedido que nadie ha tomado todavía; al leerlo se consume. */
export const tomarModeloPedido = (): number | null => {
  const id = pendiente
  pendiente = null
  return id
}
