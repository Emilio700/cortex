/**
 * Los controles de la imagen: ventana, invertir, girar, voltear, zoom y cine.
 *
 * Se escriben contra `VistaLike`, la parte mínima de un viewport de Cornerstone
 * que de verdad se usa, y no contra Cornerstone mismo. Así se prueban con una
 * vista falsa, sin GPU, y la pantalla no depende de qué versión de la librería
 * tenga un método u otro: cada llamada comprueba que existe antes de usarla.
 *
 * Regla de fondo: **nunca se toca el original**. Todo esto cambia cómo se dibuja
 * el corte (rango de grises, giro, zoom), no los datos.
 */
import { rangoDeVentana, ventanaDeRango } from '../dominio/presets'

export interface VistaLike {
  getProperties?: () => {
    voiRange?: { lower: number; upper: number }
    invert?: boolean
  }
  setProperties?: (propiedades: {
    voiRange?: { lower: number; upper: number }
    invert?: boolean
  }) => void
  resetProperties?: () => void
  getCamera?: () => { rotation?: number; flipHorizontal?: boolean; flipVertical?: boolean }
  /**
   * En Cornerstone 5 el giro se lee con `getRotation` y se aplica con
   * `setViewPresentation`: poner `rotation` en la cámara no hace nada visible.
   * Las vistas más viejas sí lo aceptan en la cámara, y ahí se usa de respaldo.
   */
  getRotation?: () => number
  setViewPresentation?: (presentacion: { rotation?: number }) => void
  setCamera?: (camara: {
    rotation?: number
    flipHorizontal?: boolean
    flipVertical?: boolean
  }) => void
  getZoom?: () => number
  setZoom?: (valor: number) => void
  resetCamera?: () => unknown
  render?: () => void
  getImageIds?: () => string[]
  getCurrentImageIdIndex?: () => number
  setImageIdIndex?: (indice: number) => unknown
}

export interface EstadoDeVista {
  indice: number
  total: number
  /** Centro y ancho de la ventana; `null` mientras no se conocen. */
  wc: number | null
  ww: number | null
  zoom: number
  /** Grados, 0 a 359. */
  rotacion: number
  volteoH: boolean
  volteoV: boolean
  invertido: boolean
}

export const ZOOM_MINIMO = 0.2
export const ZOOM_MAXIMO = 20

const normalizarGrados = (grados: number) => ((Math.round(grados) % 360) + 360) % 360

function leerGiro(vista: VistaLike): number {
  return normalizarGrados(vista.getRotation?.() ?? vista.getCamera?.().rotation ?? 0)
}

function ponerGiro(vista: VistaLike, grados: number): void {
  const nuevo = normalizarGrados(grados)
  if (vista.setViewPresentation) vista.setViewPresentation({ rotation: nuevo })
  else vista.setCamera?.({ rotation: nuevo })
}

/** Lee de la vista todo lo que se pinta sobre la imagen. */
export function leerEstado(vista: VistaLike): EstadoDeVista {
  const propiedades = vista.getProperties?.() ?? {}
  const camara = vista.getCamera?.() ?? {}
  const rango = propiedades.voiRange
  const ventana = rango ? ventanaDeRango(rango.lower, rango.upper) : null
  return {
    indice: vista.getCurrentImageIdIndex?.() ?? 0,
    total: vista.getImageIds?.().length ?? 0,
    wc: ventana?.wc ?? null,
    ww: ventana?.ww ?? null,
    zoom: vista.getZoom?.() ?? 1,
    rotacion: leerGiro(vista),
    volteoH: Boolean(camara.flipHorizontal),
    volteoV: Boolean(camara.flipVertical),
    invertido: Boolean(propiedades.invert),
  }
}

export function aplicarVentana(vista: VistaLike, wc: number, ww: number): void {
  vista.setProperties?.({ voiRange: rangoDeVentana(wc, ww) })
  vista.render?.()
}

/** «Automático»: la ventana que trae el estudio, sin los ajustes a mano. */
export function ventanaAutomatica(vista: VistaLike): void {
  const invertido = vista.getProperties?.().invert
  vista.resetProperties?.()
  // `resetProperties` también quita la inversión; no es lo que se pidió.
  if (invertido) vista.setProperties?.({ invert: true })
  vista.render?.()
}

export function invertir(vista: VistaLike): void {
  vista.setProperties?.({ invert: !vista.getProperties?.().invert })
  vista.render?.()
}

