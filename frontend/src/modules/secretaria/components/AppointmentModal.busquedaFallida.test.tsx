/**
 * Si la búsqueda de pacientes falla, la lista vacía no puede leerse como «no
 * existe»: recepción la registraría dos veces (plan 29, T-1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { Role, type User } from '../../../shared/types'

const createAppointment = vi.fn()
const updateAppointment = vi.fn()
const changeStatus = vi.fn()
const fetchPatients = vi.fn()
const createPatient = vi.fn()
const getTriageByAppointment = vi.fn()
const showSuccess = vi.fn()

const appointmentsApi = { createAppointment, updateAppointment, changeStatus }
const patientsApi = { fetchPatients, createPatient }
const triageApi = { getTriageByAppointment }

vi.mock('../hooks/useAppointments', () => ({ useAppointments: () => appointmentsApi }))
vi.mock('../hooks/usePatients', () => ({ usePatients: () => patientsApi }))
vi.mock('../hooks/useTriage', () => ({ useTriage: () => triageApi }))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess, showError: vi.fn(), showToast: vi.fn() }),
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'secretaria' } }),
}))
// El formulario de alta pide el directorio de doctoras; aquí no importa.
vi.mock('../../../shared/services/api', () => {
  const cliente = { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn() }
  return { apiClient: cliente, default: cliente }
})
vi.mock('../../../shared/services/salas', () => ({ listSalas: () => Promise.resolve([]) }))
vi.mock('../../../shared/services/disponibilidad', () => ({
  getDisponibilidad: () =>
    Promise.resolve({
      doctor_id: 7,
      fecha: '2026-09-20',
      duration_minutes: 30,
      step_minutes: 30,
      room_id: null,
      jornada_por_defecto: false,
      franjas: [],
      dias: [],
    }),
}))

const DOCTORES: User[] = [
  {
    id: 7,
    email: 'doc@gems.mx',
    full_name: 'Pérez',
    role: Role.DOCTOR,
    tenant_id: 2,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
]

const renderModal = (puede = true) =>
  render(
    <AppointmentModal
      visible
      onClose={vi.fn()}
      onSaved={vi.fn()}
      doctors={DOCTORES}
      defaultDate={new Date(2026, 8, 20, 10, 0)}
      puedeRegistrarPaciente={puede}
    />,
  )

describe('AppointmentModal · búsqueda de pacientes que falla', () => {
  beforeEach(() => {
    fetchPatients.mockReset()
  })

  it('dice que no se pudo buscar y que no la registren de nuevo; «Reintentar» vuelve a buscar', async () => {
    const user = userEvent.setup()
    fetchPatients.mockRejectedValue(new Error('sin red'))
    renderModal()

    await user.type(document.getElementById('patient_search') as HTMLElement, 'lopez')

    expect(await screen.findByText(/No se pudo buscar/)).toHaveTextContent('no la registres de nuevo')
    expect(screen.queryByText(/Sin resultados/)).not.toBeInTheDocument()

    fetchPatients.mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/Sin resultados/)).toBeInTheDocument()
  })
})
