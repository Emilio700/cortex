import { useId, useState, type ReactNode } from 'react'
import { CCard, CCardBody, CCollapse, CFormSwitch } from '@coreui/react-pro'

interface ConsultationSectionProps {
  /** Número del bloque dentro del flujo de la consulta. */
  step: number
  /** Color CoreUI de la insignia del paso. */
  stepColor?: string
  /** Icono o emoji que acompaña al título. */
  icon?: ReactNode
  title: string
  subtitle?: string
  /** Insignia que avisa, con la sección cerrada, que ya hay información registrada. */
  summary?: ReactNode
  /** Estas secciones arrancan siempre cerradas; se abren con el interruptor. */
  defaultOpen?: boolean
  /**
   * Ancla de los tutoriales. Si no se da, sale del título
   * ("Plan clínico" → "consulta-seccion-plan-clinico"), para que cada sección
   * se pueda señalar sin que la pantalla que la usa tenga que acordarse.
   */
  tourId?: string
  children: ReactNode
}

/** "Consentimiento informado" → "consentimiento-informado", sin acentos ni signos. */
export const idDeTutorial = (titulo: string) =>
  titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Bloque plegable de la consulta.
 *
 * El contenido permanece montado aunque esté cerrado, para no alterar el momento
 * en que los componentes internos cargan o guardan su información.
 */
const ConsultationSection = ({
  step,
  stepColor = 'info',
  icon,
  title,
  subtitle,
  summary,
  defaultOpen = false,
  tourId,
  children,
}: ConsultationSectionProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = `consulta-seccion-${useId()}`

  const toggle = () => setOpen((current) => !current)

  return (
    <CCard className="shadow-sm" data-tour={tourId ?? `consulta-seccion-${idDeTutorial(title)}`}>
      <CCardBody className="p-3">
        <div className={`d-flex align-items-center gap-2 ${open ? 'mb-3 pb-2 border-bottom' : ''}`}>
          <div
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-controls={contentId}
            onClick={toggle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggle()
              }
            }}
            className="d-flex align-items-center gap-2 flex-grow-1 min-width-0"
            style={{ cursor: 'pointer' }}
          >
            <span className={`badge bg-${stepColor} rounded-pill me-1`}>{step}</span>
            {icon}
            <div className="text-start">
              <h5 className="mb-0 fw-bold">{title}</h5>
              {subtitle && <small className="text-body-secondary">{subtitle}</small>}
            </div>
          </div>
          {summary}
          <CFormSwitch
            className="mb-0 ms-2 flex-shrink-0"
            id={`${contentId}-switch`}
            checked={open}
            onChange={toggle}
            label={open ? 'Ocultar' : 'Mostrar'}
            aria-label={`${open ? 'Ocultar' : 'Mostrar'} ${title}`}
          />
        </div>
        <CCollapse visible={open}>
          <div id={contentId}>{children}</div>
        </CCollapse>
      </CCardBody>
    </CCard>
  )
}

export default ConsultationSection
