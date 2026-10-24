/**
 * Una sección del perfil del médico, plegable en el teléfono.
 *
 * En el celular el perfil medía ~10 600 px: «Perfil incompleto: falta cédula»
 * mandaba a «Datos profesionales», que quedaba ~6 000 px abajo, después de los
 * dos editores de membrete (plan 29). En el teléfono cada sección es un botón
 * que se abre y se cierra; en la computadora no cambia nada, todo a la vista.
 *
 * Plegada, la sección sigue montada (sólo se oculta): lo que el médico haya
 * cambiado sin guardar en un membrete no se pierde por cerrar la sección.
 */
import { useEffect, useState, type ReactNode } from 'react'
import CIcon from '@coreui/icons-react'
import { cilChevronBottom, cilChevronRight } from '@coreui/icons'
import './seccionPerfil.css'

const CONSULTA_TELEFONO = '(max-width: 767.98px)'

const esTelefono = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_TELEFONO).matches

/** ¿La pantalla es de teléfono? Se ajusta si se gira o cambia de tamaño. */
export function useEsTelefono(): boolean {
  const [telefono, setTelefono] = useState(esTelefono)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const consulta = window.matchMedia(CONSULTA_TELEFONO)
    const alCambiar = () => setTelefono(consulta.matches)
    consulta.addEventListener?.('change', alCambiar)
    return () => consulta.removeEventListener?.('change', alCambiar)
  }, [])
  return telefono
}

interface Props {
  id: string
  titulo: string
  /** Lo que falta en esta sección, para decirlo en el botón plegado. */
  falta?: string | null
  abierta: boolean
  onAlternar: (id: string) => void
  children: ReactNode
}

const SeccionPerfil = ({ id, titulo, falta, abierta, onAlternar, children }: Props) => {
  const telefono = useEsTelefono()
  if (!telefono) return <section id={`perfil-seccion-${id}`}>{children}</section>

  const cuerpo = `perfil-seccion-${id}-cuerpo`
  return (
    <section id={`perfil-seccion-${id}`} className="perfil-seccion mb-2">
      <button
        type="button"
        className="perfil-seccion__boton"
        aria-expanded={abierta}
        aria-controls={cuerpo}
        onClick={() => onAlternar(id)}
      >
        <CIcon icon={abierta ? cilChevronBottom : cilChevronRight} className="flex-shrink-0" aria-hidden="true" />
        <span className="flex-grow-1 text-start" style={{ minWidth: 0 }}>{titulo}</span>
        {falta && <span className="badge bg-warning text-dark perfil-seccion__falta">{falta}</span>}
      </button>
      <div id={cuerpo} hidden={!abierta} className="pt-2">
        {children}
      </div>
    </section>
  )
}

export default SeccionPerfil
