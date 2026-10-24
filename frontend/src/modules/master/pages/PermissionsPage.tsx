import { useState, useCallback } from 'react'
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
  CInputGroup,
  CInputGroupText,
  CFormInput,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilShieldAlt, cilCheckCircle, cilUser, cilSearch } from '@coreui/icons'

import { usePermissions } from '../hooks/usePermissions'
import { useMasterUsers } from '../hooks/useMasterUsers'
import ModuleAccordion from '../components/ModuleAccordion'
import { MODULE_HIERARCHY } from '../components/moduleHierarchy'
import type { User } from '../../../shared/types'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const roleColor: Record<string, string> = {
  master: 'dark',
  admin: 'danger',
  doctor: 'primary',
  secretaria: 'info',
}

const roleLabel: Record<string, string> = {
  master: 'Master',
  admin: 'Admin',
  doctor: 'Doctor',
  secretaria: 'Secretaría',
}

const PermissionsPage = () => {
  const { users, loading: loadingUsers, error: errorUsuarios, refresh: recargarUsuarios } = useMasterUsers()
  const { getUserPermissions, updateUserPermissions, saving } = usePermissions()

  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [roleDefaults, setRoleDefaults] = useState<Record<string, boolean>>({})
  const [savingError, setSavingError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [loadingPerms, setLoadingPerms] = useState(false)
  // Si no se pudieron leer, no se muestra nada que editar: los permisos de la
  // persona anterior se veían como si fueran de ésta.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedModules, setExpandedModules] = useState<string[]>([])

  const loadPermissions = useCallback(async (user: User) => {
    setLoadingPerms(true)
    setSelectedUser(user)
    setSaveSuccess(false)
    setSavingError(null)
    setErrorCarga(null)
    setPermissions({})
    setRoleDefaults({})

    let result: Awaited<ReturnType<typeof getUserPermissions>> | null = null
    try {
      result = await getUserPermissions(user.id)
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudieron leer los permisos de esta persona.')
    }
    if (result) {
      const defaults: Record<string, boolean> = {}
      const current: Record<string, boolean> = {}

      for (const action of result.role_defaults) {
        defaults[action] = true
        current[action] = true
      }

      for (const ov of result.overrides) {
        current[ov.action] = ov.is_granted
      }

      for (const action of result.effective_permissions) {
        if (!(action in current)) {
          current[action] = true
        }
      }

      setRoleDefaults(defaults)
      setPermissions(current)
      // Expand all modules by default when loading a user
      setExpandedModules(MODULE_HIERARCHY.map(m => m.label))
    }
    setLoadingPerms(false)
  }, [getUserPermissions])

  const handlePermissionChange = (action: string, granted: boolean) => {
    setPermissions(prev => ({ ...prev, [action]: granted }))
  }

  const handleSave = async () => {
    if (!selectedUser) return
    setSaveSuccess(false)
    setSavingError(null)

    const overrides: { user_id: number; action: string; is_granted: boolean }[] = []
    for (const action of Object.keys(permissions)) {
      const defaultVal = roleDefaults[action] ?? false
      const currentVal = permissions[action] ?? false
      if (defaultVal !== currentVal) {
        overrides.push({
          user_id: selectedUser.id,
          action,
          is_granted: currentVal,
        })
      }
    }

    const resultado = await updateUserPermissions(selectedUser.id, overrides)
    if (resultado) {
      setSaveSuccess(true)
    } else {
      setSavingError('Error al guardar los permisos')
    }
  }

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalOverrides = selectedUser
    ? Object.keys(permissions).filter(a => (permissions[a] ?? false) !== (roleDefaults[a] ?? false)).length
    : 0

  if (loadingUsers) {
    return (
      <div className="pt-3 text-center">
        <CSpinner color="primary" variant="grow" />
      </div>
    )
  }

  return (
    <>
      <EncabezadoPantalla
        titulo="Gestión de Permisos"
        descripcion="Configura permisos granulares por usuario. Al guardar, la sesión de esa persona toma los permisos nuevos en su siguiente acción, sin cerrar sesión."
        icono={cilShieldAlt}
        padre={{ nombre: 'Panel de Desarrollador', ruta: '/master' }}
      />

      {saveSuccess && (
        <CAlert color="success" dismissible onClose={() => setSaveSuccess(false)}>
          <CIcon icon={cilCheckCircle} className="me-2" />
          Permisos actualizados. La sesión de esta persona los tomará en su siguiente acción,
          sin necesidad de que vuelva a entrar.
        </CAlert>
      )}
      {savingError && (
        <CAlert color="danger" dismissible onClose={() => setSavingError(null)}>
          {savingError}
        </CAlert>
      )}

      <CRow>
        {/* ─── Lista de usuarios ─── */}
        <CCol md={4} lg={3}>
          <CCard className="glass-card mb-4" data-tour="permisos-usuarios">
            <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
              <CIcon icon={cilUser} />
              Usuarios
              <CBadge color="info" shape="rounded-pill" className="ms-auto">{users.length}</CBadge>
            </CCardHeader>
            <CCardBody className="p-0">
              <div className="p-2 border-bottom">
                <CInputGroup size="sm">
                  <CInputGroupText className="bg-transparent border-end-0">
                    <CIcon icon={cilSearch} />
                  </CInputGroupText>
                  <CFormInput
                    placeholder="Buscar usuario..."
                    className="border-start-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </CInputGroup>
              </div>
              <div className="list-group list-group-flush" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {filteredUsers.map(user => (
                  <button
                    key={user.id}
                    className={`list-group-item list-group-item-action d-flex align-items-center gap-2 border-0 ${
                      selectedUser?.id === user.id ? 'active' : ''
                    }`}
                    // Se anuncia cual esta elegido, no solo se pinta: derivado
                    // del mismo estado que el resaltado, para que no puedan
                    // desincronizarse.
                    aria-pressed={selectedUser?.id === user.id}
                    onClick={() => loadPermissions(user)}
                  >
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0 fw-bold small"
                      style={{ width: '34px', height: '34px', backgroundColor: user.role === 'admin' ? '#dc3545' : user.role === 'doctor' ? '#0d6efd' : '#0dcaf0' }}
                    >
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-grow-1 min-width-0 text-start">
                      <div className="fw-semibold small text-truncate">{user.full_name}</div>
                      {/* En la fila elegida (fondo azul) basta atenuar el blanco; en las demás,
                          opacity-75 dejaba el correo en 3.1:1 sobre blanco (axe, plan 32). */}
                      <div className={`small text-truncate ${selectedUser?.id === user.id ? 'opacity-75' : 'text-body-secondary'}`}>
                        {user.email}
                      </div>
                    </div>
                    <CBadge color={roleColor[user.role] || 'secondary'} shape="rounded-pill" className="flex-shrink-0">
                      {roleLabel[user.role] || user.role}
                    </CBadge>
                  </button>
                ))}
                {/* Si la lista no se pudo leer, «Sin resultados» mentiría (plan 29). */}
                {errorUsuarios ? (
                  <div className="text-center text-danger small py-4" role="alert">
                    No se pudieron cargar los usuarios.{' '}
                    <CButton color="danger" variant="outline" size="sm" onClick={recargarUsuarios}>
                      Reintentar
                    </CButton>
                  </div>
                ) : filteredUsers.length === 0 && (
                  <div className="text-center text-muted small py-4">Sin resultados</div>
                )}
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        {/* ─── Panel de permisos ─── */}
        <CCol md={8} lg={9}>
          <CCard className="glass-card" data-tour="permisos-panel">
            <CCardHeader className="fw-semibold d-flex justify-content-between align-items-center">
              <span className="d-flex align-items-center gap-2">
                <CIcon icon={cilShieldAlt} />
                {selectedUser ? (
                  <>
                    Permisos de:
                    <strong>{selectedUser.full_name}</strong>
                    <CBadge color={roleColor[selectedUser.role]} shape="rounded-pill">
                      {roleLabel[selectedUser.role]}
                    </CBadge>
                  </>
                ) : (
                  'Selecciona un usuario'
                )}
              </span>
              {selectedUser && (
                <div className="d-flex align-items-center gap-2">
                  {totalOverrides > 0 && (
                    <span className="small text-warning fw-semibold">{totalOverrides} override(s)</span>
                  )}
                  <CButton
                    color="primary"
                    size="sm"
                    data-tour="permisos-guardar"
                    onClick={handleSave}
                    disabled={saving || loadingPerms || errorCarga !== null}
                  >
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </CButton>
                </div>
              )}
            </CCardHeader>
            <CCardBody>
              {!selectedUser && (
                <div className="text-center text-muted py-5">
                  <CIcon icon={cilShieldAlt} size="xxl" className="mb-3 opacity-25" />
                  <p>Selecciona un usuario de la lista izquierda para gestionar sus permisos.</p>
                </div>
              )}

              {selectedUser && loadingPerms && (
                <div className="text-center py-5">
                  <CSpinner color="primary" />
                  <p className="text-muted small mt-2">Cargando permisos...</p>
                </div>
              )}

              {selectedUser && !loadingPerms && errorCarga && (
                <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
                  <span className="flex-grow-1">{errorCarga} No se muestra nada para no guardar permisos equivocados.</span>
                  <CButton color="danger" variant="outline" size="sm" onClick={() => void loadPermissions(selectedUser)}>
                    Reintentar
                  </CButton>
                </CAlert>
              )}

              {selectedUser && !loadingPerms && !errorCarga && (
                <div data-tour="permisos-modulos">
                <ModuleAccordion
                  modules={MODULE_HIERARCHY}
                  permissions={permissions}
                  roleDefaults={roleDefaults}
                  onPermissionChange={handlePermissionChange}
                  defaultExpanded={expandedModules}
                />
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </>
  )
}

export default PermissionsPage
