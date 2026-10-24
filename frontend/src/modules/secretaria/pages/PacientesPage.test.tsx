/**
 * Estado vacío con acción en Pacientes (U-03).
 *
 * Sin pacientes, la tabla ofrecía sólo un texto muerto; ahora ofrece «Nuevo
 * Paciente» ahí mismo, que abre el alta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { fetchPatients, createPatient, updatePatient, getPatient, apiGet, apiPost } = vi.hoisted(
  () => ({
    fetchPatients: vi.fn(),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    getPatient: vi.fn(),
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  }),
)

vi.mock('../hooks/usePatients', () => ({
  usePatients: () => ({ loading: false, fetchPatients, createPatient, updatePatient, getPatient }),
}))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'secretaria' }, can: () => true }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../shared/services/api', () => {
  const cliente = { get: apiGet, post: apiPost, put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { apiClient: cliente, default: cliente }
})

import PacientesPage from './PacientesPage'

beforeEach(() => {
  fetchPatients.mockReset().mockResolvedValue([])
  apiGet.mockReset().mockResolvedValue({ data: [] })
  apiPost.mockReset().mockResolvedValue({ data: { telefonos: [], candidatos: [] } })
})

describe('PacientesPage · estado vacío con acción', () => {
  it('sin pacientes ofrece «Nuevo Paciente» y abre el alta', async () => {
    const user = userEvent.setup()
    render(<PacientesPage />)

    const celda = (await screen.findByText('Aún no hay pacientes registrados.')).closest(
      'td',
    ) as HTMLElement
    const cta = within(celda).getByRole('button', { name: 'Nuevo Paciente' })

    await user.click(cta)

    // Se abre el formulario de alta (arranca en «Llenado express»).
    expect(await screen.findByText('Llenado express')).toBeInTheDocument()
  })

  it('cuando la búsqueda no encuentra nada no ofrece crear (no es una lista vacía)', async () => {
    const user = userEvent.setup()
    render(<PacientesPage />)

    await screen.findByText('Aún no hay pacientes registrados.')
    await user.type(screen.getByPlaceholderText(/Buscar/i), 'zzz')

    await waitFor(() => expect(screen.getByText('No se encontraron pacientes')).toBeInTheDocument())
    const celda = screen.getByText('No se encontraron pacientes').closest('td') as HTMLElement
    expect(within(celda).queryByRole('button')).toBeNull()
  })
})

describe('PacientesPage · si la lista no se pudo leer (plan 29, lote 6)', () => {
  it('no dice «Aún no hay pacientes» ni ofrece registrar: lo dice y deja reintentar', async () => {
    const user = userEvent.setup()
    fetchPatients.mockRejectedValue(new Error('sin red'))
    render(<PacientesPage />)

    expect(await screen.findByText(/No se pudo cargar la lista de pacientes/)).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay pacientes registrados.')).not.toBeInTheDocument()

    fetchPatients.mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Aún no hay pacientes registrados.')).toBeInTheDocument()
  })
})

describe('PacientesPage · una sola consulta al abrir (plan 29, lote 6)', () => {
  it('pide la lista una vez, no dos', async () => {
    render(<PacientesPage />)
    await screen.findByText('Aún no hay pacientes registrados.')
    await new Promise((r) => setTimeout(r, 400))
    expect(fetchPatients).toHaveBeenCalledTimes(1)
  })
})

describe('PacientesPage · fichas incompletas (plan 32, punto 5)', () => {
  it('marca con un punto discreto a la paciente sin fecha de nacimiento', async () => {
    fetchPatients.mockResolvedValue([
      { id: 1, first_name: 'ANA', last_name: 'EXPRES', date_of_birth: null, tenant_id: 1, is_active: true },
      { id: 2, first_name: 'BETY', last_name: 'COMPLETA', date_of_birth: '1990-01-01', tenant_id: 1, is_active: true },
    ])
    render(<PacientesPage />)

    await screen.findByText(/ANA EXPRES/)
    const avisos = screen.getAllByTitle('Ficha incompleta: falta fecha de nacimiento')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].closest('tr')).toHaveTextContent('ANA EXPRES')
  })

  it('el filtro pide al servidor sólo las incompletas, desde la primera página', async () => {
    const user = userEvent.setup()
    render(<PacientesPage />)
    await screen.findByText('Aún no hay pacientes registrados.')

    await user.click(screen.getByLabelText('Fichas incompletas'))

    await waitFor(() => expect(fetchPatients).toHaveBeenLastCalledWith(undefined, 0, 51, true))
    expect(await screen.findByText('Ninguna paciente tiene la ficha incompleta.')).toBeInTheDocument()
  })
})

describe('PacientesPage · directorio (plan 32, punto 6)', () => {
  it('cada fila tiene «Abrir expediente» y lo demás en «⋯», sin subir documentos', async () => {
    const user = userEvent.setup()
    fetchPatients.mockResolvedValue([
      { id: 41, first_name: 'ANA', last_name: 'LÓPEZ', date_of_birth: '1990-01-01', phone: '669 123 4567', tenant_id: 1, is_active: true },
    ])
    render(<PacientesPage />)
    const fila = (await screen.findByText(/ANA LÓPEZ/)).closest('tr') as HTMLElement
    expect(within(fila).getByText('41')).toBeInTheDocument()
    expect(within(fila).getByText('669 123 4567')).toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'Abrir expediente de ANA LÓPEZ' })).toBeInTheDocument()
    expect(within(fila).queryByTitle('Subir documentos')).toBeNull()
    await user.click(within(fila).getByRole('button', { name: 'Más acciones de ANA LÓPEZ' }))
    expect(screen.getByRole('button', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agendar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver sus citas' })).toBeInTheDocument()
  })
})
