import React, { useState } from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CBadge,
  CButton,
  CAlert,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CForm,
  CFormInput,
  CFormSelect,
  CFormTextarea,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilPeople, cilPlus, cilTrash, cilPencil, cilCheckCircle, cilUser, cilUserFollow } from '@coreui/icons'
import { useCustomRoles } from '../hooks/useCustomRoles'
import { useMasterUsers } from '../hooks/useMasterUsers'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const baseRoleLabels: Record<string, string> = {
  admin: 'Administrador',
  secretaria: 'Secretaría',
  doctor: 'Doctor',
}

const RolesPage: React.FC = () => {
  const { systemRoles, customRoles, loading, saving, error, createRole, updateRole, deleteRole } = useCustomRoles()
  const { loading: loadingUsers } = useMasterUsers()

  // Create/Edit modal state
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formBaseRole, setFormBaseRole] = useState('secretaria')
  const [formDescription, setFormDescription] = useState('')
  // El aviso va junto al campo y no en un renglón aparte al pie del modal.
  const [errorNombre, setErrorNombre] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const openCreate = () => {
    setEditId(null)
    setFormName('')
    setFormBaseRole('secretaria')
    setFormDescription('')
    setErrorNombre(null)
    setShowModal(true)
  }

  const openEdit = (role: typeof customRoles[0]) => {
    setEditId(role.id)
    setFormName(role.name)
    setFormBaseRole(role.base_role)
    setFormDescription(role.description || '')
    setErrorNombre(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    // Se valida antes de llamar al servidor; el mismo texto de siempre, ahora
    // pegado al campo que falta.
    if (!formName.trim()) {
      setErrorNombre('El nombre del rol es obligatorio')
      return
    }
    setErrorNombre(null)

    let ok: boolean
    if (editId) {
      ok = await updateRole(editId, { name: formName.trim(), base_role: formBaseRole, description: formDescription.trim() || null } as any)
    } else {
      ok = await createRole({ name: formName.trim(), base_role: formBaseRole, description: formDescription.trim() || undefined })
    }

    if (ok) {
      setShowModal(false)
      setSuccessMsg(editId ? 'Rol actualizado correctamente' : 'Rol creado correctamente')
      setTimeout(() => setSuccessMsg(null), 3000)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    const ok = await deleteRole(deleteId)
    if (ok) {
      setDeleteId(null)
      setSuccessMsg('Rol eliminado correctamente')
      setTimeout(() => setSuccessMsg(null), 3000)
    }
  }

  if (loading || loadingUsers) {
    return <div className="pt-3 text-center"><CSpinner color="primary" variant="grow" /></div>
  }

  return (
    <>
      <EncabezadoPantalla
        titulo="Gestión de Roles"
        descripcion="Crea roles personalizados para usuarios de la clínica. Los roles heredan permisos del rol base."
        icono={cilUserFollow}
        padre={{ nombre: 'Panel de Desarrollador', ruta: '/master' }}
      />

      {successMsg && (
        <CAlert color="success" dismissible onClose={() => setSuccessMsg(null)}>
          <CIcon icon={cilCheckCircle} className="me-2" />{successMsg}
        </CAlert>
      )}
      {error && (
        <CAlert color="danger">
          {error}
        </CAlert>
      )}

      <CRow>
        {/* ─── Roles del Sistema ─── */}
        <CCol md={6}>
          <CCard className="glass-card mb-4" data-tour="roles-sistema">
            <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
              <CIcon icon={cilUser} />
              Roles del Sistema (inmutables)
            </CCardHeader>
            <CCardBody>
              <CTable small hover responsive>
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Rol</CTableHeaderCell>
                    <CTableHeaderCell>Usuarios</CTableHeaderCell>
                    <CTableHeaderCell>Tipo</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {systemRoles.map(r => (
                    <CTableRow key={r.name}>
                      <CTableDataCell>
                        <CBadge
                          color={r.name === 'admin' ? 'danger' : r.name === 'doctor' ? 'primary' : 'info'}
                          shape="rounded-pill"
                        >
                          {r.label}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="fw-bold">{r.user_count}</CTableDataCell>
                      <CTableDataCell>
                        <CBadge color="dark" shape="rounded-pill" className="small">Sistema</CBadge>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </CCardBody>
          </CCard>
        </CCol>

        {/* ─── Roles Personalizados ─── */}
        <CCol md={6}>
          <CCard className="glass-card mb-4" data-tour="roles-personalizados">
            <CCardHeader className="fw-semibold d-flex justify-content-between align-items-center">
              <span className="d-flex align-items-center gap-2">
                <CIcon icon={cilPeople} />
                Roles Personalizados
              </span>
              <CButton color="success" size="sm" onClick={openCreate} data-tour="roles-nuevo">
                <CIcon icon={cilPlus} className="me-1" />
                Nuevo Rol
              </CButton>
            </CCardHeader>
            <CCardBody>
              {customRoles.length === 0 ? (
                <p className="text-muted text-center small py-3 mb-0">
                  No hay roles personalizados. Crea uno para empezar.
                </p>
              ) : (
                <CTable small hover responsive>
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell>Nombre</CTableHeaderCell>
                      <CTableHeaderCell>Base</CTableHeaderCell>
                      <CTableHeaderCell>Estado</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Acción</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {customRoles.map(r => (
                      <CTableRow key={r.id}>
                        <CTableDataCell className="fw-semibold small">{r.name}</CTableDataCell>
                        <CTableDataCell>
                          <CBadge color="secondary" shape="rounded-pill" className="small">
                            {baseRoleLabels[r.base_role] || r.base_role}
                          </CBadge>
                        </CTableDataCell>
                        <CTableDataCell>
                          <CBadge color={r.is_active ? 'success' : 'secondary'} shape="rounded-pill" className="small">
                            {r.is_active ? 'Activo' : 'Inactivo'}
                          </CBadge>
                        </CTableDataCell>
                        <CTableDataCell className="text-end">
                          <CButton color="warning" variant="ghost" size="sm" onClick={() => openEdit(r)} title="Editar">
                            <CIcon icon={cilPencil} />
                          </CButton>
                          <CButton color="danger" variant="ghost" size="sm" onClick={() => setDeleteId(r.id)} title="Eliminar">
                            <CIcon icon={cilTrash} />
                          </CButton>
                        </CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* ─── Modal Crear/Editar ─── */}
      <CModal visible={showModal} onClose={() => setShowModal(false)}>
        <CModalHeader>
          <CModalTitle>{editId ? 'Editar Rol' : 'Nuevo Rol Personalizado'}</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <CForm onSubmit={(e) => { e.preventDefault(); handleSave() }} noValidate>
            <div className="mb-3">
              <label className="form-label small fw-semibold" htmlFor="rol-nombre">Nombre del Rol</label>
              <CFormInput
                id="rol-nombre"
                placeholder="Ej: Contador, Enfermera, Recepcionista"
                value={formName}
                onChange={e => {
                  setFormName(e.target.value)
                  if (errorNombre) setErrorNombre(null)
                }}
                invalid={Boolean(errorNombre)}
                aria-invalid={Boolean(errorNombre) || undefined}
                aria-describedby={errorNombre ? 'error-rol-nombre' : undefined}
              />
              <ErrorDeCampo id="error-rol-nombre" mensaje={errorNombre} />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Rol Base (hereda permisos)</label>
              <CFormSelect value={formBaseRole} onChange={e => setFormBaseRole(e.target.value)}>
                <option value="admin">Administrador</option>
                <option value="secretaria">Secretaría</option>
                <option value="doctor">Doctor</option>
              </CFormSelect>
              <div className="small text-muted mt-1">
                El rol personalizado hereda todos los permisos del rol base. Luego puedes personalizarlos.
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Descripción (opcional)</label>
              <CFormTextarea
                placeholder="Describe el propósito de este rol..."
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>
          </CForm>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setShowModal(false)}>Cancelar</CButton>
          <CButton color="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear Rol'}
          </CButton>
        </CModalFooter>
      </CModal>

      {/* ─── Modal Confirmar Eliminación ─── */}
      <CModal visible={deleteId !== null} onClose={() => setDeleteId(null)}>
        <CModalHeader>
          <CModalTitle>Confirmar Eliminación</CModalTitle>
        </CModalHeader>
        <CModalBody>
          ¿Estás seguro de eliminar este rol personalizado? Si alguna cuenta lo tiene asignado, el sistema no
          te dejará eliminarlo hasta que le asignes otro rol.
          {/* El aviso de la página queda tapado por este modal: el motivo del
              rechazo tiene que verse aquí, donde se oprimió «Eliminar». */}
          {error && (
            <CAlert color="danger" className="mt-3 mb-0">
              {error}
            </CAlert>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setDeleteId(null)}>Cancelar</CButton>
          <CButton color="danger" onClick={handleDelete} disabled={saving}>
            {saving ? 'Eliminando...' : 'Eliminar'}
          </CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}

export default RolesPage
