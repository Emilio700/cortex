import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CForm,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBaby, cilCalendar, cilPlus } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { estaVacio } from '../../../shared/utils/validacion'
import { useAuth } from '../../../shared/context/AuthContext'
import type { Pregnancy } from '../types/prenatal'
import type { PregnancyDatingEvent, PrenatalMilestone } from '../types/clinicalTracking'
import { hoyLocalISO, formatearFechaISO } from '../../../shared/utils/date'
import {
  ESTADOS_DE_HITO,
  METODOS_DE_DATACION,
  etiquetaEstadoHito,
  etiquetaMetodoDatacion,
} from '../utils/etiquetasPlanClinico'

interface FetalRecord {
  id: number
  sequence_number: number
  clinical_identifier?: string | null
  chorionicity?: string | null
  amnionicity?: string | null
}
interface ObstetricTrackingPanelProps {
  pregnancy: Pregnancy
  onChanged?: () => void
}
const formatDate = (value?: string | null) => formatearFechaISO(value)

const ObstetricTrackingPanel = ({ pregnancy, onChanged }: ObstetricTrackingPanelProps) => {
  const { user } = useAuth()
  const [events, setEvents] = useState<PregnancyDatingEvent[]>([])
  const [milestones, setMilestones] = useState<PrenatalMilestone[]>([])
  const [fetuses, setFetuses] = useState<FetalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Errores junto al campo (`noValidate`): sin globo del navegador.
  const [errores, setErrores] = useState<{ fpp?: string; motivo?: string; hito?: string }>({})
  const limpiarError = (campo: keyof typeof errores) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  const [dating, setDating] = useState({
    method: pregnancy.dating_method || 'ultrasound',
    accepted_delivery_date: pregnancy.estimated_delivery_date || '',
    reason: '',
  })
  const [milestone, setMilestone] = useState({ title: '', due_on: '', status: 'suggested' })
  const canWrite = user?.role === 'doctor' || user?.role === 'master'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eventsResponse, milestonesResponse, fetusesResponse] = await Promise.all([
        apiClient.get<PregnancyDatingEvent[]>(
          `/clinical-tracking/pregnancies/${pregnancy.id}/dating-events`,
        ),
        apiClient.get<PrenatalMilestone[]>(
          `/clinical-tracking/pregnancies/${pregnancy.id}/milestones`,
        ),
        apiClient.get<FetalRecord[]>(`/clinical-tracking/pregnancies/${pregnancy.id}/fetuses`),
      ])
      setEvents(eventsResponse.data)
      setMilestones(milestonesResponse.data)
      setFetuses(fetusesResponse.data)
    } catch (requestError: any) {
      setError(
        requestError.response?.data?.detail || 'No fue posible cargar el seguimiento obstétrico.',
      )
    } finally {
      setLoading(false)
    }
  }, [pregnancy.id])
  useEffect(() => {
    void load()
  }, [load])

  const saveDating = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Se valida antes de llamar al servidor: el servidor exige fecha cuando la
    // FPP se acepta (`PregnancyDatingEventCreate`, status accepted); el motivo
    // lo pide esta pantalla para que el historial diga por qué cambió la FPP.
    const faltas: typeof errores = {}
    if (estaVacio(dating.accepted_delivery_date)) faltas.fpp = 'Indica la fecha de la FPP aceptada.'
    if (estaVacio(dating.reason)) faltas.motivo = 'Escribe el motivo o la fuente de la FPP.'
    if (Object.keys(faltas).length > 0) {
      setErrores(faltas)
      return
    }
    setErrores({})
    setSaving(true)
    setError(null)
    try {
      await apiClient.post(`/clinical-tracking/pregnancies/${pregnancy.id}/dating-events`, {
        ...dating,
        status: 'accepted',
      })
      setDating((value) => ({ ...value, reason: '' }))
      await load()
      onChanged?.()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible actualizar la FPP.')
    } finally {
      setSaving(false)
    }
  }
  const saveMilestone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // El servidor exige un título de al menos 2 caracteres (`PrenatalMilestoneCreate`).
    const nombre = milestone.title.trim()
    if (estaVacio(nombre)) {
      setErrores((prev) => ({ ...prev, hito: 'Escribe el nombre del hito.' }))
      return
    }
    if (nombre.length < 2) {
      setErrores((prev) => ({ ...prev, hito: 'El nombre del hito debe tener al menos 2 caracteres.' }))
      return
    }
    setErrores((prev) => ({ ...prev, hito: undefined }))
    setSaving(true)
    setError(null)
    try {
      await apiClient.post(`/clinical-tracking/pregnancies/${pregnancy.id}/milestones`, {
        ...milestone,
        due_on: milestone.due_on || undefined,
      })
      setMilestone({ title: '', due_on: '', status: 'suggested' })
      await load()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible guardar el hito.')
    } finally {
      setSaving(false)
    }
  }
  const addFetus = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiClient.post(`/clinical-tracking/pregnancies/${pregnancy.id}/fetuses`, {
        sequence_number: fetuses.length + 1,
        clinical_identifier: `Feto ${fetuses.length + 1}`,
      })
      await load()
      onChanged?.()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible crear el registro fetal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <CCard className="border-0 shadow-sm">
      <CCardBody>
        <div className="d-flex justify-content-between gap-2 align-items-start mb-3">
          <div className="d-flex gap-2">
            <CIcon icon={cilBaby} className="text-primary" />
            <div>
              <h5 className="mb-0">Centro de seguimiento obstétrico</h5>
              <small className="text-body-secondary">
                FPP, fetos y próximos controles documentados.
              </small>
            </div>
          </div>
          <CBadge color="primary">FPP {formatDate(pregnancy.estimated_delivery_date)}</CBadge>
        </div>
        {error && (
          <CAlert color="danger" dismissible onClose={() => setError(null)}>
            {error}
          </CAlert>
        )}
        {loading ? (
          <div className="text-center py-3">
            <CSpinner size="sm" />
          </div>
        ) : (
          <CRow className="g-3">
            <CCol lg={6}>
              <div className="border rounded p-3 h-100">
                <h6>Datación y FPP</h6>
                <p className="small text-body-secondary">
                  Cada cambio queda en historial; no se reemplaza una FPP sin motivo.
                </p>
                {canWrite && (
                  <CForm onSubmit={(event) => void saveDating(event)} noValidate>
                    <CRow className="g-2">
                      <CCol md={6}>
                        <CFormLabel>Método</CFormLabel>
                        <CFormSelect
                          value={dating.method}
                          onChange={(e) => setDating((v) => ({ ...v, method: e.target.value }))}
                        >
                          {METODOS_DE_DATACION.map(({ valor, etiqueta }) => (
                            <option key={valor} value={valor}>
                              {etiqueta}
                            </option>
                          ))}
                        </CFormSelect>
                      </CCol>
                      <CCol md={6}>
                        <CFormLabel htmlFor="obstetricia-fpp-aceptada">FPP aceptada</CFormLabel>
                        <CFormInput
                          id="obstetricia-fpp-aceptada"
                          required
                          type="date"
                          value={dating.accepted_delivery_date}
                          onChange={(e) => {
                            setDating((v) => ({ ...v, accepted_delivery_date: e.target.value }))
                            limpiarError('fpp')
                          }}
                          invalid={Boolean(errores.fpp)}
                          aria-invalid={Boolean(errores.fpp) || undefined}
                          aria-describedby={errores.fpp ? 'error-obstetricia-fpp' : undefined}
                        />
                        <ErrorDeCampo id="error-obstetricia-fpp" mensaje={errores.fpp} />
                      </CCol>
                      <CCol md={12}>
                        <CFormLabel htmlFor="obstetricia-motivo-fpp">Motivo / fuente</CFormLabel>
                        <CFormTextarea
                          id="obstetricia-motivo-fpp"
                          required
                          rows={2}
                          value={dating.reason}
                          onChange={(e) => {
                            setDating((v) => ({ ...v, reason: e.target.value }))
                            limpiarError('motivo')
                          }}
                          placeholder="Ej. Ultrasonido temprano reportado..."
                          invalid={Boolean(errores.motivo)}
                          aria-invalid={Boolean(errores.motivo) || undefined}
                          aria-describedby={errores.motivo ? 'error-obstetricia-motivo' : undefined}
                        />
                        <ErrorDeCampo id="error-obstetricia-motivo" mensaje={errores.motivo} />
                      </CCol>
                    </CRow>
                    <CButton
                      className="mt-2"
                      type="submit"
                      size="sm"
                      color="primary"
                      disabled={saving}
                    >
                      {saving ? <CSpinner size="sm" /> : 'Confirmar FPP'}
                    </CButton>
                  </CForm>
                )}
                {events.slice(0, 3).map((item) => (
                  <div className="small mt-2 border-top pt-2" key={item.id}>
                    {formatDate(item.accepted_delivery_date || item.proposed_delivery_date)} ·{' '}
                    {etiquetaMetodoDatacion(item.method)}
                    <div className="text-body-secondary">{item.reason || 'Sin nota'}</div>
                  </div>
                ))}
              </div>
            </CCol>
            <CCol lg={6}>
              <div className="border rounded p-3 h-100">
                <div className="d-flex justify-content-between">
                  <h6>Fetos y controles</h6>
                  {canWrite && (
                    <CButton
                      size="sm"
                      color="secondary"
                      variant="outline"
                      onClick={() => void addFetus()}
                      disabled={saving}
                    >
                      <CIcon icon={cilPlus} className="me-1" />
                      Feto
                    </CButton>
                  )}
                </div>
                <p className="small text-body-secondary">
                  Se crea un registro clínico por feto, sin generar una identidad de paciente.
                </p>
                {fetuses.length === 0 ? (
                  <div className="small">Sin registro fetal confirmado.</div>
                ) : (
                  fetuses.map((item) => (
                    <div className="small border-top pt-2 mt-2" key={item.id}>
                      <strong>{item.clinical_identifier || `Feto ${item.sequence_number}`}</strong>
                      {item.chorionicity && (
                        <span className="text-body-secondary"> · {item.chorionicity}</span>
                      )}
                    </div>
                  ))
                )}
                <hr />
                {canWrite && (
                  <CForm onSubmit={(event) => void saveMilestone(event)} noValidate>
                    <CRow className="g-2">
                      <CCol md={6}>
                        <CFormLabel htmlFor="obstetricia-hito-titulo">Próximo control / hito</CFormLabel>
                        <CFormInput
                          id="obstetricia-hito-titulo"
                          required
                          value={milestone.title}
                          onChange={(e) => {
                            setMilestone((v) => ({ ...v, title: e.target.value }))
                            limpiarError('hito')
                          }}
                          placeholder="Ej. Control prenatal"
                          invalid={Boolean(errores.hito)}
                          aria-invalid={Boolean(errores.hito) || undefined}
                          aria-describedby={errores.hito ? 'error-obstetricia-hito' : undefined}
                        />
                        <ErrorDeCampo id="error-obstetricia-hito" mensaje={errores.hito} />
                      </CCol>
                      <CCol md={3}>
                        <CFormLabel>Fecha</CFormLabel>
                        <CFormInput
                          type="date"
                          min={hoyLocalISO()}
                          value={milestone.due_on}
                          onChange={(e) => setMilestone((v) => ({ ...v, due_on: e.target.value }))}
                        />
                      </CCol>
                      <CCol md={3}>
                        <CFormLabel>Estado</CFormLabel>
                        <CFormSelect
                          value={milestone.status}
                          onChange={(e) => setMilestone((v) => ({ ...v, status: e.target.value }))}
                        >
                          {ESTADOS_DE_HITO.map(({ valor, etiqueta }) => (
                            <option key={valor} value={valor}>
                              {etiqueta}
                            </option>
                          ))}
                        </CFormSelect>
                      </CCol>
                    </CRow>
                    <CButton
                      className="mt-2"
                      size="sm"
                      color="success"
                      type="submit"
                      disabled={saving}
                    >
                      <CIcon icon={cilCalendar} className="me-1" />
                      Guardar hito
                    </CButton>
                  </CForm>
                )}
                {milestones.slice(0, 4).map((item) => (
                  <div className="small mt-2" key={item.id}>
                    • {item.title}{' '}
                    <span className="text-body-secondary">
                      {formatDate(item.due_on)} · {etiquetaEstadoHito(item.status)}
                    </span>
                  </div>
                ))}
              </div>
            </CCol>
          </CRow>
        )}
      </CCardBody>
    </CCard>
  )
}

export default ObstetricTrackingPanel
