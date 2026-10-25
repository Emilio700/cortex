/**
 * Un módulo opcional con su interruptor. No guarda nada por su cuenta: el
 * interruptor refleja el estado que confirmó el servidor y la pantalla decide.
 */
import { CCard, CCardBody, CFormSwitch, CSpinner } from '@coreui/react-pro'
import type { ModuloDelConsultorio } from '../../../shared/services/modulos'
import { motivoParaNoEncender } from '../dominio/sistema'

export interface TarjetaModuloProps {
  modulo: ModuloDelConsultorio
  guardando: boolean
  /** Solo se pasa cuando el servidor confirmó el último cambio. */
  confirmado?: boolean
  error?: string | null
  onCambiar: (activo: boolean) => void
}

const TarjetaModulo = ({ modulo, guardando, confirmado, error, onCambiar }: TarjetaModuloProps) => {
  const motivo = motivoParaNoEncender(modulo)
  const idInterruptor = `modulo-${modulo.id}`
  const idAyuda = `${idInterruptor}-ayuda`
  return (
    <CCard className="h-100">
      <CCardBody>
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <h2 className="h6 mb-1">
              <label htmlFor={idInterruptor}>{modulo.nombre}</label>
            </h2>
            <p className="text-body-secondary small mb-0" id={idAyuda}>
              {modulo.descripcion}
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            {guardando && <CSpinner size="sm" aria-label="Guardando" />}
            <CFormSwitch
              id={idInterruptor}
              size="lg"
              checked={modulo.activo}
              disabled={guardando || Boolean(motivo)}
              aria-describedby={idAyuda}
              onChange={(evento) => onCambiar(evento.target.checked)}
            />
          </div>
        </div>
        {motivo && <p className="small text-warning-emphasis mt-2 mb-0">{motivo}</p>}
        {error && (
          <p className="small text-danger mt-2 mb-0" role="alert">
            {error}
          </p>
        )}
        {confirmado && !error && (
          <p className="small text-success mt-2 mb-0" role="status">
            Guardado: {modulo.activo ? 'encendido' : 'apagado'} para todo el consultorio.
          </p>
        )}
      </CCardBody>
    </CCard>
  )
}

export default TarjetaModulo