/** Gira en pasos (90° por omisión). Sumar y normalizar: 270 + 90 vuelve a 0. */
export function rotar(vista: VistaLike, grados = 90): void {
  ponerGiro(vista, leerGiro(vista) + grados)
  vista.render?.()
}

export function voltear(vista: VistaLike, eje: 'h' | 'v'): void {
  const camara = vista.getCamera?.() ?? {}
  vista.setCamera?.(
    eje === 'h'
      ? { flipHorizontal: !camara.flipHorizontal }
      : { flipVertical: !camara.flipVertical }
  )
  vista.render?.()
}

/** Acerca o aleja multiplicando; nunca sale de [ZOOM_MINIMO, ZOOM_MAXIMO]. */
export function acercar(vista: VistaLike, factor: number): void {
  const actual = vista.getZoom?.() ?? 1
  const nuevo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, actual * factor))
  vista.setZoom?.(nuevo)
  vista.render?.()
}

/** Encuadra la imagen completa (no toca la ventana ni el giro). */
export function ajustarAPantalla(vista: VistaLike): void {
  vista.resetCamera?.()
  vista.render?.()
}

/** Todo como llegó: ventana, zoom, posición, giro, volteo e inversión. */
export function restablecer(vista: VistaLike): void {
  vista.resetProperties?.()
  vista.resetCamera?.()
  ponerGiro(vista, 0)
  vista.setCamera?.({ flipHorizontal: false, flipVertical: false })
  vista.render?.()
}

/** Vuelve a dejar la vista como estaba al marcar un corte clave. */
export function aplicarEstado(vista: VistaLike, estado: Partial<EstadoDeVista>): void {
  const propiedades: { voiRange?: { lower: number; upper: number }; invert?: boolean } = {}
  if (typeof estado.wc === 'number' && typeof estado.ww === 'number') {
    propiedades.voiRange = rangoDeVentana(estado.wc, estado.ww)
  }
  if (typeof estado.invertido === 'boolean') propiedades.invert = estado.invertido
  if (Object.keys(propiedades).length > 0) vista.setProperties?.(propiedades)

  const camara: { flipHorizontal?: boolean; flipVertical?: boolean } = {}
  if (typeof estado.rotacion === 'number') ponerGiro(vista, estado.rotacion)
  if (typeof estado.volteoH === 'boolean') camara.flipHorizontal = estado.volteoH
  if (typeof estado.volteoV === 'boolean') camara.flipVertical = estado.volteoV
  if (Object.keys(camara).length > 0) vista.setCamera?.(camara)

  if (typeof estado.zoom === 'number' && estado.zoom > 0) {
    vista.setZoom?.(Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, estado.zoom)))
  }
  vista.render?.()
}

/** Va al corte pedido, sin salirse de la pila. */
export function irAlCorte(vista: VistaLike, indice: number): number {
  const total = vista.getImageIds?.().length ?? 0
  if (total === 0) return 0
  const destino = Math.min(total - 1, Math.max(0, Math.round(indice)))
  vista.setImageIdIndex?.(destino)
  return destino
}

export const FPS_DEL_CINE = [4, 8, 12, 20] as const
export const FPS_POR_OMISION = 8

export interface Cine {
  iniciar: (cuadrosPorSegundo?: number) => void
  detener: () => void
  activo: () => boolean
}

/**
 * Reproduce los cortes en bucle. Al llegar al último vuelve al primero (así se
 * revisa una serie corta sin tocar nada). Se detiene solo al destruir la pila:
 * quien lo crea es responsable de llamar `detener`.
 */
export function crearCine(
  vista: VistaLike,
  alAvanzar: (indice: number) => void,
  temporizador: {
    cada: (accion: () => void, ms: number) => unknown
    parar: (id: unknown) => void
  } = {
    cada: (accion, ms) => setInterval(accion, ms),
    parar: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  }
): Cine {
  let id: unknown = null
  const detener = () => {
    if (id !== null) temporizador.parar(id)
    id = null
  }
  return {
    iniciar: (cuadros = FPS_POR_OMISION) => {
      detener()
      const total = vista.getImageIds?.().length ?? 0
      if (total <= 1) return
      const ms = Math.round(1000 / Math.min(60, Math.max(1, cuadros)))
      id = temporizador.cada(() => {
        const actual = vista.getCurrentImageIdIndex?.() ?? 0
        alAvanzar(irAlCorte(vista, actual + 1 >= total ? 0 : actual + 1))
      }, ms)
    },
    detener,
    activo: () => id !== null,
  }
}
