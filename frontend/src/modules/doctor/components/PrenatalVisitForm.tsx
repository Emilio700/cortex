import { useState, type FormEvent } from 'react'
import { CAlert, CButton, CCol, CForm, CFormInput, CFormLabel, CFormSelect, CFormTextarea, CRow, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilSave, cilWarning } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { estaVacio } from '../../../shared/utils/validacion'
import type { FetalMovementStatus, FetalPresentation, Pregnancy, PrenatalVisitCreate } from '../types/prenatal'
import { hoyLocalISO } from '../../../shared/utils/date'

interface PrenatalVisitFormProps { pregnancy: Pregnancy; appointmentId?: number; onSaved?: () => void }
interface FormState {
  visit_date: string; gestational_age_weeks: string; maternal_weight_kg: string; systolic_bp: string; diastolic_bp: string
  fundal_height_cm: string; fetal_heart_rate_bpm: string; fetal_movements: FetalMovementStatus; fetal_presentation: FetalPresentation
  maternal_observations: string; fetal_observations: string; plan_notes: string; next_visit_on: string
}
const initialForm = (): FormState => ({ visit_date: hoyLocalISO(), gestational_age_weeks: '', maternal_weight_kg: '', systolic_bp: '', diastolic_bp: '', fundal_height_cm: '', fetal_heart_rate_bpm: '', fetal_movements: 'not_assessed', fetal_presentation: 'not_assessed', maternal_observations: '', fetal_observations: '', plan_notes: '', next_visit_on: '' })
const optionalNumber = (value: string) => (value === '' ? undefined : Number(value))

/**
 * Topes que ya aplica el servidor (`backend/app/schemas/pregnancy.py`,
 * `PrenatalVisitBase`). Con `noValidate` el navegador ya no frena el envío por
 * `min`/`max`: el aviso sale junto al campo antes de mandar el dato, en vez de
 * regresar como un 422 del servidor. Lo que no se valoró se queda vacío: sólo
 * se revisa lo que sí se escribió.
 */
const RANGOS = {
  fecha: 'Indica la fecha de la visita.',
  edadGestacional: 'La edad gestacional debe estar entre 0 y 45 semanas.',
  peso: 'El peso materno debe estar entre 20 y 400 kg.',
  sistolica: 'La presión sistólica debe estar entre 40 y 300.',
  diastolica: 'La presión diastólica debe estar entre 20 y 200.',
  alturaUterina: 'La altura uterina debe estar entre 0 y 80 cm.',
  fcFetal: 'La frecuencia cardíaca fetal debe estar entre 30 y 300 lpm.',
  proximaVisita: 'La próxima visita no puede ser anterior a la fecha de la visita.',
} as const

/** ¿Hay un número escrito fuera del rango que acepta el servidor? */
const numeroFueraDeRango = (valor: string, minimo: number, maximo: number) =>
  valor.trim() !== '' &&
  (!Number.isFinite(Number(valor)) || Number(valor) < minimo || Number(valor) > maximo)

