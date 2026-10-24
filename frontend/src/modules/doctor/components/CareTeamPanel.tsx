import { useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
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
import { cilPeople, cilPlus, cilReload, cilX } from '@coreui/icons'

import { useAuth } from '../../../shared/context/AuthContext'
import { apiClient } from '../../../shared/services/api'
import { Role, type User } from '../../../shared/types'
import { formatearInstante } from '../../../shared/utils/date'

type CareTeamAccessRole = 'collaborator' | 'assistant' | 'temporary'

interface CareTeamMember {
  id: number
  user_id: number
  user_full_name: string
  user_role: Role
  access_role: CareTeamAccessRole
  starts_at: string
  expires_at?: string | null
  revoked_at?: string | null
}

interface CareTeamPanelProps {
  patientId: number
  ownerDoctorId?: number | null
  /** Dentro de otra tarjeta (el expediente ya pone el titulo y el marco). */
  embedded?: boolean
}

const roleMeta: Record<CareTeamAccessRole, { label: string; color: 'primary' | 'info' | 'warning' }> = {
  collaborator: { label: 'Médico colaborador', color: 'primary' },
  assistant: { label: 'Auxiliar asignada', color: 'info' },
  temporary: { label: 'Acceso temporal', color: 'warning' },
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sin vencimiento'
  return formatearInstante(value, { dateStyle: 'medium', timeStyle: 'short' })
}

// El equipo tratante concede apoyo administrativo sobre el expediente: quien
// captura documentos o adjunta estudios del paciente. No concede cobertura
// clinica entre doctoras — eso se cerro el 2026-09-24 y el servidor lo rechaza
// con 422. Este panel ofrece cuentas de recepcion y no de medicos por esa
// razon: un selector que sirviera solo para recibir un error seria exactamente
// el tipo de pantalla que promete algo que el sistema no hace.
const CareTeamPanel = ({ patientId, ownerDoctorId, embedded = false }: CareTeamPanelProps) => {
  const { user } = useAuth()
  const [members, setMembers] = useState<CareTeamMember[]>([])
  const [apoyos, setApoyos] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGrant, setShowGrant] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<CareTeamMember | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [accessRole, setAccessRole] = useState<CareTeamAccessRole>('assistant')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const canManage = user?.role === Role.DOCTOR && user.id === ownerDoctorId

  const loadMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.get<CareTeamMember[]>(`/patients/${patientId}/care-team`)
      setMembers(response.data)
    } catch (err: any) {
      setError(
        err.response?.status === 403
          ? 'No tienes una relación asistencial activa para consultar el equipo tratante.'
          : 'No fue posible cargar el equipo tratante.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const openGrant = async () => {
    setError(null)
    setShowGrant(true)
    if (apoyos.length) return
    try {
      const response = await apiClient.get<User[]>('/users/directory', { params: { role: Role.SECRETARIA } })
      setApoyos(response.data.filter((cuenta) => cuenta.id !== ownerDoctorId))
    } catch {
      setError('No fue posible cargar el directorio de cuentas de apoyo.')
    }
  }

  const closeGrant = () => {
    if (saving) return
    setShowGrant(false)
    setSelectedUserId('')
    setAccessRole('assistant')
    setReason('')
    setExpiresAt('')
  }

  const grantAccess = async () => {
    if (!selectedUserId) {
      setError('Selecciona la cuenta que apoyará con este expediente.')
      return
    }
    if (accessRole === 'temporary' && (!reason.trim() || !expiresAt)) {
      setError('El acceso temporal requiere motivo y fecha de vencimiento.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await apiClient.post(`/patients/${patientId}/care-team`, {
        user_id: Number(selectedUserId),
        access_role: accessRole,
        reason: reason.trim() || undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      })
      closeGrant()
      await loadMembers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No fue posible asignar el acceso al expediente.')
    } finally {
      setSaving(false)
    }
  }

  const revokeAccess = async () => {
    if (!revokeTarget || !reason.trim()) {
      setError('Indica el motivo de la revocación.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiClient.delete(`/patients/${patientId}/care-team/${revokeTarget.id}`, { data: { reason: reason.trim() } })
      setRevokeTarget(null)
      setReason('')
      await loadMembers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No fue posible revocar el acceso clínico.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <CCard className={embedded ? 'border-0' : 'border-0 shadow-sm'}><CCardBody className="text-center py-4"><CSpinner size="sm" /> <span className="ms-2">Cargando equipo tratante…</span></CCardBody></CCard>
  }

  return (
    <>
      <CCard className={embedded ? 'border-0' : 'border-0 shadow-sm'}>
        <CCardBody className={embedded ? 'p-0' : 'p-3'}>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div>
              {!embedded && <h5 className="mb-1"><CIcon icon={cilPeople} className="me-2 text-primary" />Equipo tratante</h5>}
              <p className="text-body-secondary small mb-0">Cuentas de apoyo con acceso explícito y revocable a este expediente.</p>
            </div>
            <div className="d-flex gap-2">
              <CButton color="light" size="sm" onClick={() => void loadMembers()} title="Actualizar equipo" aria-label="Actualizar equipo"><CIcon icon={cilReload} /></CButton>
              {canManage && <CButton color="primary" size="sm" onClick={() => void openGrant()}><CIcon icon={cilPlus} className="me-1" />Agregar apoyo</CButton>}
            </div>
          </div>

          {error && <CAlert color="warning" className="small mb-3">{error}</CAlert>}
          {!error && members.length === 0 && <CAlert color="light" className="small mb-0">No hay cuentas de apoyo activas ni históricas en este expediente.</CAlert>}
          {!error && members.map((member) => {
            const meta = roleMeta[member.access_role]
            const isActive = !member.revoked_at && (!member.expires_at || new Date(member.expires_at) > new Date())
            return (
              <div key={member.id} className="border rounded p-2 mb-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div>
                  <strong>{member.user_full_name}</strong>
                  <div className="mt-1 d-flex flex-wrap gap-1 align-items-center">
                    <CBadge color={isActive ? meta.color : 'secondary'}>{isActive ? meta.label : 'Acceso finalizado'}</CBadge>
                    {member.expires_at && <small className="text-body-secondary">Vence: {formatDateTime(member.expires_at)}</small>}
                  </div>
                </div>
                {canManage && isActive && <CButton color="danger" variant="ghost" size="sm" onClick={() => { setRevokeTarget(member); setReason('') }}><CIcon icon={cilX} className="me-1" />Revocar</CButton>}
              </div>
            )
          })}
        </CCardBody>
      </CCard>

      <CModal visible={showGrant} onClose={closeGrant}>
        <CModalHeader><CModalTitle>Agregar apoyo al equipo tratante</CModalTitle></CModalHeader>
        <CModalBody>
          <CAlert color="info" className="small">
            Da acceso a este expediente a una cuenta de apoyo; la responsabilidad clínica sigue siendo tuya.
            El expediente completo de un paciente solo lo abre su médica responsable: compartir la agenda con otra
            doctora no requiere este permiso.
          </CAlert>
          <CFormLabel htmlFor="care-team-user">Cuenta de apoyo</CFormLabel>
          <CFormSelect id="care-team-user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            <option value="">Seleccionar cuenta…</option>
            {apoyos.map((cuenta) => <option value={cuenta.id} key={cuenta.id}>{cuenta.full_name}</option>)}
          </CFormSelect>
          <CFormLabel className="mt-3" htmlFor="care-team-role">Tipo de acceso</CFormLabel>
          <CFormSelect id="care-team-role" value={accessRole} onChange={(event) => setAccessRole(event.target.value as CareTeamAccessRole)}>
            <option value="assistant">Auxiliar asignada</option>
            <option value="temporary">Acceso temporal / guardia</option>
          </CFormSelect>
          {accessRole === 'temporary' && (
            <CRow className="mt-1">
              <CCol md={6}>
                <CFormLabel className="mt-2" htmlFor="care-team-expires">Vence</CFormLabel>
                <CFormInput id="care-team-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              </CCol>
              <CCol md={6}>
                <CFormLabel className="mt-2" htmlFor="care-team-reason">Motivo</CFormLabel>
                <CFormTextarea id="care-team-reason" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. Cobertura durante guardia" />
              </CCol>
            </CRow>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" disabled={saving} onClick={closeGrant}>Cancelar</CButton>
          <CButton color="primary" disabled={saving} onClick={() => void grantAccess()}>{saving ? 'Guardando…' : 'Conceder acceso'}</CButton>
        </CModalFooter>
      </CModal>

      <CModal visible={Boolean(revokeTarget)} onClose={() => !saving && setRevokeTarget(null)}>
        <CModalHeader><CModalTitle>Revocar acceso clínico</CModalTitle></CModalHeader>
        <CModalBody>
          <p className="mb-3">Se conservará la evidencia de que <strong>{revokeTarget?.user_full_name}</strong> tuvo acceso, pero dejará de poder abrir este expediente.</p>
          <CFormLabel htmlFor="care-team-revoke-reason">Motivo de revocación</CFormLabel>
          <CFormTextarea id="care-team-revoke-reason" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. Terminó la cobertura de guardia" />
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" disabled={saving} onClick={() => setRevokeTarget(null)}>Cancelar</CButton>
          <CButton color="danger" disabled={saving} onClick={() => void revokeAccess()}>{saving ? 'Revocando…' : 'Revocar acceso'}</CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default CareTeamPanel
