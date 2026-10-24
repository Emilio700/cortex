/**
 * Corregir un documento subido al paciente equivocada (plan 29, lote 7).
 *
 * Tres acciones, todas con motivo obligatorio, que el servidor registra en la
 * bitácora: anular (sale de las vistas; el archivo se conserva), mover a la
 * paciente correcta (de la misma sucursal) y, solo administración, revertir una
 * anulación. Nada se borra. La pantalla solo anuncia lo que el servidor
 * confirmó; si lo rechaza (p. ej. es el archivo de un resultado de orden), su
 * explicación se ve aquí mismo.
 */
import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormInput,
  CFormLabel,
  CFormTextarea,
  CListGroup,
  CListGroupItem,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatEdad } from '../../../shared/utils/date'
import type { PatientDocument } from '../../../shared/hooks/usePatientDocuments'

export type Correccion = 'anular' | 'mover' | 'revertir'

interface PacienteDestino {
  id: number
  first_name: string
  last_name: string
  date_of_birth?: string | null
  cell_phone?: string | null
  phone?: string | null
  expediente_legacy?: number | null
}

const TITULOS: Record<Correccion, string> = {
  anular: 'Anular documento',
  mover: 'Mover a otro paciente',
  revertir: 'Revertir la anulación',
}

const EXPLICACIONES: Record<Correccion, string> = {
  anular:
    'El documento dejará de verse en el expediente. No se borra: el archivo se conserva y la administración puede revertirlo. Queda registrado quién y por qué.',
  mover:
    'El documento pasa al expediente del paciente que elijas. En los dos expedientes queda registrado el cambio y el motivo.',
  revertir: 'El documento vuelve a verse en el expediente del paciente. Queda registrado quién y por qué.',
}

interface Props {
  documento: PatientDocument | null
  accion: Correccion | null
  onClose: () => void
  /** Recibe lo que contestó el servidor, para anunciar lo que de verdad pasó. */
  onCorregido: (resultado: PatientDocument, accion: Correccion, destino?: PacienteDestino) => void
  ejecutar: {
    anular: (id: number, motivo: string) => Promise<PatientDocument>
    mover: (id: number, patientId: number, motivo: string) => Promise<PatientDocument>
    revertir: (id: number, motivo: string) => Promise<PatientDocument>
  }
}

export const CorregirDocumentoModal: React.FC<Props> = ({ documento, accion, onClose, onCorregido, ejecutar }) => {
  const [motivo, setMotivo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [candidatas, setCandidatas] = useState<PacienteDestino[]>([])
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [destino, setDestino] = useState<PacienteDestino | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visible = Boolean(documento && accion)

  useEffect(() => {
    if (!visible) return
    setMotivo('')
    setBusqueda('')
    setCandidatas([])
    setDestino(null)
    setError(null)
    setErrorBusqueda(null)
  }, [visible, documento?.id, accion])

  useEffect(() => {
    if (accion !== 'mover' || destino) return
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setCandidatas([])
      return
    }
    let vigente = true
    const temporizador = window.setTimeout(async () => {
      setBuscando(true)
      setErrorBusqueda(null)
      try {
        const { data } = await apiClient.get<PacienteDestino[]>('/patients', { params: { search: termino, limit: 8 } })
        if (!vigente) return
        setCandidatas((Array.isArray(data) ? data : []).filter((p) => p.id !== documento?.patient_id))
      } catch (err) {
        if (vigente) setErrorBusqueda(mensajeDeError(err, 'No se pudo buscar.'))
      } finally {
        if (vigente) setBuscando(false)
      }
    }, 300)
    return () => {
      vigente = false
      window.clearTimeout(temporizador)
    }
  }, [busqueda, accion, destino, documento?.patient_id])

  if (!documento || !accion) return null

  const motivoListo = motivo.trim().length >= 3
  const listo = motivoListo && (accion !== 'mover' || destino !== null)

  const confirmar = async () => {
    if (!listo) return
    setGuardando(true)
    setError(null)
    try {
      const resultado =
        accion === 'anular'
          ? await ejecutar.anular(documento.id, motivo.trim())
          : accion === 'mover'
            ? await ejecutar.mover(documento.id, destino!.id, motivo.trim())
            : await ejecutar.revertir(documento.id, motivo.trim())
      onCorregido(resultado, accion, destino ?? undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo corregir el documento.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" fullscreen="sm">
      <CModalHeader>
        <CModalTitle>{TITULOS[accion]}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <p className="mb-2">
          <strong>{documento.title}</strong>
          <span className="text-body-secondary"> · {documento.file_name}</span>
        </p>
        <p className="small text-body-secondary">{EXPLICACIONES[accion]}</p>

        {accion === 'mover' && (
          <div className="mb-3">
            <CFormLabel htmlFor="mover-buscar">Paciente correcta</CFormLabel>
            {destino ? (
              <div className="d-flex align-items-center gap-2 border rounded p-2">
                <span className="flex-grow-1 fw-semibold">
                  {destino.first_name} {destino.last_name}
                </span>
                <CButton color="secondary" variant="outline" size="sm" onClick={() => setDestino(null)}>
                  Cambiar
                </CButton>
              </div>
            ) : (
              <>
                <CFormInput
                  id="mover-buscar"
                  placeholder="Nombre, teléfono o expediente"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  autoComplete="off"
                />
                {buscando && <div className="small text-body-secondary mt-1">Buscando…</div>}
                {errorBusqueda && <div className="small text-danger mt-1">{errorBusqueda}</div>}
                {!buscando && !errorBusqueda && busqueda.trim().length >= 2 && candidatas.length === 0 && (
                  <div className="small text-body-secondary mt-1">Ninguna paciente coincide.</div>
                )}
                {candidatas.length > 0 && (
                  <CListGroup className="mt-2">
                    {candidatas.map((p) => (
                      <CListGroupItem
                        key={p.id}
                        as="button"
                        type="button"
                        className="text-start"
                        style={{ minHeight: 44 }}
                        onClick={() => setDestino(p)}
                      >
                        <div className="fw-semibold">
                          {p.first_name} {p.last_name}
                        </div>
                        <small className="text-body-secondary">
                          {[
                            formatEdad(p.date_of_birth, ''),
                            p.cell_phone || p.phone ? `Tel. ${p.cell_phone || p.phone}` : '',
                            p.expediente_legacy ? `Exp. ${p.expediente_legacy}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </CListGroupItem>
                    ))}
                  </CListGroup>
                )}
              </>
            )}
          </div>
        )}

        <CFormLabel htmlFor="correccion-motivo">
          Motivo <span className="text-danger">*</span>
        </CFormLabel>
        <CFormTextarea
          id="correccion-motivo"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por ejemplo: se subió al expediente de otro paciente con el mismo nombre"
        />

        {error && (
          <CAlert color="danger" className="mt-3 mb-0" role="alert">
            {error}
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose} disabled={guardando}>
          Cancelar
        </CButton>
        <CButton color={accion === 'anular' ? 'danger' : 'primary'} onClick={() => void confirmar()} disabled={!listo || guardando}>
          {guardando ? <CSpinner size="sm" /> : TITULOS[accion]}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default CorregirDocumentoModal
