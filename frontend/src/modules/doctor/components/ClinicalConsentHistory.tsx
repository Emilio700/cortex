import { useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CCard, CCardBody, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCloudDownload, cilDescription } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import type { ClinicalConsent, ClinicalConsentPage } from '../types/clinicalConsent'
import { formatearInstante } from '../../../shared/utils/date'

interface ClinicalConsentHistoryProps { patientId: number }
const STATUS: Record<string, { label: string; color: 'success' | 'secondary' | 'danger' | 'dark' }> = { signed: { label: 'Firmado', color: 'success' }, draft: { label: 'Borrador', color: 'secondary' }, revoked: { label: 'Revocado', color: 'danger' }, rejected: { label: 'Rechazado', color: 'danger' }, cancelled: { label: 'Cancelado', color: 'dark' } }
/** Un consentimiento cancelado nunca se borra: se muestra anulado y con su motivo. */

const ClinicalConsentHistory = ({ patientId }: ClinicalConsentHistoryProps) => {
  const [consents, setConsents] = useState<ClinicalConsent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const load = async () => { setLoading(true); try { const response = await apiClient.get<ClinicalConsentPage>(`/clinical-consents/patient/${patientId}`); setConsents(response.data.items) } catch (requestError: any) { setError(requestError.response?.data?.detail || 'No fue posible cargar consentimientos.') } finally { setLoading(false) } }; void load() }, [patientId])
  const download = async (consent: ClinicalConsent) => { try { const response = await apiClient.get(`/clinical-consents/${consent.id}/download`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `consentimiento-${consent.id}.pdf`; link.click(); URL.revokeObjectURL(url) } catch { setError('No fue posible descargar el PDF.') } }
  return <CCard className="border-0 shadow-sm"><CCardBody><div className="d-flex align-items-center gap-2 mb-3"><CIcon icon={cilDescription} className="text-primary" /><div><h5 className="mb-0">Consentimientos</h5><small className="text-body-secondary">Historial firmado y protegido del expediente.</small></div></div>{loading && <div className="text-center py-2"><CSpinner size="sm" /></div>}{error && <CAlert color="danger" dismissible onClose={() => setError(null)}>{error}</CAlert>}{!loading && !error && consents.length === 0 && <CAlert color="light" className="mb-0">Aún no hay consentimientos registrados.</CAlert>}{!loading && consents.map((consent) => <div key={consent.id} className="border rounded p-2 mb-2 d-flex justify-content-between align-items-center gap-2"><div><div className="fw-semibold small">{consent.title}</div><small className="text-body-secondary">{consent.patient_signed_at ? formatearInstante(consent.patient_signed_at, { dateStyle: 'medium' }) : 'Sin firma registrada'}</small>{consent.status === 'cancelled' && <div className="small text-danger">Cancelado{consent.cancelled_at ? ` el ${formatearInstante(consent.cancelled_at, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}{consent.cancelled_by_name ? ` por ${consent.cancelled_by_name}` : ''}: {consent.cancelled_reason}</div>}</div><div className="d-flex align-items-center gap-2"><CBadge color={STATUS[consent.status]?.color ?? 'secondary'}>{STATUS[consent.status]?.label ?? consent.status}</CBadge>{(consent.status === 'signed' || (consent.status === 'cancelled' && consent.patient_signed_at)) && <CButton size="sm" color="primary" variant="ghost" title="Descargar consentimiento" aria-label="Descargar consentimiento" onClick={() => void download(consent)}><CIcon icon={cilCloudDownload} /></CButton>}</div></div>)}</CCardBody></CCard>
}

export default ClinicalConsentHistory
