/**
 * Lo que se comprueba aquí es la parte de la cita que puede hacer daño:
 * que la sala sea obligatoria donde toca, que no se pregunte donde sobra, y
 * sobre todo que al actualizar NO se mande `room_id` si no cambió — mandarlo
 * en null le borra la sala a la cita en el backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
import type { Sala } from '../../../shared/services/salas'
import { Role, type User } from '../../../shared/types'

const createAppointment = vi.fn()
const updateAppointment = vi.fn()
const changeStatus = vi.fn()
const listSalas = vi.fn()
const fetchPatients = vi.fn()
const getTriageByAppointment = vi.fn()

// Los hooks devuelven SIEMPRE el mismo objeto: si cambiaran de identidad en
// cada render, los efectos del modal se reengancharían sin parar.
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
// La disponibilidad tiene sus propias pruebas; aqui solo tiene que no estorbar.
vi.mock('../../../shared/services/disponibilidad', () => ({
  getDisponibilidad: () => Promise.resolve(DISPONIBILIDAD_VACIA),
}))

const DISPONIBILIDAD_VACIA = {
  doctor_id: 7,
  fecha: '2026-09-20',
  duration_minutes: 30,
  step_minutes: 30,
  room_id: null,
  jornada_por_defecto: false,
  franjas: [],
  dias: [],
}

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

const sala = (id: number, name: string, display_order = id): Sala => ({
  id,
  tenant_id: 2,
  name,
  is_active: true,
  display_order,
})

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
  listSalas.mockResolvedValue([sala(1, 'Sala 1'), sala(2, 'Sala 2')])
})

/** Rellena paciente y doctor, que son lo obligatorio de siempre. */
const rellenarObligatorios = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText(/Paciente/))
  await user.click(await screen.findByText('ANA LÓPEZ'))
  await user.selectOptions(screen.getByLabelText(/Doctor/), '7')
}

describe('AppointmentModal · sala', () => {
  it('ofrece el selector de sala cuando la sucursal tiene varias', async () => {
    renderModal()
    expect(await screen.findByLabelText(/^Sala/)).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Sala 2' })).toBeInTheDocument()
  })

  it('donde sólo hay una sala no pregunta nada y la deja indicada', async () => {
    listSalas.mockResolvedValue([sala(9, 'Consultorio', 1)])
    renderModal()
    expect(await screen.findByText('Consultorio')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^Sala/ })).not.toBeInTheDocument()
  })

  it('manda la única sala al crear, sin que el usuario la elija', async () => {
    const user = userEvent.setup()
    listSalas.mockResolvedValue([sala(9, 'Consultorio', 1)])
    renderModal()
    await screen.findByText('Consultorio')

    await rellenarObligatorios(user)
    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0]).toMatchObject({ room_id: 9 })
  })

  it('no deja crear sin sala donde hay más de una', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByLabelText(/^Sala/)

    await rellenarObligatorios(user)
    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    expect(await screen.findByText(/Elige la sala donde será la cita/)).toBeInTheDocument()
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('al reagendar sin tocar la sala NO manda room_id (mandarlo la borraría)', async () => {
    const user = userEvent.setup()
    renderModal({ appointment: citaExistente({ room_id: 1, room_name: 'Sala 1' }) })
    await screen.findByLabelText(/^Sala/)

    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    const [id, payload] = updateAppointment.mock.calls[0]
    expect(id).toBe(55)
    expect('room_id' in payload).toBe(false)
  })

  it('al reagendar cambiando de sala sí manda la nueva', async () => {
    const user = userEvent.setup()
    renderModal({ appointment: citaExistente({ room_id: 1, room_name: 'Sala 1' }) })
    await screen.findByLabelText(/^Sala/)

    await user.selectOptions(screen.getByLabelText(/^Sala/), '2')
    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect(updateAppointment.mock.calls[0][1]).toMatchObject({ room_id: 2 })
  })

  it('no obliga a inventarle sala a una cita anterior a las salas', async () => {
    const user = userEvent.setup()
    renderModal({ appointment: citaExistente({ room_id: null, room_name: null }) })
    await screen.findByLabelText(/^Sala/)
    expect(screen.getByText(/Esta cita se agendó antes de que hubiera salas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    await waitFor(() => expect(updateAppointment).toHaveBeenCalled())
    expect('room_id' in updateAppointment.mock.calls[0][1]).toBe(false)
  })

  it('preselecciona la sala del hueco que se pinchó en la vista por salas', async () => {
    const user = userEvent.setup()
    renderModal({ defaultRoomId: 2 })
    await screen.findByLabelText(/^Sala/)

    await rellenarObligatorios(user)
    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect(createAppointment.mock.calls[0][0]).toMatchObject({ room_id: 2 })
  })

  it('si no se pueden cargar las salas, no bloquea el agendado', async () => {
    const user = userEvent.setup()
    listSalas.mockRejectedValue(new Error('sin red'))
    renderModal()

    await rellenarObligatorios(user)
    await user.click(screen.getByRole('button', { name: /^Guardar (cita|cambios)$/ }))

    await waitFor(() => expect(createAppointment).toHaveBeenCalled())
    expect('room_id' in createAppointment.mock.calls[0][0]).toBe(false)
  })
})

// ── Plegado de fecha y hora ────────────────────────────────────────────
// El modal no se desmonta entre aperturas: si el plegado no se reinicia,
// abrir una cita existente despues de crear una nueva mostraba el
// calendario desplegado robando media pantalla.

describe('AppointmentModal · plegado de fecha y hora', () => {
    it('al editar una cita ya agendada no despliega el calendario', async () => {
        renderModal({ appointment: citaExistente() })
        expect(
            await screen.findByRole('button', { name: /reagendar/i }),
        ).toBeInTheDocument()
        expect(screen.queryByText(/Selecciona la fecha/i)).not.toBeInTheDocument()
    })

    it('al pulsar Reagendar aparece el calendario', async () => {
        const user = userEvent.setup()
        renderModal({ appointment: citaExistente() })
        await user.click(await screen.findByRole('button', { name: /reagendar/i }))
        expect(await screen.findByText(/Selecciona la fecha/i)).toBeInTheDocument()
    })

    it('una cita nueva si abre con el calendario desplegado', async () => {
        renderModal({ appointment: undefined })
        expect(await screen.findByText(/Selecciona la fecha/i)).toBeInTheDocument()
    })
})
