/**
 * Botón "¿Cómo se llena?" para usar dentro de un modal.
 *
 * Con un modal abierto el fondo queda bloqueado y el botón de ayuda del
 * encabezado no se puede pulsar, así que el formulario lleva el suyo. Si la
 * usuaria no tiene ese recorrido (por rol o permisos), no se pinta nada.
 */
import { CButton } from '@coreui/react-pro'
import { useTutoriales } from './TutorialesContext'

interface Props {
  recorridoId: string
  texto?: string
  className?: string
}

const BotonAyudaContextual = ({ recorridoId, texto = '¿Cómo se llena?', className }: Props) => {
  const { disponibles, iniciar } = useTutoriales()
  if (!disponibles.some((r) => r.id === recorridoId)) return null

  return (
    <CButton
      type="button"
      color="info"
      variant="ghost"
      size="sm"
      className={className ?? 'ms-auto me-2'}
      onClick={() => iniciar(recorridoId)}
      aria-label={`Ver recorrido: ${texto}`}
    >
      <span className="fw-bold me-1" aria-hidden="true">
        ?
      </span>
      {texto}
    </CButton>
  )
}

export default BotonAyudaContextual
