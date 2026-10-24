/**
 * Menú «⋯ Más acciones» de una orden de estudio (plan 26, D-1 y §3.4).
 *
 * La fila de una orden lleva una sola acción principal visible; lo demás vive
 * aquí: lo que pase quien llama (reimprimir solo este estudio, anexar…) y, al
 * final, Cancelar o Rechazar. Los estados del laboratorio (aceptada,
 * programada, muestra tomada, en proceso) ya no se ofrecen: GEMS no tiene
 * laboratorio propio y nadie en la clínica podía medirlos.
 *
 * Cancelar o rechazar exige un motivo (al menos 3 caracteres), como en el
 * servidor. Regla de oro (plan 22): el estado solo se da por cambiado cuando el
 * servidor responde 200; un 409 (otra pestaña la movió) se muestra tal cual.
 */
import { useState } from 'react'
import {
  CButton,
  CDropdown,
  CDropdownDivider,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  CFormTextarea,
  CSpinner,
} from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { useAuth } from '../../../shared/context/AuthContext'

export interface AccionExtra {
  etiqueta: string
  onClick: () => void
}

interface Props {
  orderId: number
  /** Lo que el servidor deja hacer (`acciones_de_estado`, o `allowed_transitions` de un servidor viejo). */
  acciones: string[]
  /** Se llama tras un cambio de estado confirmado por el servidor. */
  onChanged: () => void
  extras?: AccionExtra[]
  nombreEstudio?: string
}

/** Lo único que la interfaz ofrece para mover el estado a mano (D-1). */
const OFRECIDAS: Record<string, string> = {
  cancelled: 'Cancelar orden',
  rejected: 'Rechazar orden',
}

const MenuAccionesOrden = ({ orderId, acciones, onChanged, extras = [], nombreEstudio }: Props) => {
  const { can } = useAuth()
  const [trabajando, setTrabajando] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const deEstado = can('clinical_tracking.update') ? acciones.filter((a) => a in OFRECIDAS) : []
  if (deEstado.length === 0 && extras.length === 0) return null

  const mover = async (destino: string, razon: string) => {
    setTrabajando(true)
    setError(null)
    try {
      await apiClient.post(`/clinical-tracking/orders/${orderId}/status`, {
        status: destino,
        reason: razon,
      })
      setConfirmando(null)
      setMotivo('')
      onChanged()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado de la orden.'))
    } finally {
      setTrabajando(false)
    }
  }

  const motivoValido = motivo.trim().length >= 3

  return (
    <div data-tour="orden-mas-acciones">
      <CDropdown alignment="end" variant="btn-group">
        <CDropdownToggle
          color="secondary"
          variant="ghost"
          size="sm"
          caret={false}
          // Blanco de dedo de 40 px: en el celular el «⋯» de 20 px no se atinaba.
          style={{ minWidth: 40, minHeight: 40 }}
          aria-label={nombreEstudio ? `Más acciones de ${nombreEstudio}` : 'Más acciones'}
          title="Más acciones"
        >
          ⋯
        </CDropdownToggle>
        <CDropdownMenu>
          {extras.map((extra) => (
            <CDropdownItem key={extra.etiqueta} role="button" onClick={extra.onClick}>
              {extra.etiqueta}
            </CDropdownItem>
          ))}
          {extras.length > 0 && deEstado.length > 0 && <CDropdownDivider />}
          {deEstado.map((destino) => (
            <CDropdownItem
              key={destino}
              role="button"
              className="text-danger"
              onClick={() => {
                setError(null)
                setMotivo('')
                setConfirmando(destino)
              }}
            >
              {OFRECIDAS[destino]}
            </CDropdownItem>
          ))}
        </CDropdownMenu>
      </CDropdown>

      {confirmando && (
        <div className="border rounded p-2 mt-2 text-start" style={{ minWidth: 260 }}>
          <label className="small fw-semibold d-block mb-1" htmlFor={`motivo-${orderId}`}>
            {confirmando === 'cancelled' ? 'Motivo de la cancelación' : 'Motivo del rechazo'}
          </label>
          <CFormTextarea
            id={`motivo-${orderId}`}
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Al menos 3 caracteres"
          />
          <div className="d-flex gap-2 mt-2">
            <CButton
              size="sm"
              color="danger"
              disabled={trabajando || !motivoValido}
              onClick={() => void mover(confirmando, motivo.trim())}
            >
              {trabajando ? <CSpinner size="sm" /> : 'Confirmar'}
            </CButton>
            <CButton
              size="sm"
              color="light"
              disabled={trabajando}
              onClick={() => {
                setConfirmando(null)
                setMotivo('')
              }}
            >
              No, volver
            </CButton>
          </div>
        </div>
      )}

      {error && (
        <div className="small text-danger mt-1" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}

export default MenuAccionesOrden
