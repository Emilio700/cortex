/**
 * Las aplicaciones anteriores de una escala, de la más reciente a la más vieja.
 *
 * Las anuladas se quedan a la vista, tachadas y con su motivo: anular no borra
 * (el rastro de lo que se registró no se pierde). El modal de anulación solo
 * se cierra cuando el servidor confirmó; si falla, el error se queda adentro.
 */
import { useState } from 'react'
import {
  CAlert,
  CButton,
  CFormLabel,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'
import { formatearInstante } from '../../../shared/utils/date'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatearPuntaje } from '../dominio/motor'
import type { Escala } from '../dominio/tipos'
import type { EscalaAplicada } from '../servicios/escalasApi'

interface Props {
  escala: Escala
  registros: EscalaAplicada[]
  /** Sin esto no se ofrece anular (lectura o sin permiso). */
  onAnular?: (registro: EscalaAplicada, motivo: string) => Promise<void>
  /** Para no ofrecer anular lo que firmó otro: el servidor lo rechazaría. */
  usuarioId?: number
}

export default function HistorialEscala({ escala, registros, onAnular, usuarioId }: Props) {
  const [anulando, setAnulando] = useState<EscalaAplicada | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (registros.length === 0) {
    return (
      <p className="small text-body-secondary mb-0">
        Todavía no se ha aplicado {escala.nombre} a este paciente.
      </p>
    )
  }

  const confirmar = async () => {
    if (!anulando || !onAnular) return
    setEnviando(true)
    setError(null)
    try {
      await onAnular(anulando, motivo.trim())
      setAnulando(null)
      setMotivo('')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo anular la escala. Sigue registrada; vuelve a intentarlo.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="table-responsive">
        <table className="table table-sm small align-middle mb-0">
          <caption className="visually-hidden">Aplicaciones anteriores de {escala.nombre}</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Puntaje</th>
              <th scope="col">Interpretación</th>
              {onAnular && <th scope="col"><span className="visually-hidden">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => {
              const anulada = Boolean(r.anulado_at)
              return (
                <tr key={r.id} className={anulada ? 'escala-historial__anulada' : undefined}>
                  <td>{formatearInstante(r.aplicada_en, { dateStyle: 'medium', timeStyle: 'short' }, '—')}</td>
                  <td className="escala-historial__valor fw-semibold">
                    {formatearPuntaje(escala, r.puntaje)}
                    {r.detalle && <div className="fw-normal text-body-secondary">{r.detalle}</div>}
                  </td>
                  <td>
                    <span className="escala-historial__valor">{r.interpretacion ?? '—'}</span>
                    {r.notas && <div className="text-body-secondary">{r.notas}</div>}
                    {anulada && (
                      <div>
                        Anulada: {r.anulado_motivo}
                      </div>
                    )}
                  </td>
                  {onAnular && (
                    <td className="text-end">
                      {!anulada && (usuarioId === undefined || r.doctor_id === usuarioId) && (
                        <CButton
                          size="sm"
                          color="danger"
                          variant="outline"
                          onClick={() => {
                            setAnulando(r)
                            setMotivo('')
                            setError(null)
                          }}
                        >
                          Anular
                        </CButton>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <CModal visible={anulando !== null} onClose={() => !enviando && setAnulando(null)} alignment="center">
        <CModalHeader>
          <CModalTitle>Anular {escala.nombre}</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <p className="small">
            La escala no se borra: deja de contar en la gráfica y queda en el historial, tachada y con el motivo.
          </p>
          <CFormLabel htmlFor="escala-motivo-anulacion">¿Por qué se anula?</CFormLabel>
          <CFormTextarea
            id="escala-motivo-anulacion"
            className="gems-campo"
            rows={2}
            maxLength={500}
            value={motivo}
            onChange={enMayusculas(setMotivo)}
          />
          {error && (
            <CAlert color="danger" className="mt-3 mb-0 py-2">
              {error}
            </CAlert>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" disabled={enviando} onClick={() => setAnulando(null)}>
            Cancelar
          </CButton>
          <CButton color="danger" disabled={enviando || motivo.trim().length < 5} onClick={() => void confirmar()}>
            {enviando && <CSpinner size="sm" className="me-2" />}
            Anular escala
          </CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}
