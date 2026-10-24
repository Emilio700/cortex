/**
 * Dibuja un PDF en `<canvas>` con pdf.js (plan 26, N5).
 *
 * El visor mostraba los PDF en un `<iframe>` con una URL de Blob. En Chrome de
 * Android eso no se ve (el navegador no tiene visor de PDF incrustado) y en iOS
 * solo enseña la primera página. Las doctoras entran desde el celular, así que
 * el visor dibuja las páginas él mismo, en todos los dispositivos: una sola
 * forma de ver el papel, la misma en la computadora y en el teléfono.
 *
 * Se usa la compilación «legacy» de pdf.js, que trae los polyfills para
 * teléfonos con navegadores de hace un par de años. Se carga bajo demanda:
 * pesa, y solo hace falta cuando se abre un PDF. El worker se sirve como
 * archivo propio (`?url`), que es la forma en que Vite lo empaqueta.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'

let cargando: Promise<typeof import('pdfjs-dist')> | null = null

const pdfjs = () => {
  if (!cargando) {
    cargando = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([modulo, worker]) => {
      modulo.GlobalWorkerOptions.workerSrc = worker.default
      return modulo as unknown as typeof import('pdfjs-dist')
    })
  }
  return cargando
}

/** Un dibujo en curso: se puede cancelar antes de empezar otro en el mismo canvas. */
export interface Dibujo {
  listo: Promise<void>
  cancelar: () => void
}

export interface PdfAbierto {
  paginas: number
  /** Dibuja la página `n` (desde 1) en el canvas, al ancho dado en px de CSS. */
  dibujar: (n: number, canvas: HTMLCanvasElement, ancho: number) => Dibujo
  cerrar: () => void
}

/** pdf.js avisa así que se canceló un dibujo; no es un error. */
export const esCancelacion = (err: unknown) =>
  (err as { name?: string })?.name === 'RenderingCancelledException'

export const abrirPdf = async (pdf: Blob): Promise<PdfAbierto> => {
  const { getDocument } = await pdfjs()
  const datos = new Uint8Array(await pdf.arrayBuffer())
  // Los PDF llegan subidos por terceros (laboratorios, pacientes): por eso
  // pdf.js va en la 6.x, que ya no evalúa código del documento
  // (GHSA-hq66-cqwq-w95j: un PDF que ejecutaba JavaScript al abrirse).
  // Desde la 6 el documento se libera desde su tarea de carga.
  const carga = getDocument({ data: datos })
  const documento: PDFDocumentProxy = await carga.promise
  return {
    paginas: documento.numPages,
    dibujar: (n, canvas, ancho) => {
      // Dos dibujos sobre el mismo canvas se pisan y dejan la página en
      // blanco (R6): el componente cancela el anterior antes de pedir otro.
      let cancelado = false
      let tarea: { cancel: () => void; promise: Promise<void> } | null = null
      const listo = (async () => {
        const pagina = await documento.getPage(n)
        if (cancelado) return
        const base = pagina.getViewport({ scale: 1 })
        // Nítido en pantallas de alta densidad (casi todos los teléfonos).
        const densidad = Math.min(window.devicePixelRatio || 1, 3)
        const vista = pagina.getViewport({ scale: (ancho / base.width) * densidad })
        canvas.width = Math.floor(vista.width)
        canvas.height = Math.floor(vista.height)
        canvas.style.width = `${ancho}px`
        canvas.style.height = `${Math.floor(vista.height / densidad)}px`
        const contexto = canvas.getContext('2d')
        if (!contexto) throw new Error('Este navegador no puede dibujar el PDF.')
        tarea = pagina.render({ canvasContext: contexto, viewport: vista, canvas })
        await tarea.promise
      })()
      return {
        listo,
        cancelar: () => {
          cancelado = true
          tarea?.cancel()
        },
      }
    },
    cerrar: () => {
      void carga.destroy()
    },
  }
}
