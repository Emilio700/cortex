/**
 * Botón «Cobrar» de la cita (S-03).
 *
 * Sale sólo en las citas que el mostrador cobra hoy (en sala o atendidas) y
 * sólo si la pantalla pasó `onCobrar`, que es como la agenda dice que quien
 * la usa tiene permiso de cobrar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
import { Role, type User } from '../../../shared/types'

const createAppointment = vi.fn()
const updateAppointment = vi.fn()
const changeStatus = vi.fn()
const fetchPatients = vi.fn()
const getTriageByAppointment = vi.fn()

const appointmentsApi = { createAppointment, updateAppointment, changeStatus }
const patientsApi = { fetchPatients }
const triageApi = { getTriageByAppointment }

vi.mock('../hooks/useAppointments', () => ({ useAppointments: () => appointmentsApi }))
vi.mock('../hooks/usePatients', () => ({ usePatients: () => patientsApi }))
vi.mock('../hooks/useTriage', () => ({ useTriage: () => triageApi }))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showToast: vi.fn() }),
}))
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

const cita = (extra: Partial<Appointment> = {}): Appointment => ({
  id: 55,
  patient_id: 3,
  doctor_id: 7,
  tenant_id: 2,
  scheduled_at: '2026-09-20T14:00:00',
  duration_minutes: 30,
  status: AppointmentStatus.EN_SALA,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  has_triage: true,
  patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ' },
  ...extra,
})

const renderModal = (appointment: Appointment, onCobrar?: (c: Appointment) => void) =>
  render(
    <AppointmentModal
      visible
      onClose={vi.fn()}
      onSaved={vi.fn()}
      doctors={DOCTORES}
      appointment={appointment}
      onCobrar={onCobrar}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 20, 15, 0))
  fetchPatients.mockResolvedValue([])
  getTriageByAppointment.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AppointmentModal · cobrar desde la cita', () => {
  it('en sala hoy: el botón abre el cobro de esa cita', async () => {
    const onCobrar = vi.fn()
    const user = userEvent.setup()
    renderModal(cita(), onCobrar)

    await user.click(screen.getByRole('button', { name: 'Cobrar' }))
    expect(onCobrar).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }))
  })

  it('atendida hoy también se cobra', () => {
    renderModal(cita({ status: AppointmentStatus.ATENDIDA }), vi.fn())
    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeInTheDocument()
  })

  it('sin permiso de cobrar (sin onCobrar) no hay botón', () => {
    renderModal(cita())
    expect(screen.queryByRole('button', { name: 'Cobrar' })).not.toBeInTheDocument()
  })

  it('una cita confirmada o de otro día no ofrece cobrar', () => {
    const { unmount } = renderModal(cita({ status: AppointmentStatus.CONFIRMADA }), vi.fn())
    expect(screen.queryByRole('button', { name: 'Cobrar' })).not.toBeInTheDocument()
    unmount()
    renderModal(cita({ scheduled_at: '2026-09-19T14:00:00' }), vi.fn())
    expect(screen.queryByRole('button', { name: 'Cobrar' })).not.toBeInTheDocument()
  })
})
