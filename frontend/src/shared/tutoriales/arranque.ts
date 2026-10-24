/**
 * Cuándo se puede arrancar un recorrido que la persona pidió en otra pantalla.
 *
 * Ningún recorrido arranca solo. Pero cuando alguien pide uno de otra pantalla
 * (desde el centro de ayuda o el recorrido completo), se navega y se espera a
 * que la pantalla termine de cargar: esto decide si ya es buen momento.
 */

/**
 * ¿Es buen momento? No si hay un modal abierto (se está capturando algo) ni si
 * el cursor está en un campo: arrancar un recorrido mientras la doctora
 * escribe la nota le robaría el foco a media frase.
 */
export function esMomentoOportuno(doc: Document = document): boolean {
  if (doc.querySelector('.modal.show')) return false
  const activo = doc.activeElement as HTMLElement | null
  if (activo) {
    const etiqueta = activo.tagName
    if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return false
    if (activo.isContentEditable) return false
  }
  return true
}
