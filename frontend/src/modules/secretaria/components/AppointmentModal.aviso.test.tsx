/**
 * Aviso al guardar una cita.
 *
 * Antes el guardado era silencioso: el modal se cerraba y nada decía si la
 * cita quedó ni para cuándo. El aviso sale sólo con la respuesta del servidor;
 * si el servidor rechaza, no hay aviso de éxito (regla del plan 22).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { Role, type User } from '../../../shared/types'

const createAppointment = vi.fn()
const updateAppointment = vi.fn()
const changeStatus = vi.fn()
const listSalas = vi.fn()
const fetchPatients = vi.fn()
const getTriageByAppointment = vi.fn()

const appointmentsApi = { createAppointment, updateAppointment, changeStatus }
const patientsApi = { fetchPatients }
const triageApi = { getTriageByAppointment }

vi.mock('../hooks/useAppointments', () => ({ useAppointments: () => appointmentsApi }))
vi.mock('../hooks/usePatients', () => ({ usePatients: () => patientsApi }))
vi.mock('../hooks/useTriage', () => ({ useTriage: () => triageApi }))
const showSuccess = vi.fn()
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess, showError: vi.fn(), showToast: vi.fn() }),
}))
vi.mock('../../../shared/services/salas', () => ({
  listSalas: (...args: unknown[]) => listSalas(...args),
}))
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

const PACIENTE = {
  id: 3,
  tenant_id: 2,
  first_name: 'ANA',
  last_name: 'LÓPEZ',
  date_of_birth: '1990-01-01',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

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

const renderModal = (props: Partial<React.ComponentProps<typeof AppointmentModal>> = {}) =>
  render(
    <AppointmentModal
      visible
      onClose={vi.fn()}
      onSaved={vi.fn()}
      doctors={DOCTORES}
      defaultDate={new Date(2026, 8, 20, 10, 0)}
      {...props}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  createAppointment.mockResolvedValue({})
  updateAppointment.mockResolvedValue({})
  fetchPatients.mockResolvedValue([PACIENTE])
  getTriageByAppointment.mockResolvedValue(null)
  listSalas.mockResolvedValue([])
})

const rellenarObligatorios = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText(/Paciente/))
  await user.click(await screen.findByText('ANA LÓPEZ'))
  await user.selectOptions(screen.getByLabelText(/Doctor/), '7')
}

const guardar = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

describe('AppointmentModal · aviso al guardar', () => {
  it('con la cita creada avisa la fecha y hora que devolvió el servidor', async () => {
    createAppointment.mockResolvedValue({ id: 90, scheduled_at: '2026-09-30T10:00:00' })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderModal({ onSaved })
    await rellenarObligatorios(user)
    await guardar(user)

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith('Cita guardada para el miércoles 30 de septiembre a las 10:00.'),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('si el servidor la rechaza no hay aviso de éxito y se ve el motivo', async () => {
    createAppointment.mockRejectedValue(new Error('El doctor ya tiene una cita en ese horario'))
    const user = userEvent.setup()
    renderModal()
    await rellenarObligatorios(user)
    await guardar(user)

    expect(await screen.findByText('El doctor ya tiene una cita en ese horario')).toBeInTheDocument()
    expect(showSuccess).not.toHaveBeenCalled()
  })
})

describe('AppointmentModal · errores junto al campo', () => {
  it('sin paciente ni doctora los avisos salen junto a cada campo y no se llama al servidor', async () => {
    const user = userEvent.setup()
    renderModal()
    await guardar(user)

    expect(await screen.findByText('Elige a la paciente.')).toBeInTheDocument()
    expect(screen.getByText('Elige a la doctora.')).toBeInTheDocument()
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('el aviso se quita al corregir el campo', async () => {
    const user = userEvent.setup()
    renderModal()
    await guardar(user)
    expect(await screen.findByText('Elige a la doctora.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/Doctor/), '7')

    expect(screen.queryByText('Elige a la doctora.')).not.toBeInTheDocument()
    expect(screen.getByText('Elige a la paciente.')).toBeInTheDocument()
  })
})
