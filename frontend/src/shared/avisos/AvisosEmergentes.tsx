/**
 * Emergentes de los avisos que piden hacer algo (paciente en sala, consulta
 * por cobrar, control prenatal por agendar).
 *
 * No se cierran solos: antes duraban 5 segundos y, si la pestaña estaba oculta,
 * se iban sin que nadie los viera (plan 27, F-3). Tampoco roban el foco ni
 * bloquean nada: se puede seguir escribiendo la nota con un aviso en pantalla.
 * A la vista caben tres; el resto se resume en «y N más», que abre el centro
 * de avisos. En el celular, uno solo: tres tarjetas apiladas tapaban media
 * pantalla.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBell, cilWarning } from '@coreui/icons'
import './avisos.css'

export interface AvisoEmergente {
  clave: string
  titulo: string
  mensaje: string
  /** Sin `ir`, el aviso no lleva a ninguna pantalla que la persona pueda abrir. */
  ir?: () => void
  etiquetaIr?: string
  cerrar: () => void
  urgente?: boolean
}

export const MAXIMO_A_LA_VISTA = 3
export const MAXIMO_EN_CELULAR = 1
const CONSULTA_CELULAR = '(max-width: 575.98px)'

const esCelular = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_CELULAR).matches

/** Cuántos emergentes caben a la vista según el ancho, y se ajusta si gira la pantalla. */
function useMaximoALaVista(): number {
  const [celular, setCelular] = useState(esCelular)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const consulta = window.matchMedia(CONSULTA_CELULAR)
    const alCambiar = () => setCelular(consulta.matches)
    consulta.addEventListener?.('change', alCambiar)
    return () => consulta.removeEventListener?.('change', alCambiar)
  }, [])
  return celular ? MAXIMO_EN_CELULAR : MAXIMO_A_LA_VISTA
}

interface Props {
  /** Del más nuevo al más viejo. */
  avisos: AvisoEmergente[]
  alVerTodos: () => void
}

const AvisosEmergentes = ({ avisos, alVerTodos }: Props) => {
  const maximo = useMaximoALaVista()
  const visibles = avisos.slice(0, maximo)
  const restantes = avisos.length - visibles.length

  return createPortal(
    // La región existe aunque esté vacía: un `aria-live` que aparece junto con
    // su contenido no siempre lo anuncian los lectores de pantalla.
    <div className="avisos-emergentes" role="status" aria-live="polite" aria-label="Avisos por atender">
      {visibles.map((aviso) => (
        <div
          key={aviso.clave}
          className={`aviso-emergente${aviso.urgente ? ' aviso-emergente--urgente' : ''}`}
          data-testid="aviso-emergente"
        >
          <CIcon icon={aviso.urgente ? cilWarning : cilBell} className="aviso-emergente__icono" aria-hidden="true" />
          <div className="aviso-emergente__cuerpo">
            <div className="aviso-emergente__titulo">{aviso.titulo}</div>
            <div className="aviso-emergente__mensaje">{aviso.mensaje}</div>
            <div className="aviso-emergente__acciones">
              {aviso.ir && (
                <CButton color="primary" size="sm" onClick={aviso.ir}>
                  {aviso.etiquetaIr ?? 'Ir'}
                </CButton>
              )}
              <CButton color="secondary" variant="ghost" size="sm" onClick={aviso.cerrar}>
                Cerrar
              </CButton>
            </div>
          </div>
        </div>
      ))}
      {restantes > 0 && (
        <CButton color="secondary" size="sm" className="avisos-emergentes__mas shadow-sm" onClick={alVerTodos}>
          y {restantes} {restantes === 1 ? 'aviso más' : 'avisos más'} por atender
        </CButton>
      )}
    </div>,
    document.body,
  )
}

export default AvisosEmergentes
