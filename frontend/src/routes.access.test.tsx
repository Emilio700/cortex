/**
 * El menú y las rutas tienen que decidir con el mismo criterio.
 *
 * Caso real: a una doctora se le concedieron permisos desde Master, el menú le
 * mostró los ítems y al abrirlos la pantalla la echaba a /403, porque la ruta
 * sólo miraba el rol. Estas pruebas atan cada ítem del menú a su ruta.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import navigation from './_nav'
import { buildRouteEntries, matchRoutePath } from './shared/tabs/routeMatch'
import { AccessGuard } from './shared/guards/AccessGuard'
import { Role } from './shared/types'

vi.mock('./shared/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

let mockAuth: { user: { role: Role } | null; permissions: string[]; loading: boolean }

const entradas = buildRouteEntries()

describe('rutas por permiso', () => {
  it('cada ítem del menú que pide permiso lleva a una ruta que pide el mismo', () => {
    const conPermiso = navigation.filter((item) => item.to && item.requires)
    expect(conPermiso.length).toBeGreaterThan(0)

    for (const item of conPermiso) {
      const ruta = matchRoutePath(item.to!, entradas)
      expect(ruta, `sin ruta para ${item.to}`).toBeDefined()
      expect(ruta!.requires, `permisos distintos en ${item.to}`).toEqual(item.requires)
    }
  })

  it('una doctora con el permiso de triage concedido puede abrir Triage', () => {
    mockAuth = {
      user: { role: Role.DOCTOR },
      permissions: ['doctor.dashboard.read', 'triage.create'],
      loading: false,
    }
    const ruta = matchRoutePath('/secretaria/triage', entradas)!

    render(
      <MemoryRouter initialEntries={['/secretaria/triage']}>
        <Routes>
          <Route
            path="/secretaria/triage"
            element={
              <AccessGuard requires={ruta.requires} allowedRoles={ruta.roles}>
                <p>pantalla de triage</p>
              </AccessGuard>
            }
          />
          <Route path="/403" element={<p>sin acceso</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('pantalla de triage')).toBeInTheDocument()
  })

  it('sin el permiso, la doctora sigue sin poder abrir Triage', () => {
    mockAuth = {
      user: { role: Role.DOCTOR },
      permissions: ['doctor.dashboard.read'],
      loading: false,
    }
    const ruta = matchRoutePath('/secretaria/triage', entradas)!

    render(
      <MemoryRouter initialEntries={['/secretaria/triage']}>
        <Routes>
          <Route
            path="/secretaria/triage"
            element={
              <AccessGuard requires={ruta.requires} allowedRoles={ruta.roles}>
                <p>pantalla de triage</p>
              </AccessGuard>
            }
          />
          <Route path="/403" element={<p>sin acceso</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('sin acceso')).toBeInTheDocument()
  })

  /**
   * Plan 23: la doctora abre "Mis cobros" y su corte por permiso. Cambia a
   * propósito respecto de antes, cuando /finanzas era sólo de admin y
   * secretaria; sin el permiso sigue fuera.
   *
   * La secretaria entra SOLO con payments.cashcut concedido (por usuaria,
   * desde el formulario de administración). Sin él, ni el menú ni la ruta:
   * antes el respaldo por rol la dejaba abrir una pantalla que el servidor
   * respondía 403 (visto en el ambiente local el 2026-10-04).
   */
  const abrir = (path: string, permissions: string[], role: Role = Role.DOCTOR) => {
    mockAuth = { user: { role }, permissions, loading: false }
    const ruta = matchRoutePath(path, entradas)!
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path={path}
            element={
              <AccessGuard requires={ruta.requires} allowedRoles={ruta.roles}>
                <p>pantalla abierta</p>
              </AccessGuard>
            }
          />
          <Route path="/403" element={<p>sin acceso</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('la doctora con payments.read abre sus cobros', () => {
    abrir('/finanzas/pagos', ['doctor.dashboard.read', 'payments.read'])
    expect(screen.getByText('pantalla abierta')).toBeInTheDocument()
  })

  it('la doctora con payments.cashcut abre su corte de caja', () => {
    abrir('/finanzas', ['doctor.dashboard.read', 'payments.cashcut'])
    expect(screen.getByText('pantalla abierta')).toBeInTheDocument()
  })

  it('sin los permisos de pagos, la doctora no entra a finanzas por su rol', () => {
    abrir('/finanzas/pagos', ['doctor.dashboard.read'])
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
  })

  it('la secretaria sin payments.cashcut no entra al corte de caja', () => {
    // El permiso de pagos no basta: el corte es aparte (ADR-006) y se
    // concede por usuaria; sin él la pantalla no debe ni abrir.
    abrir('/finanzas', ['appointments.read', 'patients.read', 'payments.read'], Role.SECRETARIA)
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
  })

  it('la secretaria con payments.cashcut concedido abre el corte de caja', () => {
    abrir('/finanzas', ['payments.read', 'payments.cashcut'], Role.SECRETARIA)
    expect(screen.getByText('pantalla abierta')).toBeInTheDocument()
  })

  it('la administración conserva el respaldo por rol en el corte', () => {
    // Aunque su perfil no traiga permisos (sesión vieja), administración
    // entra: es el único respaldo por rol que queda en esta ruta a propósito.
    abrir('/finanzas', [], Role.ADMIN)
    expect(screen.getByText('pantalla abierta')).toBeInTheDocument()
  })

  it('la administración no entra a la agenda de la doctora', () => {
    // Revisión de flujos, 2026-10-04: abría por rol, pero el endpoint exige
    // doctor.appointments.read, que su perfil no trae; se niega limpio.
    abrir('/doctor/appointments', [], Role.ADMIN)
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
  })

  it('la administración no entra a la consulta médica', () => {
    abrir('/doctor/consultation/41', [], Role.ADMIN)
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
  })

  it('la administración conserva la bandeja de órdenes y resultados', () => {
    // Ésa sí la respalda su perfil: clinical_tracking.read es de su catálogo.
    abrir('/doctor/results', ['clinical_tracking.read'], Role.ADMIN)
    expect(screen.getByText('pantalla abierta')).toBeInTheDocument()
  })
})
