/**
 * Lo que el equipo puede, para decidir con qué calidad abre Neuro 3D. Vive
 * aparte de la escena (no carga three.js): se pregunta antes de crearla.
 *
 * El contexto WebGL2 de prueba se suelta enseguida: el navegador sólo permite
 * unos cuantos a la vez y la escena va a pedir el suyo.
 */
import type { CapacidadDelEquipo } from '../dominio/calidad'
import { quiereMenosMovimiento } from './movimiento'

const esMovil = (): boolean => {
  try {
    const datos = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    if (datos?.mobile) return true
    const tactil = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    const angosta = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 768
    return tactil && angosta
  } catch {
    return false
  }
}

export const leerCapacidad = (): CapacidadDelEquipo => {
  const base: CapacidadDelEquipo = { webgl2: false, maxTextura: 0, reducirMovimiento: quiereMenosMovimiento(), movil: esMovil(), gpu: null }
  // Sin la clase no hay WebGL2 (jsdom, navegadores viejos): ni se intenta.
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return base
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return base
    const maxTextura = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0
    // El nombre de la tarjeta, si el navegador lo da (algunos lo ocultan por
    // privacidad). Sólo decide la calidad y va en un tooltip; no sale del equipo.
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') || null : null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { ...base, webgl2: true, maxTextura, gpu }
  } catch {
    return base
  }
}
