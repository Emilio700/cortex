import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  CAlert,
  CButton,
  CCol,
  CCollapse,
  CForm,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilChevronBottom, cilChevronRight, cilShieldAlt } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { estaVacio } from '../../../shared/utils/validacion'
import { useAuth } from '../../../shared/context/AuthContext'
import EstudiosDeLaConsulta from './EstudiosDeLaConsulta'
import type {
  PatientImmunization,
  MedicationExposure,
  TrackingOverview,
} from '../types/clinicalTracking'
import { hoyLocalISO } from '../../../shared/utils/date'
import {
  ESTADOS_DE_VACUNA,
  REVISIONES_DE_MEDICAMENTO,
  etiquetaEstadoVacuna,
  etiquetaRevisionMedicamento,
} from '../utils/etiquetasPlanClinico'

export interface ClinicalPlanSummary {
  /** Órdenes de estudios de la paciente en todo el expediente (null si no se supo). */
  total: number | null
  /** Órdenes de estudios de esta misma consulta: las mismas que se ven en la lista. */
  currentAppointment: number
}

interface ClinicalPlanPanelProps {
  patientId: number
  appointmentId: number
  readOnly?: boolean
  /** Informa cuántos registros tiene el plan clínico, para avisarlo desde el encabezado. */
  onSummaryChange?: (summary: ClinicalPlanSummary) => void
  /** Lleva a la pestaña Estudios, con el historial completo. */
  onVerHistorial?: () => void
  /** Nombre de la paciente, para el encabezado del panel de resultados. */
  patientName?: string
}

