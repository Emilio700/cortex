/**
 * Registrar por qué un estudio sigue sin resultado (plan 32, punto 3).
 *
 * Lo usan el médico (bandeja) y recepción (Subir resultado). El estudio sale
 * de «Atrasados» hasta la fecha de «Volver a revisar el», y el seguimiento
 * queda en su historial con quién y cuándo. Si el servidor no lo guardó, el
 * modal lo dice y no cierra: la interfaz no dice que sí cuando no fue así.
 */
import { useState } from 'react'
import {
  CAlert,
  CButton,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { hoyLocalISO } from '../../../shared/utils/date'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import type { SeguimientoDeOrden } from '../types/clinicalTracking'

export const MOTIVOS_SEGUIMIENTO: ReadonlyArray<{ valor: string; etiqueta: string }> = [
  { valor: 'no_se_lo_ha_hecho', etiqueta: 'El paciente no se lo ha hecho' },
  { valor: 'en_proceso_laboratorio', etiqueta: 'Está en proceso en el laboratorio' },
  { valor: 'reagendado', etiqueta: 'Se reagendó' },
  { valor: 'no_se_localiza', etiqueta: 'No se localiza al paciente' },
  { valor: 'otro', etiqueta: 'Otro' },
]

/** Un día del calendario del consultorio, corrido `dias`. */
const diaMas = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

interface Props {
  visible: boolean
  orden: { id: number; study_name: string; patient_name?: string }
  onClose: () => void
  onGuardado: (seguimiento: SeguimientoDeOrden) => void
}

export default function RegistrarSeguimientoModal({ visible, orden, onClose, onGuardado }: Props) {
  const hoy = hoyLocalISO()
  const [motivo, setMotivo] = useState('no_se_lo_ha_hecho')
  const [nota, setNota] = useState('')
  const [revisarEl, setRevisarEl] = useState(() => diaMas(hoy, 7))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const faltaNota = motivo === 'otro' && !nota.trim()
  const fechaValida = revisarEl > hoy && revisarEl <= diaMas(hoy, 366)

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const { data } = await apiClient.post<SeguimientoDeOrden>(
        `/clinical-tracking/orders/${orden.id}/seguimientos`,
        { motivo, nota: nota.trim() || null, revisar_el: revisarEl },
      )
      onGuardado(data)
      onClose()
    } catch (err) {
      setError(mensajeDeError(err, 'No se guardó el seguimiento. Inténtalo de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CModal
      visible={visible}
      onClose={() => !guardando && onClose()}
      alignment="center"
      backdrop="static"
      aria-labelledby={`seg-titulo-${orden.id}`}
    >
      <CModalHeader closeButton={!guardando}>
        {/* h2: la página ya tiene su h1 (orden de encabezados, axe). */}
        <CModalTitle as="h2" className="h5" id={`seg-titulo-${orden.id}`}>Registrar seguimiento</CModalTitle>
        <BotonAyudaContextual recorridoId="seguimiento-registrar" />
      </CModalHeader>
      <CModalBody data-tour="seguimiento-formulario">
        <div className="small text-body-secondary mb-3">
          {orden.patient_name ? `${orden.patient_name} · ` : ''}
          <strong>{orden.study_name}</strong> · Orden n.º {orden.id}
        </div>
        {error && <CAlert color="danger" role="alert">{error}</CAlert>}
        <div className="mb-3" data-tour="seguimiento-motivo">
          <CFormLabel htmlFor={`seg-motivo-${orden.id}`}>¿Por qué sigue sin resultado?</CFormLabel>
          <CFormSelect
            id={`seg-motivo-${orden.id}`}
            value={motivo}
            disabled={guardando}
            onChange={(e) => setMotivo(e.target.value)}
          >
            {MOTIVOS_SEGUIMIENTO.map((m) => (
              <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
            ))}
          </CFormSelect>
        </div>
        <div className="mb-3">
          <CFormLabel htmlFor={`seg-nota-${orden.id}`}>
            Nota {motivo === 'otro' ? '(obligatoria con «Otro»)' : '(opcional)'}
          </CFormLabel>
          <CFormTextarea
            id={`seg-nota-${orden.id}`}
            rows={2}
            maxLength={500}
            value={nota}
            disabled={guardando}
            placeholder="Por ejemplo: el laboratorio lo entrega el lunes"
            onChange={(e) => setNota(e.target.value)}
          />
        </div>
        <div data-tour="seguimiento-revisar">
          <CFormLabel htmlFor={`seg-fecha-${orden.id}`}>Volver a revisar el</CFormLabel>
          <CFormInput
            id={`seg-fecha-${orden.id}`}
            type="date"
            min={diaMas(hoy, 1)}
            max={diaMas(hoy, 366)}
            value={revisarEl}
            disabled={guardando}
            onChange={(e) => setRevisarEl(e.target.value)}
          />
          <div className="form-text">Hasta esa fecha el estudio no cuenta como atrasado.</div>
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="ghost" disabled={guardando} onClick={onClose}>
          Cancelar
        </CButton>
        <CButton
          color="primary"
          data-tour="seguimiento-guardar"
          disabled={guardando || faltaNota || !fechaValida}
          onClick={() => void guardar()}
        >
          {guardando && <CSpinner size="sm" className="me-2" />}
          Guardar seguimiento
        </CButton>
      </CModalFooter>
    </CModal>
  )
}
