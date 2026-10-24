/**
 * Las páginas de un PDF, una debajo de otra, dibujadas en canvas (plan 26, N5).
 *
 * Se redibujan al ancho del contenedor, así un PDF tamaño carta se lee en un
 * teléfono de 360 px sin scroll horizontal. Si pdf.js no puede abrirlo, se dice
 * (nunca una hoja en blanco) y quien lo usa ofrece descargarlo.
 */
import { useEffect, useRef, useState } from 'react'
import { CSpinner } from '@coreui/react-pro'
import { abrirPdf, esCancelacion, type PdfAbierto } from './renderizarPdf'

interface Props {
  pdf: Blob
  titulo: string
  /** Se llama si no se pudo dibujar, con el motivo en español. */
  onError?: (mensaje: string) => void
}

const PdfEnCanvas = ({ pdf, titulo, onError }: Props) => {
  const contenedor = useRef<HTMLDivElement | null>(null)
  const [abierto, setAbierto] = useState<PdfAbierto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    let vigente = true
    let documento: PdfAbierto | null = null
    setAbierto(null)
    setError(null)
    abrirPdf(pdf)
      .then((d) => {
        documento = d
        if (vigente) setAbierto(d)
        else d.cerrar()
      })
      .catch(() => {
        if (!vigente) return
        const mensaje = 'No se pudo mostrar el PDF en esta pantalla. Descárgalo para verlo.'
        setError(mensaje)
        onError?.(mensaje)
      })
    return () => {
      vigente = false
      documento?.cerrar()
    }
    // onError cambia en cada render de quien lo usa; el PDF es lo que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf])

  // El ancho del contenedor decide la escala. Se mide con ResizeObserver: el
  // visor se abre en un modal que al montar todavía mide 0, y un panel cambia
  // de ancho sin que la ventana cambie (R6). Con 0 no se dibuja: se espera a
  // tener medida en vez de dibujar a un ancho inventado.
  useEffect(() => {
    const nodo = contenedor.current
    if (!nodo) return
    const medir = () => {
      const w = nodo.clientWidth
      setAncho(w > 0 ? Math.max(200, Math.min(w - 16, 1000)) : 0)
    }
    medir()
    if (typeof ResizeObserver === 'function') {
      const observador = new ResizeObserver(medir)
      observador.observe(nodo)
      return () => observador.disconnect()
    }
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [abierto])

  if (error) {
    return (
      <div className="text-center p-4 text-danger" role="alert">
        {error}
      </div>
    )
  }

  return (
    <div ref={contenedor} className="w-100 py-2" aria-label={titulo} role="document">
      {!abierto ? (
        <div className="text-center text-body-secondary py-5">
          <CSpinner />
          <div className="mt-2">Preparando el PDF…</div>
        </div>
      ) : (
        Array.from({ length: abierto.paginas }, (_, i) => (
          <PaginaPdf
            key={i}
            documento={abierto}
            numero={i + 1}
            total={abierto.paginas}
            ancho={ancho}
          />
        ))
      )}
    </div>
  )
}

const PaginaPdf = ({
  documento,
  numero,
  total,
  ancho,
}: {
  documento: PdfAbierto
  numero: number
  total: number
  ancho: number
}) => {
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!lienzo.current || ancho <= 0) return
    const dibujo = documento.dibujar(numero, lienzo.current, ancho)
    dibujo.listo.catch((err) => {
      // Una cancelación es normal (cambió el ancho). Otro fallo deja el recuadro
      // de esa página vacío; las demás siguen.
      if (esCancelacion(err)) return
    })
    // Antes de dibujar a otro ancho, se cancela el dibujo en curso.
    return () => dibujo.cancelar()
  }, [documento, numero, ancho])
  return (
    <div className="d-flex justify-content-center mb-2">
      <canvas
        ref={lienzo}
        className="bg-white shadow-sm"
        aria-label={`Página ${numero} de ${total}`}
        role="img"
      />
    </div>
  )
}

export default PdfEnCanvas
