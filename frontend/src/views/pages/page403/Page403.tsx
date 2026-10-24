import { useNavigate } from 'react-router-dom'
import { CButton, CCol, CContainer, CRow } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilLockLocked } from '@coreui/icons'
import { useAuth } from '../../../shared/context/AuthContext'
import { rutaDeInicioPermitida } from '../../../shared/utils/inicio'

const Page403 = () => {
  const navigate = useNavigate()
  const { user, permissions } = useAuth()

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={6}>
            <div className="clearfix">
              <h1 className="float-start display-3 me-4">403</h1>
              <h4 className="pt-3">Acceso denegado</h4>
              <p className="text-body-secondary float-start">
                No tienes permisos para acceder a esta sección con tu rol actual.
              </p>
            </div>
            <CButton color="primary" onClick={() => navigate(rutaDeInicioPermitida(user?.role, permissions))}>
              <CIcon icon={cilLockLocked} className="me-2" />
              Volver al inicio
            </CButton>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default Page403
