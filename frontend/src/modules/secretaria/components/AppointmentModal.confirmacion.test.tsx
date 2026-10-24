/**
 * Reenviar la confirmación de una cita por correo (S-05).
 *
 * Lo que no puede pasar: decir «se reenvió» cuando el servidor no lo envió (la
 * paciente sin correo, o un fallo de envío). Sólo con `enviado: true` se afirma.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { Role, type User } from '../../../shared/types'

const createAppointment = vi.fn()
const updateAppointment = vi.fn()
const changeStatus = vi.fn()
const reenviarConfirmacion = vi.fn()
const listSalas = vi.fn()
const fetchPatients = vi.fn()
const getTriageByAppointment = vi.fn()

const appointmentsApi = { createAppointment, updateAppointment, changeStatus, reenviarConfirmacion }

vi.mock('../hooks/useAppointments', () => ({ useAppointments: () => appointmentsApi }))
vi.mock('../hooks/usePatients', () => ({ usePatients: () => ({ fetchPatients }) }))
vi.mock('../hooks/useTriage', () => ({ useTriage: () => ({ getTriageByAppointment }) }))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showToast: vi.fn() }),
}))
vi.mock('../../../shared/services/salas', () => ({ listSalas: (...a: unknown[]) => listSalas(...a) }))
vi.mock('../../../shared/services/disponibilidad', () => ({
  getDisponibilidad: () =>
    Promise.resolve({ doctor_id: 7, fecha: '2026-09-20', duration_minutes: 30, step_minutes: 30, room_id: null, jornada_por_defecto: false, franjas: [], dias: [] }),
}))

const DOCTORES: User[] = [
  { id: 7, email: 'doc@gems.mx', full_name: 'Pérez', role: Role.DOCTOR, tenant_id: 2, is_active: true, created_at: '2026-01-01T00:00:00Z' },
]

const CITA: any = {
  id: 55,
  patient_id: 3,
  doctor_id: 7,
  tenant_id: 2,
  scheduled_at: '2026-09-30T10:00:00',
  duration_minutes: 30,
  status: 'confirmada',
  has_triage: false,
  created_at: '2026-09-20T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
  patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ', phone: '6690000000' },
  doctor: { id: 7, full_name: 'Pérez', email: 'doc@gems.mx' },
}

const renderModal = () =>
  render(
    <AppointmentModal visible onClose={vi.fn()} onSaved={vi.fn()} doctors={DOCTORES} appointment={CITA} />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchPatients.mockResolvedValue([])
  getTriageByAppointment.mockResolvedValue(null)
  listSalas.mockResolvedValue([])
})

describe('AppointmentModal · reenviar confirmación (S-05)', () => {
  it('con envío confirmado dice a quién se reenvió', async () => {
    reenviarConfirmacion.mockResolvedValue({ enviado: true, motivo: null, destinatario: 'a***@correo.com' })
    const user = userEvent.setup()
    renderModal()

    await user.click(await screen.findByRole('button', { name: 'Reenviar confirmación' }))

    await waitFor(() => expect(reenviarConfirmacion).toHaveBeenCalledWith(55))
    expect(await screen.findByText('Se reenvió la confirmación a a***@correo.com.')).toBeInTheDocument()
  })

  it('si el paciente no tiene correo, lo dice y no finge que se envió', async () => {
    reenviarConfirmacion.mockResolvedValue({ enviado: false, motivo: 'sin_email', destinatario: null })
    const user = userEvent.setup()
    renderModal()

    await user.click(await screen.findByRole('button', { name: 'Reenviar confirmación' }))

    expect(await screen.findByText(/no tiene correo capturado/)).toBeInTheDocument()
    expect(screen.queryByText(/Se reenvió la confirmación/)).toBeNull()
  })

  it('si el envío falla, lo dice y no afirma que se reenvió', async () => {
    reenviarConfirmacion.mockResolvedValue({ enviado: false, motivo: 'fallo_envio', destinatario: 'a***@correo.com' })
    const user = userEvent.setup()
    renderModal()

    await user.click(await screen.findByRole('button', { name: 'Reenviar confirmación' }))

    expect(await screen.findByText(/No se pudo reenviar la confirmación/)).toBeInTheDocument()
    expect(screen.queryByText(/Se reenvió la confirmación/)).toBeNull()
  })
})
