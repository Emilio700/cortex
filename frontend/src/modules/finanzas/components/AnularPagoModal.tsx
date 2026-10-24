/**
 * Anular un pago mal capturado.
 *
 * Un pago nunca se borra ni se edita: se anula con motivo y se captura el
 * correcto. Así el corte de ayer no cambia a espaldas de nadie y queda quién
 * lo anuló y por qué. El modal sólo se cierra cuando el servidor confirmó.
 */
import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from '@coreui/react-pro'

import { useAuth } from '../../../shared/context/AuthContext'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { useFinanzas } from '../hooks/useFinanzas'
import type { Payment } from '../types'
import { etiquetaMetodo, formatoMoneda } from '../utils/cobro'

interface Props {
  pago: Payment | null
  onClose: () => void
  /** `consultaCancelada`: el servidor anuló el pago Y canceló su consulta express, juntos. */
  onAnulado: (pago: Payment, detalle: { consultaCancelada: boolean }) => void
}

export const AnularPagoModal: React.FC<Props> = ({ pago, onClose, onAnulado }) => {
  const { anularPago } = useFinanzas()
  const { can } = useAuth()
  const [motivo, setMotivo] = useState('')
  // Una consulta express se creó al cobrar: si el cobro fue un error, lo más
  // probable es que la consulta también. Marcado por defecto para que no quede
  // en la agenda una consulta inventada "por cobrar".
  const esExpress = pago?.appointment_origen === 'express'
  const puedeCancelar = can('appointments.cancel')
  const [cancelarExpress, setCancelarExpress] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // El motivo es obligatorio: su aviso va junto al campo, separado del error
  // que devuelva el servidor al anular.
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    setMotivo('')
    setError(null)
    setErrorMotivo(null)
    setCancelarExpress(true)
  }, [pago?.id])

  const confirmar = async () => {
    if (!pago) return
    if (!motivo.trim()) {
      setErrorMotivo('Escribe el motivo de la anulación.')
      return
    }
    setErrorMotivo(null)
    setAnulando(true)
    setError(null)
    try {
      const cancelar = esExpress && puedeCancelar && cancelarExpress
      const anulado = await anularPago(pago.id, motivo.trim(), { cancelarConsultaExpress: cancelar })
      // El servidor hace las dos cosas o ninguna: si contestó bien, las dos quedaron.
      onAnulado(anulado, { consultaCancelada: cancelar })
    } catch (err: any) {
      setError(err?.message || 'No se pudo anular el pago. Sigue vigente.')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <CModal visible={pago !== null} onClose={onClose}>
      <CModalHeader>
        <CModalTitle>Anular pago</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {pago && (
          <p className="small">
            {pago.patient_name || `Paciente #${pago.patient_id}`}: {formatoMoneda(pago.amount)} con{' '}
            {etiquetaMetodo(pago.method).toLowerCase()}, recibido por{' '}
            {pago.received_by_name || 'otra persona'}.
          </p>
        )}
        <p className="small text-muted">
          El pago no se borra: queda tachado en el historial y deja de contar en los totales. Si el
          monto estaba mal, después registra el correcto.
        </p>
        <CFormLabel htmlFor="anular-motivo" className="small">
          Motivo <span className="text-danger">*</span>
        </CFormLabel>
        <CFormInput
          id="anular-motivo"
          value={motivo}
          disabled={anulando}
          placeholder="Ej. MONTO CAPTURADO MAL"
          invalid={Boolean(errorMotivo)}
          aria-invalid={Boolean(errorMotivo) || undefined}
          aria-describedby={errorMotivo ? 'error-anular-motivo' : undefined}
          onChange={enMayusculas((v) => {
            setMotivo(v)
            setErrorMotivo(null)
          })}
        />
        <ErrorDeCampo id="error-anular-motivo" mensaje={errorMotivo} />
        {esExpress && puedeCancelar && (
          <CFormCheck
            className="mt-3"
            id="anular-cancelar-express"
            label="Cancelar también la consulta express registrada al cobrar"
            checked={cancelarExpress}
            disabled={anulando}
            onChange={(e) => setCancelarExpress(e.target.checked)}
          />
        )}
        {esExpress && puedeCancelar && cancelarExpress && (
          <p className="small text-muted mb-0">
            La consulta se cancela con el mismo motivo. Si ya tiene nota, receta o certificado, o tiene otros
            cobros, no se cancela y el pago tampoco se anula: el sistema te lo dirá.
          </p>
        )}
        {esExpress && !puedeCancelar && (
          <p className="small text-muted mt-3 mb-0">
            Este cobro es de una consulta express. Si la consulta no ocurrió, pide a recepción que la cancele
            en la agenda.
          </p>
        )}
        {error && (
          <CAlert color="danger" className="py-2 mt-3 mb-0" role="alert">
            {error}
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={onClose} disabled={anulando}>
          Cancelar
        </CButton>
        <CButton color="danger" className="text-white" onClick={() => void confirmar()} disabled={anulando}>
          {anulando ? 'Anulando...' : 'Anular pago'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default AnularPagoModal