const PrenatalVisitForm = ({ pregnancy, appointmentId, onSaved }: PrenatalVisitFormProps) => {
  const [form, setForm] = useState<FormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Errores junto al campo (`noValidate`): sin globo del navegador.
  const [errores, setErrores] = useState<{
    visit_date?: string; gestational_age_weeks?: string; maternal_weight_kg?: string
    systolic_bp?: string; diastolic_bp?: string; fundal_height_cm?: string
    fetal_heart_rate_bpm?: string; next_visit_on?: string
  }>({})
  const limpiarError = (campo: keyof typeof errores) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  const setValue = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    limpiarError(field as keyof typeof errores)
  }

  const saveVisit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Se valida antes de llamar al servidor; el aviso se pinta junto al campo.
    const faltas: typeof errores = {}
    if (estaVacio(form.visit_date)) faltas.visit_date = RANGOS.fecha
    if (numeroFueraDeRango(form.gestational_age_weeks, 0, 45)) faltas.gestational_age_weeks = RANGOS.edadGestacional
    if (numeroFueraDeRango(form.maternal_weight_kg, 20, 400)) faltas.maternal_weight_kg = RANGOS.peso
    if (numeroFueraDeRango(form.systolic_bp, 40, 300)) faltas.systolic_bp = RANGOS.sistolica
    if (numeroFueraDeRango(form.diastolic_bp, 20, 200)) faltas.diastolic_bp = RANGOS.diastolica
    if (numeroFueraDeRango(form.fundal_height_cm, 0, 80)) faltas.fundal_height_cm = RANGOS.alturaUterina
    if (numeroFueraDeRango(form.fetal_heart_rate_bpm, 30, 300)) faltas.fetal_heart_rate_bpm = RANGOS.fcFetal
    if (form.next_visit_on && form.visit_date && form.next_visit_on < form.visit_date) faltas.next_visit_on = RANGOS.proximaVisita
    if (Object.keys(faltas).length > 0) {
      setErrores(faltas)
      return
    }
    setErrores({})
    setSaving(true); setError(null); setSuccess(null)
    const payload: PrenatalVisitCreate = {
      ...(appointmentId ? { appointment_id: appointmentId } : {}), visit_date: form.visit_date,
      gestational_age_weeks: optionalNumber(form.gestational_age_weeks), maternal_weight_kg: optionalNumber(form.maternal_weight_kg),
      systolic_bp: optionalNumber(form.systolic_bp), diastolic_bp: optionalNumber(form.diastolic_bp), fundal_height_cm: optionalNumber(form.fundal_height_cm),
      fetal_heart_rate_bpm: optionalNumber(form.fetal_heart_rate_bpm), ...(form.fetal_movements !== 'not_assessed' ? { fetal_movements: form.fetal_movements } : {}),
      ...(form.fetal_presentation !== 'not_assessed' ? { fetal_presentation: form.fetal_presentation } : {}),
      ...(form.maternal_observations.trim() ? { maternal_observations: form.maternal_observations.trim() } : {}),
      ...(form.fetal_observations.trim() ? { fetal_observations: form.fetal_observations.trim() } : {}),
      ...(form.plan_notes.trim() ? { plan_notes: form.plan_notes.trim() } : {}), ...(form.next_visit_on ? { next_visit_on: form.next_visit_on } : {}),
    }
    try { await apiClient.post(`/prenatal/pregnancies/${pregnancy.id}/visits`, payload); setSuccess('Visita prenatal registrada.'); setForm(initialForm()); onSaved?.() }
    catch (requestError: any) { setError(requestError.response?.data?.detail || 'No fue posible registrar la visita prenatal.') }
    finally { setSaving(false) }
  }

  return <CForm onSubmit={saveVisit} noValidate>
    {error && <CAlert color="danger" dismissible onClose={() => setError(null)}>{error}</CAlert>}
    {success && <CAlert color="success" dismissible onClose={() => setSuccess(null)}>{success}</CAlert>}
    <CAlert color="info" className="small"><CIcon icon={cilWarning} className="me-1" />Registra solo datos valorados durante la visita. No se generan recomendaciones automáticas.</CAlert>
    <fieldset disabled={saving}><CRow className="g-3">
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-date">Fecha</CFormLabel>
        <CFormInput id="prenatal-date" type="date" required value={form.visit_date} onChange={(e) => setValue('visit_date', e.target.value)} invalid={Boolean(errores.visit_date)} aria-invalid={Boolean(errores.visit_date) || undefined} aria-describedby={errores.visit_date ? 'error-prenatal-fecha' : undefined} />
        <ErrorDeCampo id="error-prenatal-fecha" mensaje={errores.visit_date} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-semanas">Edad gestacional (semanas)</CFormLabel>
        <CFormInput id="prenatal-semanas" type="number" value={form.gestational_age_weeks} onChange={(e) => setValue('gestational_age_weeks', e.target.value)} invalid={Boolean(errores.gestational_age_weeks)} aria-invalid={Boolean(errores.gestational_age_weeks) || undefined} aria-describedby={errores.gestational_age_weeks ? 'error-prenatal-semanas' : undefined} />
        <ErrorDeCampo id="error-prenatal-semanas" mensaje={errores.gestational_age_weeks} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-peso">Peso materno (kg)</CFormLabel>
        <CFormInput id="prenatal-peso" type="number" step="0.1" value={form.maternal_weight_kg} onChange={(e) => setValue('maternal_weight_kg', e.target.value)} invalid={Boolean(errores.maternal_weight_kg)} aria-invalid={Boolean(errores.maternal_weight_kg) || undefined} aria-describedby={errores.maternal_weight_kg ? 'error-prenatal-peso' : undefined} />
        <ErrorDeCampo id="error-prenatal-peso" mensaje={errores.maternal_weight_kg} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-fc-fetal">FC fetal (lpm)</CFormLabel>
        <CFormInput id="prenatal-fc-fetal" type="number" value={form.fetal_heart_rate_bpm} onChange={(e) => setValue('fetal_heart_rate_bpm', e.target.value)} invalid={Boolean(errores.fetal_heart_rate_bpm)} aria-invalid={Boolean(errores.fetal_heart_rate_bpm) || undefined} aria-describedby={errores.fetal_heart_rate_bpm ? 'error-prenatal-fc-fetal' : undefined} />
        <ErrorDeCampo id="error-prenatal-fc-fetal" mensaje={errores.fetal_heart_rate_bpm} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-tas">Presión sistólica</CFormLabel>
        <CFormInput id="prenatal-tas" type="number" value={form.systolic_bp} onChange={(e) => setValue('systolic_bp', e.target.value)} invalid={Boolean(errores.systolic_bp)} aria-invalid={Boolean(errores.systolic_bp) || undefined} aria-describedby={errores.systolic_bp ? 'error-prenatal-tas' : undefined} />
        <ErrorDeCampo id="error-prenatal-tas" mensaje={errores.systolic_bp} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-tad">Presión diastólica</CFormLabel>
        <CFormInput id="prenatal-tad" type="number" value={form.diastolic_bp} onChange={(e) => setValue('diastolic_bp', e.target.value)} invalid={Boolean(errores.diastolic_bp)} aria-invalid={Boolean(errores.diastolic_bp) || undefined} aria-describedby={errores.diastolic_bp ? 'error-prenatal-tad' : undefined} />
        <ErrorDeCampo id="error-prenatal-tad" mensaje={errores.diastolic_bp} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-altura">Altura uterina (cm)</CFormLabel>
        <CFormInput id="prenatal-altura" type="number" step="0.1" value={form.fundal_height_cm} onChange={(e) => setValue('fundal_height_cm', e.target.value)} invalid={Boolean(errores.fundal_height_cm)} aria-invalid={Boolean(errores.fundal_height_cm) || undefined} aria-describedby={errores.fundal_height_cm ? 'error-prenatal-altura' : undefined} />
        <ErrorDeCampo id="error-prenatal-altura" mensaje={errores.fundal_height_cm} />
      </CCol>
      <CCol md={3}>
        <CFormLabel htmlFor="prenatal-proxima-visita">Próxima visita</CFormLabel>
        <CFormInput id="prenatal-proxima-visita" type="date" value={form.next_visit_on} onChange={(e) => setValue('next_visit_on', e.target.value)} invalid={Boolean(errores.next_visit_on)} aria-invalid={Boolean(errores.next_visit_on) || undefined} aria-describedby={errores.next_visit_on ? 'error-prenatal-proxima-visita' : undefined} />
        <ErrorDeCampo id="error-prenatal-proxima-visita" mensaje={errores.next_visit_on} />
      </CCol>
      <CCol md={6}><CFormLabel>Movimientos fetales</CFormLabel><CFormSelect value={form.fetal_movements} onChange={(e) => setValue('fetal_movements', e.target.value as FetalMovementStatus)}><option value="not_assessed">No valorados</option><option value="reported">Referidos</option><option value="not_reported">No referidos</option></CFormSelect></CCol>
      <CCol md={6}><CFormLabel>Presentación fetal</CFormLabel><CFormSelect value={form.fetal_presentation} onChange={(e) => setValue('fetal_presentation', e.target.value as FetalPresentation)}><option value="not_assessed">No valorada</option><option value="cephalic">Cefálica</option><option value="breech">Pélvica</option><option value="transverse">Transversa</option><option value="other">Otra</option></CFormSelect></CCol>
      <CCol md={6}><CFormLabel>Observaciones maternas</CFormLabel><CFormTextarea rows={3} value={form.maternal_observations} onChange={(e) => setValue('maternal_observations', e.target.value)} /></CCol>
      <CCol md={6}><CFormLabel>Observaciones fetales</CFormLabel><CFormTextarea rows={3} value={form.fetal_observations} onChange={(e) => setValue('fetal_observations', e.target.value)} /></CCol>
      <CCol md={12}><CFormLabel>Plan e indicaciones</CFormLabel><CFormTextarea rows={3} value={form.plan_notes} onChange={(e) => setValue('plan_notes', e.target.value)} /></CCol>
    </CRow></fieldset>
    <div className="d-flex justify-content-end mt-3"><CButton type="submit" color="primary" disabled={saving}>{saving ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilSave} className="me-1" />}{saving ? 'Guardando...' : 'Registrar visita prenatal'}</CButton></div>
  </CForm>
}

export default PrenatalVisitForm
