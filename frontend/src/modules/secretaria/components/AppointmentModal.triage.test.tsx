/**
 * Lectura de signos vitales dentro de la cita.
 *
 * Desde que el servidor exige relación asistencial para leer el triage, una
 * doctora ajena al paciente recibe 403. El modal convertía cualquier error
 * en «Pendiente» y ofrecía «Registrar Triage»: afirmaba que no había signos
 * cuando sólo no pudo leerlos. Aquí se comprueba que cada caso diga lo suyo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
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

const CITA: Appointment = {
  id: 55,
  patient_id: 3,
  doctor_id: 7,
  tenant_id: 2,
  scheduled_at: '2026-09-20T14:00:00',
  duration_minutes: 30,
  status: AppointmentStatus.CONFIRMADA,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  has_triage: false,
  patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ' },
}

const renderModal = () =>
  render(<AppointmentModal visible onClose={vi.fn()} onSaved={vi.fn()} doctors={DOCTORES} appointment={CITA} />)

const falloCon = (status?: number) => Object.assign(new Error('fallo'), { status })

beforeEach(() => {
  vi.clearAllMocks()
  fetchPatients.mockResolvedValue([])
})

describe('AppointmentModal · lectura del triage', () => {
  it('sin signos registrados (null) dice «Pendiente» y ofrece registrarlos', async () => {
    getTriageByAppointment.mockResolvedValue(null)
    renderModal()

    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar Triage' })).toBeInTheDocument()
  })

  it('con 403 avisa que no tienes acceso, no dice «Pendiente» ni ofrece registrar', async () => {
    getTriageByAppointment.mockRejectedValue(falloCon(403))
    renderModal()

    expect(await screen.findByText('No tienes acceso a los signos vitales de este paciente.')).toBeInTheDocument()
    expect(screen.getByText('Sin acceso')).toBeInTheDocument()
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar Triage' })).not.toBeInTheDocument()
    // Reintentar no cambia un permiso: no se ofrece.
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('con otro error dice que no se pudo cargar y permite reintentar', async () => {
    getTriageByAppointment.mockRejectedValueOnce(falloCon(500)).mockResolvedValueOnce(null)
    const user = userEvent.setup()
    renderModal()

    expect(await screen.findByText(/No se pudieron cargar los signos vitales/)).toBeInTheDocument()
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar Triage' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(screen.getByText('Pendiente')).toBeInTheDocument())
    expect(getTriageByAppointment).toHaveBeenCalledTimes(2)
  })

  it('mientras la lectura está en vuelo dice «Consultando triage…», no «(Requiere triage)»', async () => {
    let resolver: ((valor: unknown) => void) | undefined
    getTriageByAppointment.mockImplementation(
      () => new Promise((resolve) => { resolver = resolve }),
    )
    renderModal()

    // Se espera a que la lectura esté en vuelo: el botón lo dice.
    const boton = await screen.findByRole('button', { name: /Consultando triage/ })
    expect(boton).toBeDisabled()
    expect(screen.queryByText('(Requiere triage)')).not.toBeInTheDocument()
    // Tampoco se ofrece capturar signos sobre lo que quizá ya existe.
    expect(screen.queryByRole('button', { name: 'Registrar Triage' })).not.toBeInTheDocument()
    expect(screen.getByText('Consultando…')).toBeInTheDocument()

    await act(async () => {
      resolver!({ id: 1 })
    })

    // Con la respuesta, el botón se habilita y ya no dice nada de triage.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Pasar a Sala/ })).not.toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: /Ver\/Editar Triage/ })).toBeInTheDocument()
  })
})

describe('AppointmentModal · cita en consulta (plan 28, D-3)', () => {
  const EN_CONSULTA: Appointment = { ...CITA, status: AppointmentStatus.EN_CONSULTA }

  it('ofrece regresarla a sala sin pedir triage, finalizarla o cancelarla; nunca «Pasar a Sala»', async () => {
    getTriageByAppointment.mockResolvedValue(null)
    changeStatus.mockResolvedValue({ ...EN_CONSULTA, status: AppointmentStatus.EN_SALA })
    const user = userEvent.setup()
    render(<AppointmentModal visible onClose={vi.fn()} onSaved={vi.fn()} doctors={DOCTORES} appointment={EN_CONSULTA} />)

    await screen.findByText('Pendiente')
    expect(screen.queryByRole('button', { name: /Pasar a Sala/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar como Atendida' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar Cita' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Regresar a sala' }))

    await waitFor(() => expect(changeStatus).toHaveBeenCalled())
    expect(changeStatus.mock.calls[0]).toEqual(expect.arrayContaining([55]))
    expect(JSON.stringify(changeStatus.mock.calls[0])).toContain('en_sala')
    expect(screen.queryByText(/Registra el triage antes/)).not.toBeInTheDocument()
  })
})

describe('AppointmentModal · salir de consulta a donde estaba (plan 28, D-3)', () => {
  it('si entró a consulta desde «confirmada», ofrece «Salir sin atender» y la regresa a confirmada', async () => {
    getTriageByAppointment.mockResolvedValue(null)
    changeStatus.mockResolvedValue({ ...CITA })
    const user = userEvent.setup()
    const cita: Appointment = { ...CITA, status: AppointmentStatus.EN_CONSULTA, estado_antes_de_consulta: 'confirmada' }
    render(<AppointmentModal visible onClose={vi.fn()} onSaved={vi.fn()} doctors={DOCTORES} appointment={cita} />)

    await screen.findByText('Pendiente')
    expect(screen.queryByRole('button', { name: 'Regresar a sala' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salir sin atender' }))

    await waitFor(() => expect(changeStatus).toHaveBeenCalled())
    expect(JSON.stringify(changeStatus.mock.calls[0])).toContain('confirmada')
  })
})

describe('AppointmentModal · paciente ya elegido (plan 29, lote 5)', () => {
  it('una cita nueva con defaultPatient abre con ella elegida', async () => {
    render(
      <AppointmentModal
        visible
        onClose={vi.fn()}
        onSaved={vi.fn()}
        doctors={DOCTORES}
        defaultPatient={{ id: 77, first_name: 'ANA', last_name: 'LÓPEZ', phone: '5512345678' }}
      />,
    )
    expect(await screen.findByDisplayValue('ANA LÓPEZ')).toBeInTheDocument()
  })
})
