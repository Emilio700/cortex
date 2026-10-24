/**
 * Alta de paciente desde la cita (S-02).
 *
 * Con una llamada en curso la secretaria no puede salir a Pacientes y volver:
 * perdía lo capturado de la cita. Aquí se comprueba que el alta se hace con el
 * mismo formulario y el mismo endpoint, que la nueva queda elegida sólo si el
 * servidor la creó, y que cancelar el alta no borra nada de la cita.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

/** El modal del alta, para no confundir sus campos con los de la cita. */
const modalDeAlta = () => within(screen.getByText('Nuevo paciente').closest('.modal') as HTMLElement)

const llenarAlta = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '+ Registrar paciente nuevo' }))
  const alta = modalDeAlta()
  await user.type(alta.getByLabelText(/Nombre/), 'ana')
  await user.type(alta.getByLabelText(/Apellidos/), 'lópez')
  await user.type(alta.getByLabelText(/Celular/), '5512345678')
  await user.click(alta.getByRole('button', { name: 'Guardar' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchPatients.mockResolvedValue([])
  createAppointment.mockResolvedValue({ id: 90, scheduled_at: '2026-09-20T10:00:00' })
})

describe('AppointmentModal · alta de paciente desde la cita', () => {
  it('el paciente creado queda elegido y la cita se guarda con ella, sin perder lo capturado', async () => {
    createPatient.mockResolvedValue({ id: 41, first_name: 'ANA', last_name: 'LÓPEZ', phone: '5512345678' })
    const user = userEvent.setup()
    renderModal()
    // Algo capturado de la cita antes del alta.
    await user.selectOptions(screen.getByLabelText(/Médico/), '7')

    await llenarAlta(user)

    await waitFor(() => expect(screen.queryByText('Nuevo paciente')).not.toBeInTheDocument())
    expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'ANA', last_name: 'LÓPEZ' }))
    expect(showSuccess).toHaveBeenCalledWith('Paciente ANA LÓPEZ registrada y elegida para esta cita.')
    expect(screen.getByLabelText(/Médico/)).toHaveValue('7')
    // Guardar el alta no guarda la cita: sólo el botón de la cita lo hace.
    expect(createAppointment).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Guardar cita' }))
    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0]).toEqual(expect.objectContaining({ patient_id: 41, doctor_id: 7 }))
  })

  it('si el servidor rechaza el alta, el formulario sigue abierto con el motivo y no se elige a nadie', async () => {
    createPatient.mockRejectedValue(new Error('Ya existe un paciente con ese celular.'))
    const user = userEvent.setup()
    renderModal()

    await llenarAlta(user)

    expect(await modalDeAlta().findByText('Ya existe un paciente con ese celular.')).toBeInTheDocument()
    expect(showSuccess).not.toHaveBeenCalled()
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('cancelar el alta no borra lo capturado de la cita', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.selectOptions(screen.getByLabelText(/Médico/), '7')

    await user.click(screen.getByRole('button', { name: '+ Registrar paciente nuevo' }))
    await user.click(modalDeAlta().getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByText('Nuevo paciente')).not.toBeInTheDocument())
    expect(screen.getByLabelText(/Médico/)).toHaveValue('7')
    expect(createPatient).not.toHaveBeenCalled()
  })

  it('sin permiso de alta de pacientes no se ofrece registrar', () => {
    renderModal(false)
    expect(screen.queryByRole('button', { name: '+ Registrar paciente nuevo' })).not.toBeInTheDocument()
  })
})

describe('AppointmentModal · el médico sin recepción (plan 32, punto 5)', () => {
  const OTRA: User = { ...DOCTORES[0], id: 8, email: 'otra@gems.mx', full_name: 'Otra' }

  it('da de alta con correo y motivo, y la cita nace en su propia agenda', async () => {
    createPatient.mockResolvedValue({ id: 52, first_name: 'ANA', last_name: 'LÓPEZ', phone: '5512345678' })
    const user = userEvent.setup()
    render(
      <AppointmentModal
        visible
        onClose={vi.fn()}
        onSaved={vi.fn()}
        doctors={[...DOCTORES, OTRA]}
        defaultDate={new Date(2026, 8, 20, 10, 0)}
        puedeRegistrarPaciente
        doctoraPropiaId={7}
      />,
    )

    // Sólo se ofrece ella, ya elegida: la agenda de una colega daría error al guardar.
    const select = screen.getByLabelText(/Médico/)
    expect(select).toHaveValue('7')
    expect(within(select).queryByRole('option', { name: /Otra/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: '+ Registrar paciente nuevo' }))
    const alta = modalDeAlta()
    await user.type(alta.getByLabelText(/Nombre/), 'ana')
    await user.type(alta.getByLabelText(/Apellidos/), 'lópez')
    await user.type(alta.getByLabelText(/Celular/), '5512345678')
    await user.type(alta.getByLabelText('Correo (opcional)'), 'ana@example.com')
    await user.click(alta.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByText('Nuevo paciente')).not.toBeInTheDocument())
    expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }))

    await user.type(screen.getByLabelText('Motivo (opcional)'), 'primera vez')
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }))
    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0]).toEqual(
      expect.objectContaining({ patient_id: 52, doctor_id: 7, motivo_extra: 'PRIMERA VEZ' }),
    )
  })

  it('sin el permiso de alta no se le ofrece registrar paciente', () => {
    renderModal(false)
    expect(screen.queryByRole('button', { name: '+ Registrar paciente nuevo' })).toBeNull()
  })
})
