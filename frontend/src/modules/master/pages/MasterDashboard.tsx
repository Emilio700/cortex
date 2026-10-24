import React, { useEffect, useState } from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CBadge,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
  CWidgetStatsF,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilShieldAlt,
  cilUser,
  cilPeople,
  cilStorage,
  cilCode,
  cilMedicalCross,
  cilLockLocked,
  cilCheckCircle,
} from '@coreui/icons'

import { useMasterStats } from '../hooks/useMasterStats'
import { MODULE_HIERARCHY } from '../components/moduleHierarchy'
import type { AvailablePermission } from '../../../shared/types'
import { apiClient, URL_DE_SALUD } from '../../../shared/services/api'
import { TablaResponsiva } from '../../../shared/components/TablaResponsiva'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { VERSION_CORTEX } from '../../../shared/version'

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

const MasterDashboard: React.FC = () => {
  const { totalUsers, usersByRole, loading, error: errorUsuarios } = useMasterStats()
  const [allPermissions, setAllPermissions] = useState<AvailablePermission[] | null>(null)
  const [healthStatus, setHealthStatus] = useState<string | null>(null)

  useEffect(() => {
    // Sin catálogo, el número es «—»: un 0 diría que no hay permisos.
    apiClient.get('/permissions/available').then(r => setAllPermissions(r.data)).catch(() => setAllPermissions(null))
    // `/health` está fuera de `/api/v1`: con apiClient daba 404 y siempre
    // decía «Fuera de línea».
    fetch(URL_DE_SALUD)
      .then((r) => setHealthStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setHealthStatus('offline'))
  }, [])

  if (loading) {
    return (
      <div className="pt-3 text-center">
        <CSpinner color="primary" variant="grow" />
      </div>
    )
  }

  const totalActions = MODULE_HIERARCHY.reduce(
    (sum, m) => sum + m.submodules.reduce((s, sub) => s + sub.actions.length, 0), 0
  )

  return (
    <>
      <EncabezadoPantalla
        titulo="Panel de Desarrollador"
        descripcion={`CORTEX v${VERSION_CORTEX} — Gestión del sistema, monitoreo de API y configuración global.`}
        icono={cilCode}
      />

      {/* ─── KPIs ─── */}
      <CRow className="mb-4">
        <CCol sm={6} xl={3}>
          <CWidgetStatsF
            className="border-start border-4 border-dark glass-card"
            color="dark"
            icon={<CIcon icon={cilShieldAlt} height={28} className="text-white" />}
            title="Rol actual"
            value="MASTER"
          />
        </CCol>
        <CCol sm={6} xl={3}>
          <CWidgetStatsF
            className="border-start border-4 border-success glass-card"
            color="success"
            icon={<CIcon icon={cilCheckCircle} height={28} className="text-white" />}
            title="Estado de la API"
            value={healthStatus === 'online' ? 'En línea' : healthStatus === 'offline' ? 'Fuera de línea' : 'Verificando...'}
          />
        </CCol>
        <CCol sm={6} xl={3}>
          <CWidgetStatsF
            className="border-start border-4 border-info glass-card"
            color="info"
            icon={<CIcon icon={cilPeople} height={28} className="text-white" />}
            title="Usuarios del sistema"
            value={errorUsuarios ? '—' : totalUsers}
          />
        </CCol>
        <CCol sm={6} xl={3}>
          <CWidgetStatsF
            className="border-start border-4 border-warning glass-card"
            color="warning"
            icon={<CIcon icon={cilLockLocked} height={28} className="text-white" />}
            title="Permisos disponibles"
            value={allPermissions ? allPermissions.length : '—'}
          />
        </CCol>
      </CRow>

      <CRow>
        {/* ─── Usuarios por rol ─── */}
        <CCol md={6}>
          <CCard className="glass-card mb-4">
            <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
              <CIcon icon={cilUser} />
              Usuarios por Rol
            </CCardHeader>
            <CCardBody>
              <CTable small hover responsive>
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Rol</CTableHeaderCell>
                    <CTableHeaderCell>Usuarios</CTableHeaderCell>
                    <CTableHeaderCell>Acceso</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {errorUsuarios && (
                    <CTableRow>
                      <CTableDataCell colSpan={3} className="text-center text-danger">
                        No se pudieron contar los usuarios.
                      </CTableDataCell>
                    </CTableRow>
                  )}
                  {Object.entries(usersByRole).map(([role, count]) => (
                    <CTableRow key={role}>
                      <CTableDataCell>
                        <CBadge color={roleColor[role] || 'secondary'} shape="rounded-pill">
                          {roleLabel[role] || role}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="fw-bold">{count}</CTableDataCell>
                      <CTableDataCell>
                        {role === 'master'
                          ? <CBadge color="dark">Total (bypass)</CBadge>
                          : <CBadge color="info">Por permisos</CBadge>
                        }
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </CCardBody>
          </CCard>

          {/* ─── Información de permisos ─── */}
          <CCard className="glass-card mb-4">
            <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
              <CIcon icon={cilShieldAlt} />
              Resumen de Permisos
            </CCardHeader>
            <CCardBody>
              <CRow className="g-3">
                <CCol sm={6}>
                  <div className="p-3 rounded-3 bg-primary bg-opacity-10 text-center">
                    <div className="fw-bold text-primary fs-4">{totalActions}</div>
                    <div className="small text-muted">Acciones en UI</div>
                  </div>
                </CCol>
                <CCol sm={6}>
                  <div className="p-3 rounded-3 bg-info bg-opacity-10 text-center">
                    <div className="fw-bold text-info fs-4">{allPermissions ? allPermissions.length : '—'}</div>
                    <div className="small text-muted">Permisos en API</div>
                  </div>
                </CCol>
                <CCol sm={6}>
                  <div className="p-3 rounded-3 bg-success bg-opacity-10 text-center">
                    <div className="fw-bold text-success fs-4">{MODULE_HIERARCHY.length}</div>
                    <div className="small text-muted">Módulos</div>
                  </div>
                </CCol>
                <CCol sm={6}>
                  <div className="p-3 rounded-3 bg-warning bg-opacity-10 text-center">
                    <div className="fw-bold text-warning fs-4">
                      {MODULE_HIERARCHY.reduce((s, m) => s + m.submodules.length, 0)}
                    </div>
                    <div className="small text-muted">Submódulos</div>
                  </div>
                </CCol>
              </CRow>
            </CCardBody>
          </CCard>
        </CCol>

        {/* ─── Módulos y jerarquía ─── */}
        <CCol md={6}>
          <CCard className="glass-card mb-4">
            <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
              <CIcon icon={cilMedicalCross} />
              Jerarquía de Módulos
            </CCardHeader>
            {/* Zona con desplazamiento propio: tabIndex y nombre para que se
                pueda recorrer con el teclado (axe, scrollable-region-focusable). */}
            <CCardBody style={{ maxHeight: '500px', overflowY: 'auto' }} tabIndex={0} role="region" aria-label="Jerarquía de módulos">
              {MODULE_HIERARCHY.map(mod => (
                <div key={mod.label} className="mb-3">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <CBadge color="dark" shape="rounded-pill">{mod.label}</CBadge>
                    <small className="text-muted">
                      {mod.submodules.length} submódulo(s)
                    </small>
                  </div>
                  <div className="d-flex flex-wrap gap-1 ms-3">
                    {mod.submodules.map(sub => (
                      <CBadge key={sub.label} color="secondary" shape="rounded-pill" className="small" style={{ fontWeight: 400 }}>
                        {sub.label}
                        {/* Sin opacity-75: sobre el gris de la insignia bajaba el
                            conteo a 3.3:1, por debajo de AA (axe, plan 32). */}
                        <span className="ms-1">({sub.actions.length})</span>
                      </CBadge>
                    ))}
                  </div>
                </div>
              ))}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* ─── Todos los permisos (tabla completa) ─── */}
      <CCard className="glass-card mb-4">
        <CCardHeader className="fw-semibold d-flex align-items-center gap-2">
          <CIcon icon={cilStorage} />
          Catálogo Completo de Permisos ({allPermissions ? allPermissions.length : "—"})
        </CCardHeader>
        {/* Zona con desplazamiento propio: tabIndex y nombre para que se
            pueda recorrer con el teclado (axe, scrollable-region-focusable). */}
        <CCardBody style={{ maxHeight: '400px', overflowY: 'auto' }} tabIndex={0} role="region" aria-label="Catálogo completo de permisos">
          <TablaResponsiva small hover responsive>
            <CTableHead className="sticky-top bg-white">
              <CTableRow>
                <CTableHeaderCell>Permiso</CTableHeaderCell>
                <CTableHeaderCell>Descripción</CTableHeaderCell>
                <CTableHeaderCell>Módulo</CTableHeaderCell>
                <CTableHeaderCell>Submódulo</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {(() => {
                // Build lookup
                const lookup = new Map<string, { module: string; submodule: string }>()
                for (const mod of MODULE_HIERARCHY) {
                  for (const sub of mod.submodules) {
                    for (const a of sub.actions) {
                      lookup.set(a, { module: mod.label, submodule: sub.label })
                    }
                  }
                }

                if (!allPermissions) {
                  return (
                    <CTableRow>
                      <CTableDataCell colSpan={4} className="text-center text-danger">No se pudo cargar el catálogo de permisos.</CTableDataCell>
                    </CTableRow>
                  )
                }
                return allPermissions.map(p => {
                  const loc = lookup.get(p.action)
                  return (
                    <CTableRow key={p.action}>
                      <CTableDataCell>
                        <code className="small">{p.action}</code>
                      </CTableDataCell>
                      <CTableDataCell className="small">{p.description}</CTableDataCell>
                      <CTableDataCell>
                        {loc && (
                          <CBadge color="dark" shape="rounded-pill" className="small">
                            {loc.module}
                          </CBadge>
                        )}
                      </CTableDataCell>
                      <CTableDataCell>
                        {loc && (
                          <span className="small text-muted">{loc.submodule}</span>
                        )}
                      </CTableDataCell>
                    </CTableRow>
                  )
                })
              })()}
            </CTableBody>
          </TablaResponsiva>
        </CCardBody>
      </CCard>
    </>
  )
}

export default MasterDashboard
