import React, { useState } from 'react'
import {
  CDropdown,
  CDropdownHeader,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  CForm,
  CFormInput,
  CFormLabel,
  CButton,
  CAlert,
  CRow,
  CCol,
} from '@coreui/react-pro'
import { cilUser, cilAccountLogout, cilLockLocked } from '@coreui/icons'
import CIcon from '@coreui/icons-react'

import { useAuth } from '../../shared/context/AuthContext'
import apiClient from '../../shared/services/api'
import ErrorDeCampo from '../../shared/components/ErrorDeCampo'
import { CONTRASENA, estaVacio } from '../../shared/utils/validacion'

const AppHeaderDropdown = () => {
  const { user, logout } = useAuth()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  // Errores junto al campo (`noValidate`): sin globo del navegador.
  const [erroresContrasena, setErroresContrasena] = useState<{ actual?: string; nueva?: string; confirmar?: string }>({})

  const handleLogout = () => {
    logout()
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)
    const faltas: typeof erroresContrasena = {}
    if (estaVacio(currentPassword)) faltas.actual = CONTRASENA.actualFalta
    if (estaVacio(newPassword)) faltas.nueva = CONTRASENA.nuevaFalta
    else if (newPassword.length < 8) faltas.nueva = CONTRASENA.corta
    if (estaVacio(confirmPassword)) faltas.confirmar = CONTRASENA.confirmarFalta
    else if (newPassword !== confirmPassword) faltas.confirmar = CONTRASENA.noCoinciden
    if (Object.keys(faltas).length > 0) {
      setErroresContrasena(faltas)
      return
    }
    setErroresContrasena({})
    try {
      await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordSuccess('Contraseña actualizada correctamente')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setShowPasswordModal(false), 1500)
    } catch (err: any) {
      setPasswordError(err.response?.data?.detail || 'Error al cambiar la contraseña')
    }
  }

  return (
    <>
      <CDropdown variant="nav-item" alignment="end">
        <CDropdownToggle className="py-0 d-flex align-items-center" caret={false} aria-label="Tu cuenta: cambiar contraseña o cerrar sesión">
          <div className="bg-secondary rounded-circle d-flex align-items-center justify-content-center text-white" style={{ width: '36px', height: '36px' }}>
            <CIcon icon={cilUser} />
          </div>
        </CDropdownToggle>
        <CDropdownMenu className="pt-0 p-3 text-center" style={{ minWidth: '280px', backgroundColor: '#ffffff', border: '1px solid rgba(0,0,0,0.125)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', backdropFilter: 'none' }}>
          <CDropdownHeader className="bg-transparent text-dark fw-bold border-0 pt-4 pb-0 mb-3 fs-6 text-center">
            Perfil de Usuario
          </CDropdownHeader>

          <div className="d-flex flex-column align-items-center mb-3">
            <div className="bg-secondary bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center mb-2" style={{ width: '64px', height: '64px' }}>
              <CIcon icon={cilUser} size="xxl" className="text-secondary" />
            </div>
            <div className="fw-bold">{user?.full_name || 'Usuario'}</div>
            <div className="text-muted small">{user?.email || 'email@example.com'}</div>
          </div>

          <CDropdownItem as="button" className="w-100 text-start d-flex justify-content-center" onClick={() => setShowPasswordModal(true)}>
            <CIcon icon={cilLockLocked} className="me-2" />
            Cambiar contraseña
          </CDropdownItem>

          <CDropdownItem as="button" className="w-100 text-start d-flex justify-content-center" onClick={handleLogout}>
            <CIcon icon={cilAccountLogout} className="me-2 text-danger" />
            Cerrar sesión
          </CDropdownItem>
        </CDropdownMenu>
      </CDropdown>

      {/* Change Password Modal */}
      <CModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} size="sm">
        <CModalHeader>
          <CModalTitle>Cambiar Contraseña</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {passwordError && <CAlert color="danger">{passwordError}</CAlert>}
          {passwordSuccess && <CAlert color="success">{passwordSuccess}</CAlert>}
          <CForm onSubmit={handleChangePassword} noValidate>
            <div className="mb-3">
              <CFormLabel>Contraseña Actual</CFormLabel>
              <CFormInput
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); if (erroresContrasena.actual) setErroresContrasena((p) => ({ ...p, actual: undefined })) }}
                required
                invalid={Boolean(erroresContrasena.actual)}
                aria-invalid={Boolean(erroresContrasena.actual) || undefined}
                aria-describedby={erroresContrasena.actual ? 'error-cuenta-actual' : undefined}
              />
              <ErrorDeCampo id="error-cuenta-actual" mensaje={erroresContrasena.actual} />
            </div>
            <CRow className="mb-3">
              <CCol xs={6}>
                <CFormLabel>Nueva</CFormLabel>
                <CFormInput
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (erroresContrasena.nueva) setErroresContrasena((p) => ({ ...p, nueva: undefined })) }}
                  required
                  invalid={Boolean(erroresContrasena.nueva)}
                  aria-invalid={Boolean(erroresContrasena.nueva) || undefined}
                  aria-describedby={erroresContrasena.nueva ? 'error-cuenta-nueva' : undefined}
                />
                <ErrorDeCampo id="error-cuenta-nueva" mensaje={erroresContrasena.nueva} />
              </CCol>
              <CCol xs={6}>
                <CFormLabel>Confirmar</CFormLabel>
                <CFormInput
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (erroresContrasena.confirmar) setErroresContrasena((p) => ({ ...p, confirmar: undefined })) }}
                  required
                  invalid={Boolean(erroresContrasena.confirmar)}
                  aria-invalid={Boolean(erroresContrasena.confirmar) || undefined}
                  aria-describedby={erroresContrasena.confirmar ? 'error-cuenta-confirmar' : undefined}
                />
                <ErrorDeCampo id="error-cuenta-confirmar" mensaje={erroresContrasena.confirmar} />
              </CCol>
            </CRow>
            <div className="d-grid">
              <CButton type="submit" color="primary">Cambiar Contraseña</CButton>
            </div>
          </CForm>
        </CModalBody>
      </CModal>
    </>
  )
}

export default AppHeaderDropdown
