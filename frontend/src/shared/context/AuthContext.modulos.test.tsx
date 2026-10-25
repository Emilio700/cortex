/**
 * base-modulos-extra: la sesión carga los módulos opcionales del consultorio.
 * Si la consulta falla, lo opcional queda oculto y la sesión sigue.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { Role, type User } from '../types'

vi.mock('../services/api', () => ({ setPermissionsVersionListener: () => {}, apiClient: {} }))
vi.mock('../services/auth', () => ({
  getStoredUser: () => mockStoredUser,
  isAuthenticated: () => mockStoredUser !== null,
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  setupMfa: vi.fn(),
  completeMfa: vi.fn(),
  logout: vi.fn(),
}))
const obtenerModulos = vi.fn()
vi.mock('../services/modulos', () => ({ obtenerModulos: () => obtenerModulos() }))

let mockStoredUser: User | null = null

const Consumidor = () => {
  const { modulosActivos, modulosCargados, tieneModulo } = useAuth()
  return (
    <div>
      <span data-testid="activos">{modulosActivos.join(',')}</span>
      <span data-testid="cargados">{String(modulosCargados)}</span>
      <span data-testid="tareas">{String(tieneModulo('tareas'))}</span>
    </div>
  )
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Consumidor />
    </AuthProvider>,
  )

describe('AuthContext · módulos opcionales', () => {
  beforeEach(() => {
    obtenerModulos.mockReset()
    mockStoredUser = { id: 3, role: Role.ADMIN, permissions: [] } as unknown as User
  })

  it('carga los módulos activos del consultorio al abrir la sesión', async () => {
    obtenerModulos.mockResolvedValue({ activos: ['tareas'], modulos: [] })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('cargados').textContent).toBe('true'))
    expect(screen.getByTestId('activos').textContent).toBe('tareas')
    expect(screen.getByTestId('tareas').textContent).toBe('true')
  })

  it('si la consulta falla, lo opcional queda apagado pero ya se puede decidir', async () => {
    obtenerModulos.mockRejectedValue(new Error('sin red'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('cargados').textContent).toBe('true'))
    expect(screen.getByTestId('activos').textContent).toBe('')
  })

  it('sin sesión no pregunta nada', () => {
    mockStoredUser = null
    renderProvider()
    expect(obtenerModulos).not.toHaveBeenCalled()
    expect(screen.getByTestId('cargados').textContent).toBe('false')
  })
})
