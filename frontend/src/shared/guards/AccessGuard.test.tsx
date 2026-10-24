import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccessGuard } from './AccessGuard'
import { Role } from '../types'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const renderGuard = (props: { requires?: string[]; allowedRoles?: Role[]; alNegar?: 'redirigir' | 'pestana' }) =>
  render(
    <MemoryRouter initialEntries={['/protegida']}>
      <Routes>
        <Route
          path="/protegida"
          element={
            <AccessGuard {...props}>
              <div>CONTENIDO PROTEGIDO</div>
            </AccessGuard>
          }
        />
        <Route path="/403" element={<div>ACCESO DENEGADO</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('AccessGuard', () => {
  beforeEach(() => mockUseAuth.mockReset())

  it('deja pasar cuando la sesión tiene el permiso, sin mirar el rol', () => {
    // Es el cambio de fondo: conceder un permiso desde Master abre la ruta.
    mockUseAuth.mockReturnValue({
      user: { role: Role.DOCTOR },
      permissions: ['triage.create'],
      loading: false,
    })
    renderGuard({ requires: ['triage.create'], allowedRoles: [Role.SECRETARIA] })
    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument()
  })

  it('deja pasar por rol cuando el perfil todavía no trae permisos', () => {
    // Sesión iniciada antes del despliegue: el respaldo evita dejarla fuera.
    mockUseAuth.mockReturnValue({ user: { role: Role.DOCTOR }, permissions: [], loading: false })
    renderGuard({ requires: ['soap_notes.create'], allowedRoles: [Role.DOCTOR] })
    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument()
  })

  it('niega cuando no hay ni permiso ni rol', () => {
    mockUseAuth.mockReturnValue({
      user: { role: Role.SECRETARIA },
      permissions: ['patients.read'],
      loading: false,
    })
    renderGuard({ requires: ['soap_notes.create'], allowedRoles: [Role.DOCTOR] })
    expect(screen.getByText('ACCESO DENEGADO')).toBeInTheDocument()
  })

  it('dentro de una pestaña dice «Acceso denegado» en el lugar, sin redirigir (plan 29)', () => {
    // Las pestañas deshacían la redirección a /403 y la pestaña quedaba en blanco.
    mockUseAuth.mockReturnValue({ user: { role: Role.DOCTOR }, permissions: ['patients.read'], loading: false })
    renderGuard({ allowedRoles: [Role.ADMIN], alNegar: 'pestana' })
    expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado')
    expect(screen.getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument()
    expect(screen.queryByText('ACCESO DENEGADO')).toBeNull()
  })

  it('manda a login cuando no hay sesión', () => {
    mockUseAuth.mockReturnValue({ user: null, permissions: [], loading: false })
    renderGuard({ requires: ['patients.read'] })
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })

  it('espera a que hidrate el perfil antes de decidir', () => {
    // Redirigir a /403 mientras carga echaría a alguien que sí tiene acceso.
    mockUseAuth.mockReturnValue({ user: null, permissions: [], loading: true })
    renderGuard({ requires: ['patients.read'] })
    expect(screen.queryByText('ACCESO DENEGADO')).not.toBeInTheDocument()
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument()
  })

  it('sin restricción declarada, cualquier sesión autenticada pasa', () => {
    mockUseAuth.mockReturnValue({ user: { role: Role.DOCTOR }, permissions: [], loading: false })
    renderGuard({})
    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument()
  })
})
