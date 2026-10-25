/**
 * ¿Puede este equipo dibujar en 3D? Vive aparte de la escena para poder
 * preguntarlo sin descargar three.js: sin WebGL, la página lo dice con un
 * mensaje claro en vez de quedarse en blanco.
 */
export const hayWebGL = (): boolean => {
  try {
    if (typeof document === 'undefined') return false
    const lienzo = document.createElement('canvas')
    return Boolean(lienzo.getContext('webgl2') || lienzo.getContext('webgl'))
  } catch {
    return false
  }
}
