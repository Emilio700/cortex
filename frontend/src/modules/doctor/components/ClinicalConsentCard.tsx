import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CAlert, CBadge, CButton, CCol, CFormCheck, CFormInput, CFormLabel, CFormSelect, CFormSwitch, CFormTextarea, CListGroup, CListGroupItem, CRow, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBan, cilCloudDownload, cilPen, cilPlus, cilShieldAlt } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import type { ClinicalConsent, ClinicalConsentPage, ConsentTemplate } from '../types/clinicalConsent'
import SignatureCanvas from './SignatureCanvas'
import { formatearInstante } from '../../../shared/utils/date'
import VisorDocumentos, { type ArchivoVisor } from '../../../shared/components/VisorDocumentos'

export interface ClinicalConsentSummary {
  /** Consentimientos registrados para esta consulta. */
  total: number
  /** De esos, cuántos ya están firmados (los cancelados no cuentan). */
  signed: number
}

interface ClinicalConsentCardProps { patientId: number; appointmentId: number; patientName?: string; defaultProcedure?: string | null; readOnly?: boolean; onSummaryChange?: (summary: ClinicalConsentSummary) => void }

const STATUS: Record<string, { label: string; color: 'secondary' | 'success' | 'danger' | 'dark' }> = {
  draft: { label: 'Borrador', color: 'secondary' }, signed: { label: 'Firmado', color: 'success' }, rejected: { label: 'Rechazado', color: 'danger' }, revoked: { label: 'Revocado', color: 'danger' }, cancelled: { label: 'Cancelado', color: 'dark' },
}
/** Estados desde los que todavía tiene sentido anular el documento. */
const CANCELABLE = ['draft', 'signed']

/**
 * Reproduce el texto que arma el backend cuando se usa la plantilla aprobada.
 * Sirve como punto de partida editable: mientras el médico no lo toque no se
 * envía nada y el servidor genera su propia versión.
 */
const buildTemplateBody = (template: ConsentTemplate | null, procedureName: string, diagnosis: string): string => {
  if (!template) return ''
  const lines = [template.summary]
  if (procedureName.trim()) lines.push(`Procedimiento confirmado: ${procedureName.trim()}.`)
  if (diagnosis.trim()) lines.push(`Diagnóstico o indicación documentada: ${diagnosis.trim()}.`)
  lines.push('La paciente declara que recibió información suficiente y puede realizar preguntas antes de firmar.')
  return lines.join('\n\n')
}

