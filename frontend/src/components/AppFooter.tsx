import { useState, useEffect } from 'react'
import { CFooter } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilMedicalCross } from '@coreui/icons'

import { useAuth } from '../shared/context/AuthContext'
import { formatearEnConsultorio } from '../shared/utils/date'
import { VERSION_CORTEX } from '../shared/version'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  doctor: 'Doctor',
  secretaria: 'Secretaría',
}

const AppFooter = () => {
  const { user } = useAuth()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const year = now.getFullYear()
  // En hora del consultorio aunque la computadora tenga otra zona (D-12).
  const dateStr = formatearEnConsultorio(now, { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = formatearEnConsultorio(now, { hour: '2-digit', minute: '2-digit' })

  // El pie es el landmark `contentinfo` (paso axe): CFooter renderiza un `div`
  // y sin el rol su contenido cuenta como «fuera de regiones».
  return (
    <CFooter role="contentinfo" className="px-4 small">
      <div className="d-flex align-items-center gap-2">
        <CIcon icon={cilMedicalCross} size="sm" className="text-primary" />
        <span className="fw-semibold" style={{ letterSpacing: '0.18em' }}>CORTEX</span>
        <span className="text-secondary">|</span>
        <span className="text-secondary">v{VERSION_CORTEX}</span>
        <span className="text-secondary d-none d-sm-inline">|</span>
        <span className="text-secondary d-none d-sm-inline">
          {dateStr} — {timeStr}
        </span>
      </div>
      <div className="d-flex align-items-center gap-2 ms-auto">
        {user && (
          <>
            <span className="text-secondary">
              {user.full_name || user.email}
            </span>
            <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill">
              {roleLabels[user.role] || user.role}
            </span>
          </>
        )}
        <span className="text-secondary d-none d-md-inline">|</span>
        <span className="text-secondary d-none d-md-inline">
          &copy; {year} CORTEX. Todos los derechos reservados.
        </span>
      </div>
    </CFooter>
  )
}

export default AppFooter