const ClinicalPlanPanel = ({
  patientId,
  appointmentId,
  readOnly = false,
  onSummaryChange,
  onVerHistorial,
  patientName,
}: ClinicalPlanPanelProps) => {
  const { user } = useAuth()
  const [overview, setOverview] = useState<TrackingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'vaccine' | 'medicine' | null>(null)
  const [linkPregnancy, setLinkPregnancy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Errores junto al campo (`noValidate`): sin globo del navegador.
  const [errores, setErrores] = useState<{ vacuna?: string; medicamento?: string }>({})
  const limpiarError = (campo: keyof typeof errores) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  const [vacunasAbiertas, setVacunasAbiertas] = useState(false)
  const [vaccine, setVaccine] = useState({
    vaccine_name: '',
    product_name: '',
    lot_number: '',
    administered_on: hoyLocalISO(),
    status: 'applied',
    source: 'clinic',
    reason: '',
  })
  const [medicine, setMedicine] = useState({
    medication_name: '',
    active_ingredient: '',
    dose: '',
    frequency: '',
    source: 'patient_report',
    review_status: 'pending',
    next_review_on: '',
    review_notes: '',
  })
  const canWrite = !readOnly && (user?.role === 'doctor' || user?.role === 'master')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiClient.get<TrackingOverview>(
        `/clinical-tracking/patient/${patientId}/overview`,
      )
      setOverview(response.data)
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible cargar el plan clínico.')
    } finally {
      setLoading(false)
    }
  }, [patientId])
  useEffect(() => {
    void load()
  }, [load])

  // El encabezado cuenta lo mismo que enseña la lista (C-1): las órdenes de esta
  // consulta, y el total del expediente para cuando no hay ninguna aquí.
  const informarConteo = useCallback(
    ({ consulta, expediente }: { consulta: number; expediente: number | null }) =>
      onSummaryChange?.({ total: expediente, currentAppointment: consulta }),
    [onSummaryChange],
  )

  const pregnancyContext: Record<string, number> =
    linkPregnancy && overview?.active_pregnancy_id
      ? { pregnancy_id: overview.active_pregnancy_id }
      : {}
  const submit = async (kind: 'vaccine' | 'medicine', event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Se valida antes de llamar al servidor: el servidor exige un nombre de al
    // menos 2 caracteres (`ImmunizationCreate`, `MedicationExposureCreate`).
    const faltas: typeof errores = {}
    if (kind === 'vaccine') {
      const nombre = vaccine.vaccine_name.trim()
      if (estaVacio(nombre)) faltas.vacuna = 'Escribe la vacuna.'
      else if (nombre.length < 2) faltas.vacuna = 'El nombre de la vacuna debe tener al menos 2 caracteres.'
    } else {
      const nombre = medicine.medication_name.trim()
      if (estaVacio(nombre)) faltas.medicamento = 'Escribe el medicamento o suplemento.'
      else if (nombre.length < 2) faltas.medicamento = 'El nombre del medicamento debe tener al menos 2 caracteres.'
    }
    if (Object.keys(faltas).length > 0) {
      setErrores(faltas)
      return
    }
    setErrores({})
    setSaving(kind)
    setError(null)
    try {
      if (kind === 'vaccine') {
        await apiClient.post('/clinical-tracking/immunizations', {
          patient_id: patientId,
          appointment_id: appointmentId,
          ...pregnancyContext,
          ...vaccine,
          administered_on: vaccine.administered_on || undefined,
          product_name: vaccine.product_name || undefined,
          lot_number: vaccine.lot_number || undefined,
          reason: vaccine.reason || undefined,
        })
        setVaccine({
          vaccine_name: '',
          product_name: '',
          lot_number: '',
          administered_on: hoyLocalISO(),
          status: 'applied',
          source: 'clinic',
          reason: '',
        })
      } else {
        await apiClient.post('/clinical-tracking/medication-exposures', {
          patient_id: patientId,
          appointment_id: appointmentId,
          ...pregnancyContext,
          ...medicine,
          active_ingredient: medicine.active_ingredient || undefined,
          dose: medicine.dose || undefined,
          frequency: medicine.frequency || undefined,
          next_review_on: medicine.next_review_on || undefined,
          review_notes: medicine.review_notes || undefined,
        })
        setMedicine({
          medication_name: '',
          active_ingredient: '',
          dose: '',
          frequency: '',
          source: 'patient_report',
          review_status: 'pending',
          next_review_on: '',
          review_notes: '',
        })
      }
      await load()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible guardar el registro clínico.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
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
        <>
          <CAlert color="light" className="small">
            Este módulo registra decisiones clínicas. No determina automáticamente la seguridad de
            una vacuna o medicamento.
          </CAlert>
          {overview?.active_pregnancy_id && canWrite && (
            <CFormCheck
              id="link-active-pregnancy"
              label="Relacionar los registros de esta consulta con el embarazo activo"
              checked={linkPregnancy}
              onChange={(event) => setLinkPregnancy(event.target.checked)}
              className="small mb-3"
            />
          )}
          <EstudiosDeLaConsulta
            patientId={patientId}
            appointmentId={appointmentId}
            canWrite={canWrite}
            pregnancyContext={pregnancyContext}
            onVerHistorial={onVerHistorial}
            onConteo={informarConteo}
            patientName={patientName}
          />
          <CRow className="g-3 mt-0">
            <CCol xs={12}>
              <div className="border rounded p-3" data-tour="consulta-vacunas">
                {/* Bloque propio y plegable a todo el ancho (C-6): casi siempre está
                    vacío y antes le quitaba la mitad del ancho a las órdenes. */}
                <button
                  type="button"
                  className="btn btn-link p-0 text-reset text-decoration-none d-flex align-items-center gap-2 w-100"
                  aria-expanded={vacunasAbiertas}
                  onClick={() => setVacunasAbiertas((v) => !v)}
                >
                  <CIcon icon={vacunasAbiertas ? cilChevronBottom : cilChevronRight} />
                  <CIcon icon={cilShieldAlt} className="text-success" />
                  <strong>Vacunas y medicamentos</strong>
                  <span className="ms-auto small text-body-secondary">
                    {overview?.immunizations.length ?? 0} vacunas ·{' '}
                    {overview?.medication_exposures.length ?? 0} medicamentos en seguimiento
                  </span>
                </button>
                <CCollapse visible={vacunasAbiertas}>
                  <div className="pt-3">
                    {canWrite && (
                      <>
                        <CForm onSubmit={(event) => void submit('vaccine', event)} noValidate>
                          <CRow className="g-2">
                            <CCol md={6}>
                              <CFormLabel htmlFor="plan-vacuna-nombre">Vacuna</CFormLabel>
                              <CFormInput
                                id="plan-vacuna-nombre"
                                required
                                value={vaccine.vaccine_name}
                                onChange={(e) => {
                                  setVaccine((v) => ({ ...v, vaccine_name: e.target.value }))
                                  limpiarError('vacuna')
                                }}
                                invalid={Boolean(errores.vacuna)}
                                aria-invalid={Boolean(errores.vacuna) || undefined}
                                aria-describedby={errores.vacuna ? 'error-plan-vacuna' : undefined}
                              />
                              <ErrorDeCampo id="error-plan-vacuna" mensaje={errores.vacuna} />
                            </CCol>
                            <CCol md={3}>
                              <CFormLabel>Estado</CFormLabel>
                              <CFormSelect
                                value={vaccine.status}
                                onChange={(e) =>
                                  setVaccine((v) => ({ ...v, status: e.target.value }))
                                }
                              >
                                {ESTADOS_DE_VACUNA.map(({ valor, etiqueta }) => (
                                  <option key={valor} value={valor}>
                                    {etiqueta}
                                  </option>
                                ))}
                              </CFormSelect>
                            </CCol>
                            <CCol md={3}>
                              <CFormLabel>Fecha</CFormLabel>
                              <CFormInput
                                type="date"
                                value={vaccine.administered_on}
                                onChange={(e) =>
                                  setVaccine((v) => ({ ...v, administered_on: e.target.value }))
                                }
                              />
                            </CCol>
                            <CCol md={6}>
                              <CFormLabel>Producto</CFormLabel>
                              <CFormInput
                                value={vaccine.product_name}
                                onChange={(e) =>
                                  setVaccine((v) => ({ ...v, product_name: e.target.value }))
                                }
                              />
                            </CCol>
                            <CCol md={6}>
                              <CFormLabel>Lote</CFormLabel>
                              <CFormInput
                                value={vaccine.lot_number}
                                onChange={(e) =>
                                  setVaccine((v) => ({ ...v, lot_number: e.target.value }))
                                }
                              />
                            </CCol>
                          </CRow>
                          <CButton
                            className="mt-2"
                            type="submit"
                            size="sm"
                            color="success"
                            disabled={saving !== null}
                          >
                            {saving === 'vaccine' ? <CSpinner size="sm" /> : 'Registrar vacuna'}
                          </CButton>
                        </CForm>
                        <hr />
                        <CForm onSubmit={(event) => void submit('medicine', event)} noValidate>
                          <CRow className="g-2">
                            <CCol md={6}>
                              <CFormLabel htmlFor="plan-medicamento-nombre">Medicamento o suplemento</CFormLabel>
                              <CFormInput
                                id="plan-medicamento-nombre"
                                required
                                value={medicine.medication_name}
                                onChange={(e) => {
                                  setMedicine((v) => ({ ...v, medication_name: e.target.value }))
                                  limpiarError('medicamento')
                                }}
                                invalid={Boolean(errores.medicamento)}
                                aria-invalid={Boolean(errores.medicamento) || undefined}
                                aria-describedby={errores.medicamento ? 'error-plan-medicamento' : undefined}
                              />
                              <ErrorDeCampo id="error-plan-medicamento" mensaje={errores.medicamento} />
                            </CCol>
                            <CCol md={6}>
                              <CFormLabel>Revisión</CFormLabel>
                              <CFormSelect
                                value={medicine.review_status}
                                onChange={(e) =>
                                  setMedicine((v) => ({ ...v, review_status: e.target.value }))
                                }
                              >
                                {REVISIONES_DE_MEDICAMENTO.map(({ valor, etiqueta }) => (
                                  <option key={valor} value={valor}>
                                    {etiqueta}
                                  </option>
                                ))}
                              </CFormSelect>
                            </CCol>
                            <CCol md={4}>
                              <CFormLabel>Dosis</CFormLabel>
                              <CFormInput
                                value={medicine.dose}
                                onChange={(e) =>
                                  setMedicine((v) => ({ ...v, dose: e.target.value }))
                                }
                              />
                            </CCol>
                            <CCol md={4}>
                              <CFormLabel>Frecuencia</CFormLabel>
                              <CFormInput
                                value={medicine.frequency}
                                onChange={(e) =>
                                  setMedicine((v) => ({ ...v, frequency: e.target.value }))
                                }
                              />
                            </CCol>
                            <CCol md={4}>
                              <CFormLabel>Revisar el</CFormLabel>
                              <CFormInput
                                type="date"
                                value={medicine.next_review_on}
                                onChange={(e) =>
                                  setMedicine((v) => ({ ...v, next_review_on: e.target.value }))
                                }
                              />
                            </CCol>
                          </CRow>
                          <CButton
                            className="mt-2"
                            type="submit"
                            size="sm"
                            color="warning"
                            disabled={saving !== null}
                          >
                            {saving === 'medicine' ? (
                              <CSpinner size="sm" />
                            ) : (
                              'Registrar seguimiento'
                            )}
                          </CButton>
                        </CForm>
                      </>
                    )}
                    {overview?.immunizations.map((item: PatientImmunization) => (
                      <div className="small mt-1" key={item.id}>
                        • {item.vaccine_name}{' '}
                        <span className="text-body-secondary">
                          ({etiquetaEstadoVacuna(item.status)})
                        </span>
                      </div>
                    ))}
                    {overview?.medication_exposures.map((item: MedicationExposure) => (
                      <div className="small mt-1" key={item.id}>
                        • {item.medication_name}{' '}
                        <span className="text-body-secondary">
                          ({etiquetaRevisionMedicamento(item.review_status)})
                        </span>
                      </div>
                    ))}
                  </div>
                </CCollapse>
              </div>
            </CCol>
          </CRow>
        </>
      )}
    </>
  )
}

export default ClinicalPlanPanel
