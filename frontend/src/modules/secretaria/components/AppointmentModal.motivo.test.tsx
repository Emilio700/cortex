/**
 * Motivo extra de la cita: la nota opcional para el doctor.
 *
 * El consultorio lo pidió "como opcional... una nota para el doc extra del
 * tipo motivo extra". Lo que se comprueba aquí es justo lo que lo hace
 * opcional de verdad:
 *
 *  - sin tocarlo, la cita se guarda igual;
 *  - las sugerencias son atajos de un clic, y volver a pulsarlas las quitan;
 *  - debajo se puede escribir cualquier otra cosa, y se captura en MAYÚSCULAS;
 *  - al editar una cita que ya lo tiene, aparece relleno.
 *
 * Y lo que NO debe pasar: que aparezcan tipos de cita nuevos. Los del
 * sistema siguen siendo tres.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
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
// El modal avisa con un toast al guardar; aquí no se prueba el aviso.
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showToast: vi.fn() }),
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

const citaExistente = (extra: Partial<Appointment> = {}): Appointment => ({
  id: 55,
  patient_id: 3,
  doctor_id: 7,
  tenant_id: 2,
  scheduled_at: '2026-09-20T14:00:00',
  duration_minutes: 30,
  status: AppointmentStatus.AGENDADA,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  has_triage: false,
  patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ' },
  ...extra,
})

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
  await user.selectOptions(screen.getByLabelText(/Médico/), '7')
}

const guardar = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

describe('AppointmentModal · motivo extra', () => {
  it('se puede guardar la cita sin tocarlo: es opcional', async () => {
    const user = userEvent.setup()
    renderModal()
    await rellenarObligatorios(user)
    await guardar(user)

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0].motivo_extra).toBe('')
    // Y no hay ningún aviso pidiéndolo.
    expect(screen.queryByText(/Debe seleccionar el motivo/i)).not.toBeInTheDocument()
  })

  it('las sugerencias lo rellenan de un clic', async () => {
    const user = userEvent.setup()
    renderModal()
    await rellenarObligatorios(user)

    const atajo = screen.getByRole('button', { name: 'ULTRASONIDO' })
    expect(atajo).toHaveAttribute('aria-pressed', 'false')
    await user.click(atajo)

    expect(screen.getByLabelText(/^Motivo/)).toHaveValue('ULTRASONIDO')
    expect(atajo).toHaveAttribute('aria-pressed', 'true')
    expect(atajo).toHaveClass('gems-chip-activo')

    await guardar(user)
    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0]).toMatchObject({ motivo_extra: 'ULTRASONIDO' })
  })

  it('volver a pulsar la sugerencia elegida la quita', async () => {
    const user = userEvent.setup()
    renderModal()
    const atajo = screen.getByRole('button', { name: 'CONTROL' })

    await user.click(atajo)
    expect(screen.getByLabelText(/^Motivo/)).toHaveValue('CONTROL')
    await user.click(atajo)
    expect(screen.getByLabelText(/^Motivo/)).toHaveValue('')
  })

  it('admite texto libre y lo captura en MAYÚSCULAS', async () => {
    const user = userEvent.setup()
    renderModal()
    await rellenarObligatorios(user)

    await user.type(screen.getByLabelText(/^Motivo/), 'dolor pelvico')
    expect(screen.getByLabelText(/^Motivo/)).toHaveValue('DOLOR PELVICO')

    await guardar(user)
    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0]).toMatchObject({ motivo_extra: 'DOLOR PELVICO' })
  })

  it('al abrir una cita que ya lo tiene, aparece relleno y su atajo marcado', async () => {
    renderModal({ appointment: citaExistente({ motivo_extra: 'PRIMERA VEZ' }) })

    await waitFor(() => expect(screen.getByLabelText(/^Motivo/)).toHaveValue('PRIMERA VEZ'))
    expect(screen.getByRole('button', { name: 'PRIMERA VEZ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('no inventa tipos de cita: siguen siendo los tres del sistema', async () => {
    renderModal()
    const tipos = screen.getByLabelText(/Tipo de Cita/)
    expect([...tipos.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Consulta',
      'Cirugía',
      'Procedimiento',
    ])
  })
})
