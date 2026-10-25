/**
 * De los píxeles de una radiografía DICOM a una imagen en gris que se puede
 * marcar. Puro y con pruebas: si la ventana se equivoca, el médico ve una placa
 * blanca o negra y marca a ciegas.
 */

export interface OpcionesDeVentana {
  /** Rescale Slope / Intercept del DICOM (1 y 0 si no vienen). */
  pendiente: number
  intercepto: number
  /** Ventana del DICOM; sin ella se usa el rango de la imagen. */
  centro?: number | null
  ancho?: number | null
  /** MONOCHROME1: el valor alto es negro. */
  invertir: boolean
}

/** Rango de valores (ya reescalados) de la imagen. */
export const rangoDe = (px: ArrayLike<number>, op: Pick<OpcionesDeVentana, 'pendiente' | 'intercepto'>) => {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < px.length; i++) {
    const v = px[i] * op.pendiente + op.intercepto
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}

/** Escribe en `destino` (RGBA) la imagen en gris con su ventana. */
export const ventanaARGBA = (px: ArrayLike<number>, op: OpcionesDeVentana, destino: Uint8ClampedArray) => {
  let centro = op.centro ?? null
  let ancho = op.ancho ?? null
  if (centro === null || ancho === null || !(ancho > 0)) {
    const { min, max } = rangoDe(px, op)
    centro = (min + max) / 2
    ancho = Math.max(1, max - min)
  }
  const bajo = centro - ancho / 2
  for (let i = 0; i < px.length; i++) {
    const v = px[i] * op.pendiente + op.intercepto
    let g = Math.round(((v - bajo) / ancho) * 255)
    g = g < 0 ? 0 : g > 255 ? 255 : g
    if (op.invertir) g = 255 - g
    const k = i * 4
    destino[k] = g
    destino[k + 1] = g
    destino[k + 2] = g
    destino[k + 3] = 255
  }
  return destino
}
