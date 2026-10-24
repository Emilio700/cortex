import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RoleGuard } from './RoleGuard'
import { Role } from '../types'

// Mock the auth context so we can drive the guard's inputs.
const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const renderGuard = (allowedRoles: Role[]) =>
  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RoleGuard allowedRoles={allowedRoles}>
              <div>CONTENIDO PROTEGIDO</div>
            </RoleGuard>
          }
        />
        <Route path="/403" element={<div>ACCESO DENEGADO</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('RoleGuard', () => {
  beforeEach(() => mockUseAuth.mockReset())

  it('renders children when the user role is allowed', () => {
    mockUseAuth.mockReturnValue({ user: { role: Role.DOCTOR }, loading: false })
    renderGuard([Role.DOCTOR, Role.ADMIN])
    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument()
  })

  it('redirects to /403 when the role is not allowed', () => {
    mockUseAuth.mockReturnValue({ user: { role: Role.SECRETARIA }, loading: false })
    renderGuard([Role.DOCTOR])
    expect(screen.getByText('ACCESO DENEGADO')).toBeInTheDocument()
    expect(screen.queryByText('CONTENIDO PROTEGIDO')).not.toBeInTheDocument()
  })

  it('redirects to /login when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderGuard([Role.DOCTOR])
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })

  it('waits (no redirect) while the session is still hydrating', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true })
    renderGuard([Role.DOCTOR])
    expect(screen.queryByText('ACCESO DENEGADO')).not.toBeInTheDocument()
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument()
    expect(screen.queryByText('CONTENIDO PROTEGIDO')).not.toBeInTheDocument()
  })
})
