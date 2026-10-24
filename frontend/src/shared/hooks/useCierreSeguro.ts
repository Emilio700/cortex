/**
 * Que un formulario en un modal no se pierda por un toque de más (plan 29, lote 8).
 *
 * En el teléfono es fácil tocar fuera del modal, o el sistema manda «atrás» y
 * el modal se cierra con todo lo escrito. Con datos sin guardar (`sucio`):
 *
 * - el fondo y Esc ya no cierran solos: preguntan antes;
 * - `pedirCierre` (para la ✕ y «Cancelar») también pregunta.
 *
 * Sin cambios, todo cierra como siempre. Uso:
 *
 *   const { propsModal, pedirCierre } = useCierreSeguro({ visible, sucio, onClose })
 *   <CModal visible={visible} onClose={onClose} {...propsModal}>
 *     <CModalHeader closeButton={false}> … <CCloseButton onClick={pedirCierre} /></CModalHeader>
 *
 * CoreUI no deja cancelar un cierre ya empezado (llama `onClose` al terminar
 * la animación), por eso con cambios el fondo pasa a `static` y la pregunta se
 * hace aquí, antes de cerrar.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export const PREGUNTA_DESCARTAR = 'Tienes cambios sin guardar. ¿Cerrar y descartarlos?'

interface Opciones {
  visible: boolean
  sucio: boolean
  onClose: () => void
  pregunta?: string
}

export const useCierreSeguro = ({ visible, sucio, onClose, pregunta = PREGUNTA_DESCARTAR }: Opciones) => {
  const ultimo = useRef({ sucio, onClose, pregunta })
  ultimo.current = { sucio, onClose, pregunta }

  const pedirCierre = useCallback(() => {
    const { sucio: haySucio, onClose: cerrar, pregunta: texto } = ultimo.current
    if (haySucio && !window.confirm(texto)) return
    cerrar()
  }, [])

  // Con cambios, el fondo y Esc los atiende este hook (el modal está en `static`).
  useEffect(() => {
    if (!visible || !sucio) return
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        pedirCierre()
      }
    }
    const alSoltar = (evento: MouseEvent) => {
      // El fondo es el propio `.modal` (el diálogo va dentro).
      const objetivo = evento.target as HTMLElement | null
      if (objetivo?.classList?.contains('modal') && objetivo.classList.contains('show')) pedirCierre()
    }
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('mouseup', alSoltar)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('mouseup', alSoltar)
    }
  }, [visible, sucio, pedirCierre])

  return {
    propsModal: {
      backdrop: (sucio ? 'static' : true) as boolean | 'static',
      keyboard: !sucio,
    },
    pedirCierre,
  }
}

/**
 * ¿Cambió el formulario desde que se abrió?
 *
 * La foto se toma en el render siguiente a abrir, cuando el formulario ya
 * cargó sus datos (los formularios los cargan en un efecto al abrirse). Tomarla
 * en el mismo render que se abre guardaría lo de la apertura anterior.
 */
export const useCambiosDesdeQueAbrio = (visible: boolean, valor: unknown, clave?: unknown): boolean => {
  const [foto, setFoto] = useState<string | null>(null)
  const pendiente = useRef(false)
  const serializado = JSON.stringify(valor)

  useEffect(() => {
    if (visible) {
      pendiente.current = true
      setFoto(null)
    }
  }, [visible, clave])

  useEffect(() => {
    if (!visible || !pendiente.current) return
    // Se espera un render para que el efecto de carga del formulario aplique.
    const id = window.setTimeout(() => {
      pendiente.current = false
      setFoto(serializado)
    }, 0)
    return () => window.clearTimeout(id)
  }, [visible, serializado])

  return visible && foto !== null && serializado !== foto
}