const ClinicalConsentCard = ({ patientId, appointmentId, patientName = '', defaultProcedure, readOnly = false, onSummaryChange }: ClinicalConsentCardProps) => {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([])
  const [consents, setConsents] = useState<ClinicalConsent[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [procedureName, setProcedureName] = useState(defaultProcedure ?? '')
  const [diagnosis, setDiagnosis] = useState('')
  const [useTemplateBody, setUseTemplateBody] = useState(true)
  const [bodyText, setBodyText] = useState('')
  const [bodyEdited, setBodyEdited] = useState(false)
  const [activeDraft, setActiveDraft] = useState<ClinicalConsent | null>(null)
  const [patientSignedName, setPatientSignedName] = useState(patientName)
  const [signature, setSignature] = useState<string | null>(null)
  const [checks, setChecks] = useState<string[]>([])
  const [photoRecord, setPhotoRecord] = useState(false)
  const [photoEducation, setPhotoEducation] = useState(false)
  const [transfusion, setTransfusion] = useState<boolean | null>(null)
  const [cancelTarget, setCancelTarget] = useState<ClinicalConsent | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El aviso de error vive arriba de la tarjeta; en el teléfono, al pulsar
  // «Confirmar y guardar firmado» abajo, el mensaje («Confirma todos los
  // puntos…») quedaba fuera de la vista y parecía que el botón no hacía nada
  // (plan 29, lote 6). Se lleva a la vista cuando aparece.
  const avisoRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (error) avisoRef.current?.scrollIntoView?.({ block: 'center' })
  }, [error])
  const [viendo, setViendo] = useState<ClinicalConsent | null>(null)

  const selectedTemplate = useMemo(() => templates.find((template) => template.consent_type === selectedType) ?? null, [templates, selectedType])
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [templateResponse, consentResponse] = await Promise.all([
        apiClient.get<ConsentTemplate[]>('/clinical-consents/templates'),
        apiClient.get<ClinicalConsentPage>(`/clinical-consents/patient/${patientId}?appointment_id=${appointmentId}`),
      ])
      setTemplates(templateResponse.data); setConsents(consentResponse.data.items)
      const draft = consentResponse.data.items.find((item) => item.status === 'draft') ?? null
      setActiveDraft(draft)
      if (draft) { setSelectedType(draft.consent_type); setProcedureName(draft.procedure_name ?? ''); setDiagnosis(draft.diagnosis ?? '') }
    } catch (requestError: any) { setError(requestError.response?.data?.detail || 'No fue posible cargar los consentimientos.') }
    finally { setLoading(false) }
  }, [appointmentId, patientId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!onSummaryChange) return
    onSummaryChange({ total: consents.length, signed: consents.filter((item) => item.status === 'signed').length })
  }, [consents, onSummaryChange])
  useEffect(() => { setPatientSignedName(patientName) }, [patientName])
  // Con el interruptor encendido el área muestra el texto precargado y se
  // mantiene al día con el procedimiento/diagnóstico, hasta que el médico
  // escribe encima: a partir de ahí manda su versión.
  useEffect(() => {
    if (!useTemplateBody || bodyEdited) return
    setBodyText(buildTemplateBody(selectedTemplate, procedureName, diagnosis))
  }, [useTemplateBody, bodyEdited, selectedTemplate, procedureName, diagnosis])

  const toggleTemplateBody = (enabled: boolean) => {
    setUseTemplateBody(enabled)
    setBodyEdited(false)
    setBodyText(enabled ? buildTemplateBody(selectedTemplate, procedureName, diagnosis) : '')
  }

  const createDraft = async () => {
    if (!selectedType) { setError('Selecciona el consentimiento que corresponde al procedimiento.'); return }
    if (!useTemplateBody && !bodyText.trim()) { setError('Escribe el texto del consentimiento o enciende el texto precargado.'); return }
    setSaving(true); setError(null)
    try {
      // Si usa la plantilla sin tocarla, no se envía texto: lo arma el servidor.
      const customBody = useTemplateBody && !bodyEdited ? undefined : bodyText.trim() || undefined
      const response = await apiClient.post<ClinicalConsent>('/clinical-consents', { patient_id: patientId, appointment_id: appointmentId, consent_type: selectedType, procedure_name: procedureName || undefined, diagnosis: diagnosis || undefined, custom_body: customBody, use_template_body: useTemplateBody })
      setActiveDraft(response.data); setChecks([]); setSignature(null)
    } catch (requestError: any) { setError(requestError.response?.data?.detail || 'No fue posible preparar el consentimiento.') }
    finally { setSaving(false) }
  }
  const sign = async () => {
    if (!activeDraft || !signature) { setError('La paciente debe firmar antes de guardar.'); return }
    if (!patientSignedName.trim()) { setError('Confirma el nombre de la paciente que firma.'); return }
    if (selectedTemplate && checks.length !== selectedTemplate.acknowledgements.length) { setError('Confirma todos los puntos antes de firmar.'); return }
    if (selectedTemplate?.allows_transfusion_choice && transfusion === null) { setError('Registra la decisión sobre transfusión.'); return }
    setSaving(true); setError(null)
    try {
      await apiClient.post(`/clinical-consents/${activeDraft.id}/sign`, { patient_signed_name: patientSignedName.trim(), signature_data_url: signature, acknowledgements: checks, photo_record_authorized: selectedTemplate?.allows_photos ? photoRecord : undefined, photo_education_authorized: selectedTemplate?.allows_photos ? photoEducation : undefined, transfusion_authorized: selectedTemplate?.allows_transfusion_choice ? transfusion : undefined })
      setActiveDraft(null); setSignature(null); setChecks([]); setBodyEdited(false); await load()
    } catch (requestError: any) { setError(requestError.response?.data?.detail || 'No fue posible firmar el consentimiento.') }
    finally { setSaving(false) }
  }
  const toggleCheck = (value: string) => setChecks((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  const openCancel = (consent: ClinicalConsent) => { setCancelTarget(consent); setCancelReason(''); setError(null) }
  /** Anula el documento sin borrarlo: queda en el historial con su motivo. */
  const confirmCancel = async () => {
    if (!cancelTarget) return
    if (cancelReason.trim().length < 5) { setError('Escribe el motivo de la cancelación; queda registrado en el expediente.'); return }
    setSaving(true); setError(null)
    try {
      await apiClient.post(`/clinical-consents/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() })
      setCancelTarget(null); setCancelReason(''); setActiveDraft(null); await load()
    } catch (requestError: any) { setError(requestError.response?.data?.detail || 'No fue posible cancelar el consentimiento.') }
    finally { setSaving(false) }
  }
  // El PDF firmado se abre en el visor (zoom, descargar, abrir o compartir en
  // el teléfono). Antes se forzaba una descarga con un enlace temporal que en
  // iOS no siempre se abría.
  const archivoDelVisor = useMemo<ArchivoVisor[]>(
    () =>
      viendo
        ? [{
            clave: `consentimiento-${viendo.id}`,
            nombre: `consentimiento-${viendo.id}.pdf`,
            mime: 'application/pdf',
            cargar: async () =>
              (await apiClient.get(`/clinical-consents/${viendo.id}/download`, { responseType: 'blob' })).data as Blob,
          }]
        : [],
    [viendo],
  )
  const download = (consent: ClinicalConsent) => setViendo(consent)

  return <>
    {error && <div ref={avisoRef}><CAlert color="danger" dismissible onClose={() => setError(null)} role="alert">{error}</CAlert></div>}
    {loading && <div className="text-center py-3"><CSpinner size="sm" /><div className="small mt-2">Cargando consentimientos...</div></div>}
    {!loading && !activeDraft && !readOnly && <>
      <CAlert color="info" className="small"><CIcon icon={cilShieldAlt} className="me-1" />Selecciona solo el formato aplicable después de explicar el procedimiento. Los datos clínicos se confirman antes de firmar.</CAlert>
      <CRow className="g-3"><CCol md={6}><CFormLabel>Formato de consentimiento</CFormLabel><CFormSelect value={selectedType} onChange={(event) => setSelectedType(event.target.value)}><option value="">Seleccionar…</option>{templates.map((template) => <option key={template.consent_type} value={template.consent_type}>{template.title}</option>)}</CFormSelect></CCol><CCol md={6}><CFormLabel>Procedimiento confirmado</CFormLabel><CFormInput value={procedureName} maxLength={255} onChange={(event) => setProcedureName(event.target.value)} placeholder="Ej. Colocación de DIU hormonal" /></CCol><CCol md={12}><CFormLabel>Diagnóstico o indicación documentada</CFormLabel><CFormTextarea rows={2} value={diagnosis} maxLength={4000} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Solo lo valorado y confirmado en consulta" /></CCol></CRow>
      <div className="border rounded p-3 mt-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div><CFormLabel htmlFor="consent-template-switch" className="mb-0 fw-semibold">Texto del consentimiento</CFormLabel><div className="small text-body-secondary">{useTemplateBody ? 'Cargado del documento precargado. Puedes editarlo antes de firmar.' : 'En blanco para que escribas el texto que corresponde.'}</div></div>
          <div className="d-flex align-items-center gap-2"><CFormSwitch id="consent-template-switch" role="switch" aria-label="Usar el texto precargado del documento" checked={useTemplateBody} onChange={(event) => toggleTemplateBody(event.target.checked)} disabled={saving} /><CBadge color={useTemplateBody ? 'info' : 'secondary'}>{useTemplateBody ? 'Usando texto precargado' : 'Texto libre'}</CBadge></div>
        </div>
        <CFormTextarea className="mt-3" rows={8} value={bodyText} maxLength={20000} disabled={saving} onChange={(event) => { setBodyText(event.target.value); setBodyEdited(true) }} placeholder={useTemplateBody ? 'Selecciona un formato para cargar su texto…' : 'Escribe aquí el texto del consentimiento…'} />
        {useTemplateBody && bodyEdited && <div className="small text-body-secondary mt-1">Texto de la plantilla ajustado por ti; se guardará tal como se ve aquí.</div>}
      </div>
      {selectedTemplate && <CAlert color="light" className="small mt-3 mb-0"><strong>{selectedTemplate.title}</strong><br />{selectedTemplate.summary}</CAlert>}
      <div className="d-flex justify-content-end mt-3"><CButton color="primary" onClick={createDraft} disabled={saving || !selectedType}>{saving ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilPlus} className="me-1" />}Preparar para firma</CButton></div>
    </>}
    {!loading && activeDraft && selectedTemplate && <div className="border rounded p-3 bg-light"><div className="d-flex justify-content-between gap-2 mb-2"><h6 className="mb-0">Revisión con la paciente</h6><CBadge color="secondary">Borrador</CBadge></div><p className="small white-space-pre-line mb-3">{activeDraft.rendered_body}</p>
      {selectedTemplate.acknowledgements.map((item) => <CFormCheck key={item} id={`consent-check-${item}`} className="mb-2" checked={checks.includes(item)} onChange={() => toggleCheck(item)} label={item} disabled={saving || readOnly} />)}
      {selectedTemplate.allows_photos && <div className="border-top mt-3 pt-3"><CFormCheck id="photo-record" checked={photoRecord} onChange={(event) => setPhotoRecord(event.target.checked)} label="Autorizo fotografías clínicas para mi expediente y seguimiento." disabled={saving || readOnly} /><CFormCheck id="photo-education" className="mt-2" checked={photoEducation} onChange={(event) => setPhotoEducation(event.target.checked)} label="Autorizo el uso docente/educativo de imágenes, de forma separada." disabled={saving || readOnly} /></div>}
      {selectedTemplate.allows_transfusion_choice && <div className="border-top mt-3 pt-3"><CFormLabel className="small fw-semibold">Transfusión y hemoderivados si son médicamente necesarios</CFormLabel><CFormCheck type="radio" name="transfusion" id="transfusion-yes" label="Autorizo" checked={transfusion === true} onChange={() => setTransfusion(true)} /><CFormCheck type="radio" name="transfusion" id="transfusion-no" label="No autorizo y comprendo los riesgos explicados" checked={transfusion === false} onChange={() => setTransfusion(false)} /></div>}
      <CFormLabel className="mt-3">Nombre de la paciente que firma</CFormLabel><CFormInput value={patientSignedName} maxLength={200} onChange={(event) => setPatientSignedName(event.target.value)} disabled={saving || readOnly} /><CFormLabel className="mt-3">Firma de la paciente</CFormLabel><SignatureCanvas onChange={setSignature} disabled={saving || readOnly} />
      <div className="d-flex justify-content-end gap-2 mt-3">{!readOnly && <CButton color="danger" variant="outline" onClick={() => openCancel(activeDraft)} disabled={saving}><CIcon icon={cilBan} className="me-1" />Cancelar este consentimiento</CButton>}<CButton color="success" onClick={sign} disabled={saving || readOnly}>{saving ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilPen} className="me-1" />}Confirmar y guardar firmado</CButton></div>
    </div>}
    {cancelTarget && <div className="border border-danger rounded p-3 mt-3">
      <div className="fw-semibold small mb-1">Cancelar «{cancelTarget.title}»</div>
      <div className="small text-body-secondary mb-2">El documento no se borra: queda en el expediente marcado como cancelado, con el motivo, quién lo canceló y cuándo.</div>
      <CFormLabel htmlFor="consent-cancel-reason" className="small">Motivo de la cancelación (obligatorio)</CFormLabel>
      <CFormTextarea id="consent-cancel-reason" rows={2} value={cancelReason} maxLength={2000} disabled={saving} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej. Se firmó el formato equivocado" />
      <div className="d-flex justify-content-end gap-2 mt-3"><CButton color="secondary" variant="ghost" onClick={() => setCancelTarget(null)} disabled={saving}>Volver</CButton><CButton color="danger" onClick={confirmCancel} disabled={saving || cancelReason.trim().length < 5}>{saving ? <CSpinner size="sm" className="me-2" /> : <CIcon icon={cilBan} className="me-1" />}Confirmar cancelación</CButton></div>
    </div>}
    {!loading && consents.length > 0 && <div className="mt-4"><h6 className="small text-uppercase text-body-secondary">Consentimientos de esta consulta</h6><CListGroup flush>{consents.map((consent) => <CListGroupItem key={consent.id} className="px-0 d-flex align-items-center justify-content-between gap-2"><div><div className="fw-semibold small">{consent.title}</div><small className="text-body-secondary">{consent.patient_signed_at ? formatearInstante(consent.patient_signed_at, { dateStyle: 'medium', timeStyle: 'short' }) : 'Pendiente de firma'}</small>{consent.status === 'cancelled' && <div className="small text-danger">Cancelado{consent.cancelled_at ? ` el ${formatearInstante(consent.cancelled_at, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}{consent.cancelled_by_name ? ` por ${consent.cancelled_by_name}` : ''}: {consent.cancelled_reason}</div>}</div><div className="d-flex gap-2 align-items-center"><CBadge color={STATUS[consent.status]?.color ?? 'secondary'}>{STATUS[consent.status]?.label ?? consent.status}</CBadge>{(consent.status === 'signed' || (consent.status === 'cancelled' && consent.patient_signed_at)) && <CButton size="sm" color="primary" variant="ghost" title="Ver el consentimiento firmado" aria-label="Ver el consentimiento firmado" onClick={() => download(consent)}><CIcon icon={cilCloudDownload} /></CButton>}{!readOnly && CANCELABLE.includes(consent.status) && <CButton size="sm" color="danger" variant="ghost" title="Cancelar con motivo" onClick={() => openCancel(consent)}><CIcon icon={cilBan} /></CButton>}</div></CListGroupItem>)}</CListGroup></div>}
    <VisorDocumentos
      visible={viendo !== null}
      onClose={() => setViendo(null)}
      titulo={viendo?.title ?? 'Consentimiento'}
      archivos={archivoDelVisor}
      imprimible
    />
  </>
}

export default ClinicalConsentCard
