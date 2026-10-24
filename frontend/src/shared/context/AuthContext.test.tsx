/**
 * B8 — la sesión abierta se entera de que sus permisos cambiaron.
 *
 * Desde que el menú y los guards se gobiernan por permisos, otorgar uno desde
 * la pantalla de Master no se veía por ningún lado hasta cerrar sesión: la
 * pantalla decía que sí y el sistema, para esa sesión, seguía diciendo que no.
 *
 * Lo que NO se hace, y por eso está probado: cerrar la sesión. Un médico a
 * media nota perdería lo capturado porque alguien tocó un permiso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { Role, type User } from '../types'

// Se intercepta el registro del listener para poder disparar desde la prueba
// lo que en producción dispara la cabecera X-Permissions-Version.
let listener: ((version: number) => void) | null = null
vi.mock('../services/api', () => ({
  setPermissionsVersionListener: (cb: ((version: number) => void) | null) => {
    listener = cb
  },
  apiClient: {},
}))

const mockGetCurrentUser = vi.fn()
const mockLogout = vi.fn()
vi.mock('../services/auth', () => ({
  getStoredUser: () => mockStoredUser,
  isAuthenticated: () => true,
  getCurrentUser: () => mockGetCurrentUser(),
  login: vi.fn(),
  setupMfa: vi.fn(),
  completeMfa: vi.fn(),
  logout: () => mockLogout(),
}))

let mockStoredUser: User | null = null

const perfil = (version: number, permissions: string[]): User =>
  ({
    id: 7,
    email: 'doctora@gems.com',
    full_name: 'Médico',
    role: Role.DOCTOR,
    tenant_id: 1,
    is_active: true,
    created_at: '2026-09-24T00:00:00Z',
    permissions,
    permissions_version: version,
  }) as User

const Consumidora = () => {
  const { permissions } = useAuth()
  return <div data-testid="permisos">{permissions.join(',')}</div>
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Consumidora />
    </AuthProvider>,
  )

describe('AuthContext · permisos que cambian con la sesión abierta', () => {
  beforeEach(() => {
    listener = null
    mockGetCurrentUser.mockReset()
    mockLogout.mockReset()
    mockStoredUser = perfil(1, ['soap_notes.create'])
  })

  it('recarga el perfil cuando el servidor anuncia una versión distinta', async () => {
    mockGetCurrentUser.mockResolvedValue(perfil(2, ['soap_notes.create', 'payments.create']))
    renderProvider()

    expect(screen.getByTestId('permisos').textContent).toBe('soap_notes.create')

    listener?.(2)

    await waitFor(() =>
      expect(screen.getByTestId('permisos').textContent).toBe(
        'soap_notes.create,payments.create',
      ),
    )
  })

  it('no recarga nada si la versión que anuncia el servidor es la misma', async () => {
    mockGetCurrentUser.mockResolvedValue(perfil(1, []))
    renderProvider()

    listener?.(1)

    await waitFor(() => expect(mockGetCurrentUser).not.toHaveBeenCalled())
    expect(screen.getByTestId('permisos').textContent).toBe('soap_notes.create')
  })

  it('un cambio de permisos no cierra la sesión de nadie', async () => {
    // El riesgo que esta prueba vigila es concreto: sacar a un médico de su
    // sesión a media nota costaría lo capturado.
    mockGetCurrentUser.mockResolvedValue(perfil(3, []))
    renderProvider()

    listener?.(3)

    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalled())
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('varias respuestas seguidas con la versión nueva recargan el perfil una sola vez', async () => {
    mockGetCurrentUser.mockResolvedValue(perfil(2, ['payments.create']))
    renderProvider()

    listener?.(2)
    listener?.(2)
    listener?.(2)

    await waitFor(() => expect(screen.getByTestId('permisos').textContent).toBe('payments.create'))
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1)
  })
})
