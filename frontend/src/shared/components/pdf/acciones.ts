/**
 * Qué se puede hacer con un PDF según el dispositivo (plan 26, N5).
 *
 * En la computadora se imprime el PDF real: se carga en un marco oculto y se
 * abre su diálogo de impresión. Solo eso cuenta como «impreso» en la bitácora,
 * y solo cuando el diálogo de verdad se abrió.
 *
 * En el teléfono imprimir sobre un marco imprime una hoja vacía (o nada): ahí
 * las acciones son «Descargar» y «Abrir / Compartir», que le pasa el archivo al
 * visor o a la impresora del propio teléfono con la Web Share API. El sistema
 * no puede saber si después se imprimió, así que se anota «descargado», nunca
 * «impreso».
 */

/** ¿Pantalla táctil sin ratón (teléfono o tableta)? */
export const esDispositivoTactil = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches
  )
}

/**
 * Abre el diálogo de impresión del navegador sobre el PDF real, en un marco
 * oculto. Resuelve cuando el diálogo se abrió; lanza si el navegador no lo
 * permite o el PDF no cargó a tiempo. Quien llama anota «impreso» solo si esto
 * no lanzó.
 */
export const imprimirPdfReal = (pdf: Blob, esperaMs = 8000, esperaDibujoMs = 500): Promise<void> =>
  new Promise((resolver, fallar) => {
    const url = URL.createObjectURL(pdf)
    const marco = document.createElement('iframe')
    marco.setAttribute('aria-hidden', 'true')
    marco.setAttribute('tabindex', '-1')
    // Tamaño carta real, fuera de la vista. Un marco de 0×0 o con opacidad 0 lo
    // imprimen en blanco Chrome y Edge, y se habría anotado «impreso» (R5).
    marco.style.position = 'fixed'
    marco.style.left = '-10000px'
    marco.style.top = '0'
    marco.style.width = '816px'
    marco.style.height = '1056px'
    marco.style.border = '0'
    const limpiar = () => {
      // Se suelta después: algunos navegadores leen el marco tras el diálogo.
      window.setTimeout(() => {
        marco.remove()
        URL.revokeObjectURL(url)
      }, 60_000)
    }
    const reloj = window.setTimeout(() => {
      limpiar()
      fallar(new Error('El PDF no terminó de cargar para imprimir.'))
    }, esperaMs)
    marco.onload = () => {
      window.clearTimeout(reloj)
      // El visor de PDF del navegador termina de dibujar un instante después del
      // «load»: imprimir enseguida también podía salir en blanco.
      window.setTimeout(() => {
        try {
          const ventana = marco.contentWindow
          if (!ventana || typeof ventana.print !== 'function') throw new Error('sin ventana')
          ventana.focus()
          ventana.print()
          limpiar()
          resolver()
        } catch {
          limpiar()
          fallar(new Error('Este navegador no pudo abrir la impresión del PDF.'))
        }
      }, esperaDibujoMs)
    }
    marco.src = url
    document.body.appendChild(marco)
  })

/** ¿Se puede compartir este archivo con el menú del teléfono? */
export const puedeCompartirArchivo = (archivo: File): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.share === 'function' &&
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [archivo] })

/**
 * «Abrir / Compartir»: con Web Share, el menú del teléfono (imprimir, guardar,
 * WhatsApp…). Sin ella, el PDF en una pestaña nueva, con el visor del sistema.
 * Devuelve `'compartido'`, `'abierto'` o `'cancelado'` (la usuaria cerró el menú).
 */
export const abrirOCompartirPdf = async (
  pdf: Blob,
  nombre: string,
): Promise<'compartido' | 'abierto' | 'cancelado'> => {
  const archivo = new File([pdf], nombre, { type: 'application/pdf' })
  if (puedeCompartirArchivo(archivo)) {
    try {
      await navigator.share({ files: [archivo], title: nombre })
      return 'compartido'
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelado'
      // Cualquier otro fallo: se intenta abrirlo, que casi siempre funciona.
    }
  }
  const url = URL.createObjectURL(pdf)
  window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'abierto'
}
