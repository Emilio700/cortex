import { useCallback, useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CCollapse,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormSwitch,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCalendar, cilCheckCircle, cilNotes, cilPeople, cilPlus, cilWarning } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { useAuth } from '../../../shared/context/AuthContext'
import type {
  ClinicalEpisode,
  ClinicalEpisodeCreate,
  ClinicalEpisodePage,
  ClinicalEpisodeStatus,
  ClinicalEpisodeType,
  ClinicalRecordSummary,
} from '../types/clinicalRecord'
import PrenatalCarePanel from './PrenatalCarePanel'
import ClinicalConsentHistory from './ClinicalConsentHistory'
import CareTeamPanel from './CareTeamPanel'
import { InsigniaEmbarazo } from './EmbarazoResumen'
import type { Pregnancy } from '../types/prenatal'
import { resumirEmbarazo } from '../utils/embarazo'
import { formatearFechaISO, hoyLocalISO, formatearHoraDeCita } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'

const EPISODE_TYPES: Array<{ value: ClinicalEpisodeType; label: string }> = [
  { value: 'routine', label: 'Consulta preventiva / rutina' },
  { value: 'pregnancy', label: 'Embarazo y control prenatal' },
  { value: 'bleeding', label: 'Sangrado o dolor pélvico' },
  { value: 'infection', label: 'Infección, ITS o síntomas urinarios' },
  { value: 'breast', label: 'Mama / mastografía / ultrasonido' },
  { value: 'cervix', label: 'Papanicolaou, HPV o cérvix' },
  { value: 'menopause', label: 'Menopausia o síntomas hormonales' },
  { value: 'contraception', label: 'Anticoncepción o plan reproductivo' },
  { value: 'fertility', label: 'Fertilidad' },
  { value: 'procedure', label: 'Procedimiento ginecológico, láser o funcional' },
  { value: 'other', label: 'Otro motivo clínico' },
]

const STATUS_META: Record<ClinicalEpisodeStatus, { label: string; color: 'success' | 'warning' | 'secondary' | 'dark' }> = {
  active: { label: 'Activo', color: 'success' },
  monitoring: { label: 'En seguimiento', color: 'warning' },
  resolved: { label: 'Resuelto', color: 'secondary' },
  archived: { label: 'Archivado', color: 'dark' },
}

const formatDate = (value?: string | null) => formatearFechaISO(value)
// Son horas de cita: hora local del consultorio (D-12).
const formatDateTime = (value?: string | null) => formatearHoraDeCita(value, { dateStyle: 'medium', timeStyle: 'short' }, 'Sin registro')

interface ClinicalRecordPanelProps {
  patientId: number
  appointmentId?: number
  /** Dueño del expediente, para el bloque de equipo tratante. */
  ownerDoctorId?: number | null
  /**
   * Qué partes pintar. El expediente único (plan 32, punto 6) reparte el panel
   * en sus pestañas (Embarazo, Resumen, Consentimientos, Equipo); sin esto se
   * pinta completo, como en la consulta.
   */
  secciones?: ReadonlyArray<SeccionDelPanel>
}

export type SeccionDelPanel = 'prenatal' | 'resumen' | 'episodios' | 'consentimientos' | 'equipo'
const TODAS_LAS_SECCIONES: ReadonlyArray<SeccionDelPanel> = ['prenatal', 'resumen', 'episodios', 'consentimientos', 'equipo']

