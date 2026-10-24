/** Usuarios, Servicios y Salas: un fallo de carga no se ve como «no hay» (plan 29). */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchUsers = vi.hoisted(() => vi.fn())
const fetchServices = vi.hoisted(() => vi.fn())
const listSalas = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useAdminUsers', () => ({ useAdminUsers: () => ({ fetchUsers, createUser: vi.fn(), updateUser: vi.fn() }) }))
vi.mock('../hooks/useServices', () => ({
  useServices: () => ({ fetchServices, createService: vi.fn(), updateService: vi.fn(), deactivateService: vi.fn() }),
}))
vi.mock('../../../shared/services/salas', () => ({ listSalas, createSala: vi.fn(), updateSala: vi.fn(), setSalaStatus: vi.fn() }))
vi.mock('../../../shared/components/ToastProvider', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' }, can: () => true }) }))

import UsersPage from './UsersPage'
import ServicesPage from './ServicesPage'
import SalasPage from './SalasPage'

beforeEach(() => {
  fetchUsers.mockReset()
  fetchServices.mockReset()
  listSalas.mockReset()
})

describe.each([
  ['Usuarios', UsersPage, () => fetchUsers, /No hay usuarios/],
  ['Servicios', ServicesPage, () => fetchServices, /No hay servicios/],
  ['Salas', SalasPage, () => listSalas, /no hay salas/i],
])('%s', (_nombre, Pantalla, carga, vacio) => {
  it('si la lista no se pudo leer lo dice y deja reintentar; no dice que no hay', async () => {
    carga().mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue([])
    render(<Pantalla />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    expect(screen.queryByText(vacio)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(vacio)).toBeInTheDocument()
  })
})