const ClinicalRecordPanel = ({
  patientId,
  appointmentId,
  ownerDoctorId,
  secciones = TODAS_LAS_SECCIONES,
}: ClinicalRecordPanelProps) => {
  const ver = (seccion: SeccionDelPanel) => secciones.includes(seccion)
  const { user } = useAuth()
  const [pregnancy, setPregnancy] = useState<Pregnancy | null>(null)
  // El equipo tratante es una opción de consulta ocasional: arranca plegado.
  const [showCareTeam, setShowCareTeam] = useState(false)
  const [summary, setSummary] = useState<ClinicalRecordSummary | null>(null)
  // Si el resumen no llegó, sus tres datos se dicen desconocidos: antes salían
  // «Sin registro» y «0 seguimientos», que se leen como hechos (plan 29, T-1).
  const [errorResumen, setErrorResumen] = useState<string | null>(null)
  // Igual con los episodios: sin ellos no se puede decir «aún no hay».
  const [errorEpisodios, setErrorEpisodios] = useState<string | null>(null)
  const [episodes, setEpisodes] = useState<ClinicalEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Omit<ClinicalEpisodeCreate, 'patient_id'>>({
    episode_type: 'routine',
    title: '',
    started_on: hoyLocalISO(),
    summary: '',
    follow_up_on: '',
    next_action: '',
  })
  const canCreate = user?.role === 'doctor' || user?.role === 'master'
  const resumenEmbarazo = resumirEmbarazo(pregnancy)

  const recordarEmbarazo = useCallback((activa: Pregnancy | null) => setPregnancy(activa), [])

  // Sin resumen ni episodios a la vista no se piden: la pestaña Embarazo no
  // tiene por qué leer (ni dejar en la bitácora) los episodios.
  const usaResumen = secciones.includes('resumen') || secciones.includes('episodios')
  const loadRecord = useCallback(async () => {
    if (!usaResumen) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setErrorResumen(null)
    setErrorEpisodios(null)
    try {
      // Cada lectura falla por su lado: si el resumen no llega, los episodios
      // siguen a la vista, y al revés.
      const [summaryResponse, episodesResponse] = await Promise.allSettled([
        apiClient.get<ClinicalRecordSummary>(`/clinical-episodes/patient/${patientId}/summary`),
        apiClient.get<ClinicalEpisodePage>(`/clinical-episodes/patient/${patientId}?limit=30`),
      ])
      if (summaryResponse.status === 'fulfilled') {
        setSummary(summaryResponse.value.data)
      } else {
        setSummary(null)
        setErrorResumen(mensajeDeError(summaryResponse.reason, 'No se pudo cargar el resumen del expediente.'))
      }
      if (episodesResponse.status === 'fulfilled') {
        setEpisodes(episodesResponse.value.data.items)
      } else {
        setErrorEpisodios(mensajeDeError(episodesResponse.reason, 'No se pudieron cargar los episodios clínicos.'))
      }
    } finally {
      setLoading(false)
    }
  }, [patientId, usaResumen])

  useEffect(() => {
    void loadRecord()
  }, [loadRecord])

  const createEpisode = async () => {
    if (!form.title.trim()) {
      setError('Escribe un título para el episodio clínico.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiClient.post('/clinical-episodes', {
        patient_id: patientId,
        ...form,
        summary: form.summary || undefined,
        follow_up_on: form.follow_up_on || undefined,
        next_action: form.next_action || undefined,
      })
      setShowCreate(false)
      setForm({ episode_type: 'routine', title: '', started_on: hoyLocalISO(), summary: '', follow_up_on: '', next_action: '' })
      await loadRecord()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible guardar el episodio clínico.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-5"><CSpinner color="primary" /><div className="mt-2">Cargando expediente clínico...</div></div>
  }

  return (
    <div className="d-flex flex-column gap-3">
      {error && <CAlert color="danger" dismissible onClose={() => setError(null)}>{error}</CAlert>}

      {/* En el teléfono el resumen (última atención, próxima cita) va arriba
          del control prenatal: es lo que se busca primero (plan 29, E-2). */}
      {ver('prenatal') && (
        <PrenatalCarePanel
          patientId={patientId}
          appointmentId={appointmentId}
          onPregnancyLoaded={recordarEmbarazo}
        />
      )}

      {ver('resumen') && (
      <CCard className="expediente-resumen border-0 shadow-sm" data-tour="expediente-resumen">
        <CCardBody>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <CIcon icon={cilNotes} className="text-primary" />
                <h3 className="h5 mb-0">Resumen del expediente</h3>
                <InsigniaEmbarazo resumen={resumenEmbarazo} />
              </div>
              <small className="texto-de-apoyo text-body-secondary">Episodios clínicos, pendientes y continuidad de atención.</small>
            </div>
            {canCreate && <CButton color="primary" data-tour="expediente-nuevo-episodio" onClick={() => setShowCreate(true)}>
              <CIcon icon={cilPlus} className="me-1" /> Nuevo episodio
            </CButton>}
          </div>
          {errorResumen && (
            <CAlert color="danger" className="mt-3 mb-0 d-flex flex-wrap align-items-center gap-2">
              <span className="flex-grow-1">{errorResumen}</span>
              <CButton color="danger" variant="outline" size="sm" onClick={() => void loadRecord()}>
                Reintentar
              </CButton>
            </CAlert>
          )}
          <CRow className="expediente-resumen-datos g-3 mt-1">
            <CCol md={4}>
              <div className="border rounded p-3 h-100 bg-body-tertiary">
                <small className="text-body-secondary">Última atención</small>
                <div className="fw-semibold mt-1">{summary ? formatDateTime(summary.last_appointment_at) : '—'}</div>
              </div>
            </CCol>
            <CCol md={4}>
              <div className="border rounded p-3 h-100 bg-body-tertiary">
                <small className="text-body-secondary">Próxima cita</small>
                <div className="fw-semibold mt-1">{summary ? formatDateTime(summary.next_appointment_at) : '—'}</div>
              </div>
            </CCol>
            <CCol md={4}>
              <div className="border rounded p-3 h-100 bg-body-tertiary">
                <small className="text-body-secondary">Seguimientos abiertos</small>
                <div className="fw-semibold mt-1">{summary ? summary.open_follow_ups : '—'}</div>
              </div>
            </CCol>
          </CRow>
        </CCardBody>
      </CCard>
      )}

      {ver('episodios') && (
      <CCard className="border-0 shadow-sm" data-tour="expediente-episodios">
        <CCardBody>
          <h3 className="h5 mb-3">Episodios y seguimiento</h3>
          {errorEpisodios ? (
            <CAlert color="danger" className="mb-0 d-flex flex-wrap align-items-center gap-2">
              <span className="flex-grow-1">{errorEpisodios}</span>
              <CButton color="danger" variant="outline" size="sm" onClick={() => void loadRecord()}>
                Reintentar
              </CButton>
            </CAlert>
          ) : episodes.length === 0 ? (
            <CAlert color="light" className="mb-0">Aún no hay episodios clínicos registrados. Crea uno para dar seguimiento a este motivo de consulta.</CAlert>
          ) : episodes.map((episode) => {
            const meta = STATUS_META[episode.status]
            return (
              <div key={episode.id} className="border rounded p-3 mb-2">
                <div className="d-flex justify-content-between gap-2 align-items-start">
                  <div>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <strong>{episode.title}</strong>
                      <CBadge color={meta.color}>{meta.label}</CBadge>
                    </div>
                    <small className="text-body-secondary">{EPISODE_TYPES.find((item) => item.value === episode.episode_type)?.label || episode.episode_type} · Inicio: {formatDate(episode.started_on)}</small>
                  </div>
                  {episode.follow_up_on && <span className="small text-body-secondary"><CIcon icon={cilCalendar} className="me-1" />{formatDate(episode.follow_up_on)}</span>}
                </div>
                {episode.summary && <p className="mb-1 mt-2 small">{episode.summary}</p>}
                {episode.next_action && <div className="small text-primary"><CIcon icon={cilCheckCircle} className="me-1" />{episode.next_action}</div>}
              </div>
            )
          })}
        </CCardBody>
      </CCard>
      )}

      {ver('consentimientos') && <ClinicalConsentHistory patientId={patientId} />}

      {ver('equipo') && (
      <CCard className="border-0 shadow-sm" data-tour="expediente-equipo">
        <CCardBody>
          <div className="d-flex align-items-center gap-2">
            <div className="d-flex align-items-center gap-2 flex-grow-1 min-width-0">
              <CIcon icon={cilPeople} className="text-primary" />
              <div>
                <h3 className="h5 mb-0">Equipo tratante</h3>
                <small className="texto-de-apoyo text-body-secondary">
                  Quién más puede ver este expediente. Se consulta cuando hace falta.
                </small>
              </div>
            </div>
            <CFormSwitch
              className="mb-0 ms-2 flex-shrink-0"
              id="expediente-equipo-tratante"
              checked={showCareTeam}
              onChange={() => setShowCareTeam((actual) => !actual)}
              label={showCareTeam ? 'Ocultar' : 'Mostrar'}
              aria-label={`${showCareTeam ? 'Ocultar' : 'Mostrar'} equipo tratante`}
            />
          </div>
          <CCollapse visible={showCareTeam}>
            <div className="mt-3">
              {showCareTeam && (
                <CareTeamPanel patientId={patientId} ownerDoctorId={ownerDoctorId} embedded />
              )}
            </div>
          </CCollapse>
        </CCardBody>
      </CCard>
      )}

      <CModal visible={showCreate} onClose={() => !saving && setShowCreate(false)}>
        <CModalHeader><CModalTitle>Nuevo episodio clínico</CModalTitle></CModalHeader>
        <CModalBody>
          <CAlert color="info" className="small"><CIcon icon={cilWarning} className="me-1" />El episodio organiza el seguimiento; no sustituye el juicio clínico ni registra un diagnóstico por sí mismo.</CAlert>
          <CFormLabel htmlFor="episode-type">Motivo de atención</CFormLabel>
          <CFormSelect id="episode-type" value={form.episode_type} onChange={(event) => setForm((current) => ({ ...current, episode_type: event.target.value as ClinicalEpisodeType }))}>
            {EPISODE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </CFormSelect>
          <CFormLabel className="mt-3" htmlFor="episode-title">Título clínico</CFormLabel>
          <CFormInput id="episode-title" value={form.title} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Seguimiento de resultado de Pap" />
          <CFormLabel className="mt-3" htmlFor="episode-start">Inicio</CFormLabel>
          <CFormInput id="episode-start" type="date" value={form.started_on} onChange={(event) => setForm((current) => ({ ...current, started_on: event.target.value }))} />
          <CFormLabel className="mt-3" htmlFor="episode-summary">Resumen</CFormLabel>
          <CFormTextarea id="episode-summary" rows={3} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Contexto clínico para el siguiente contacto." />
          <CFormLabel className="mt-3" htmlFor="episode-follow-up">Seguimiento sugerido</CFormLabel>
          <CFormInput id="episode-follow-up" type="date" min={form.started_on} value={form.follow_up_on} onChange={(event) => setForm((current) => ({ ...current, follow_up_on: event.target.value }))} />
          <CFormLabel className="mt-3" htmlFor="episode-action">Próxima acción</CFormLabel>
          <CFormTextarea id="episode-action" rows={2} value={form.next_action} onChange={(event) => setForm((current) => ({ ...current, next_action: event.target.value }))} placeholder="Ej. Revisar resultado y comunicarse con la paciente." />
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" disabled={saving} onClick={() => setShowCreate(false)}>Cancelar</CButton>
          <CButton color="primary" disabled={saving} onClick={() => void createEpisode()}>{saving ? 'Guardando...' : 'Guardar episodio'}</CButton>
        </CModalFooter>
      </CModal>
    </div>
  )
}

export default ClinicalRecordPanel
