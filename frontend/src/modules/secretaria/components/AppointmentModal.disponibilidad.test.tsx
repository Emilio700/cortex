/**
 * El modal de cita no puede ofrecer horarios que el servidor vaya a rechazar.
 *
 * Aquí se comprueba justo eso: que la rejilla sale de la respuesta del
 * endpoint de disponibilidad y no de una suposición, que lo ocupado no se
 * puede pinchar, y que al elegir una franja se manda exactamente esa hora
 * local (sin pasar por UTC, que ya desfasó la agenda siete horas una vez).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentModal } from './AppointmentModal'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
import type { Disponibilidad, Franja } from '../../../shared/services/disponibilidad'
import { Role, type User } from '../../../shared/types'

const createAppointment = vi.fn()
const updateAppointment = vi.fn()
const changeStatus = vi.fn()
const listSalas = vi.fn()
const fetchPatients = vi.fn()
const getTriageByAppointment = vi.fn()
const getDisponibilidad = vi.fn()

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
    getDisponibilidad: (...args: unknown[]) => getDisponibilidad(...args),
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

const DIA = '2026-09-19'

const franja = (hora: string, disponible = true, motivo: string | null = null): Franja => ({
    inicio: `${DIA}T${hora}:00`,
    hora,
    meridiano: Number(hora.slice(0, 2)) < 12 ? 'am' : 'pm',
    disponible,
    motivo: disponible ? null : motivo ?? 'El doctor ya tiene otra cita a esa hora. Elige un horario libre.',
})

const disponibilidad = (extra: Partial<Disponibilidad> = {}): Disponibilidad => ({
    doctor_id: 7,
    fecha: DIA,
    duration_minutes: 30,
    step_minutes: 30,
    room_id: null,
    jornada_por_defecto: false,
    franjas: [
        franja('09:00'),
        franja('09:30', false),
        franja('10:00'),
        franja('16:00'),
    ],
    dias: [
        { fecha: '2026-09-19', disponible: true, huecos: 3 },
        { fecha: '2026-09-21', disponible: false, huecos: 0 },
    ],
    ...extra,
})

const citaExistente = (extra: Partial<Appointment> = {}): Appointment => ({
    id: 55,
    patient_id: 3,
    doctor_id: 7,
    tenant_id: 2,
    scheduled_at: `${DIA}T10:00:00`,
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
            defaultDate={new Date(2026, 8, 19, 10, 0)}
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
    getDisponibilidad.mockResolvedValue(disponibilidad())
})

const rejilla = () => screen.getByRole('group', { name: 'Horarios' })

const elegirDoctor = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.selectOptions(screen.getByLabelText(/Doctor/), '7')
    await screen.findByRole('group', { name: 'Horarios' })
}

const elegirPaciente = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByLabelText(/Paciente/))
    await user.click(await screen.findByText('ANA LÓPEZ'))
}

describe('AppointmentModal · disponibilidad', () => {
    it('no pide horarios ni los inventa mientras no haya doctor', async () => {
        renderModal()
        expect(
            await screen.findByText(/Elige primero a la doctora para ver sus horarios libres/),
        ).toBeInTheDocument()
        expect(getDisponibilidad).not.toHaveBeenCalled()
    })

    it('pinta la rejilla con lo que responde el servidor, no con una suposición', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirDoctor(user)

        expect(
            screen.getByText('Horarios disponibles para el 19 de septiembre de 2026'),
        ).toBeInTheDocument()
        expect(within(rejilla()).getByRole('button', { name: /^09:00/ })).toBeEnabled()
        // 09:30 lo devolvió ocupado: se ve, pero no se puede elegir.
        expect(within(rejilla()).getByRole('button', { name: /^09:30/ })).toBeDisabled()
        expect(within(rejilla()).queryByRole('button', { name: /^16:00/ })).not.toBeInTheDocument()

        expect(getDisponibilidad).toHaveBeenCalledWith(
            expect.objectContaining({ doctorId: 7, fecha: DIA, duracionMinutos: 30 }),
        )
    })

    it('el conmutador a. m. / p. m. cambia la mitad del día que se muestra', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirDoctor(user)

        await user.click(screen.getByRole('button', { name: 'p. m.' }))
        expect(within(rejilla()).getByRole('button', { name: /^16:00/ })).toBeInTheDocument()
        expect(within(rejilla()).queryByRole('button', { name: /^09:00/ })).not.toBeInTheDocument()
    })

    it('al elegir una franja se agenda esa hora local, sin pasar por UTC', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirPaciente(user)
        await elegirDoctor(user)

        await user.click(within(rejilla()).getByRole('button', { name: /^09:00/ }))
        await user.click(screen.getByRole('button', { name: 'Guardar cita' }))

        await waitFor(() => expect(createAppointment).toHaveBeenCalled())
        expect(createAppointment.mock.calls[0][0]).toMatchObject({
            scheduled_at: '2026-09-19T09:00:00',
            doctor_id: 7,
            patient_id: 3,
        })
    })

    it('el calendario marca con la leyenda lo que dice el servidor', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirDoctor(user)

        expect(screen.getByText('Fecha seleccionada')).toBeInTheDocument()
        expect(screen.getByText('Disponible')).toBeInTheDocument()
        expect(screen.getByText('No disponible')).toBeInTheDocument()
        // El día sin huecos se anuncia como tal para quien usa lector de pantalla.
        expect(
            await screen.findByRole('button', { name: '2026-09-21 · sin horarios libres' }),
        ).toBeInTheDocument()
    })

    it('al cambiar de día vuelve a preguntar por ese día', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirDoctor(user)
        getDisponibilidad.mockClear()

        await user.click(screen.getByRole('button', { name: /^2026-09-22/ }))

        await waitFor(() =>
            expect(getDisponibilidad).toHaveBeenCalledWith(
                expect.objectContaining({ fecha: '2026-09-22' }),
            ),
        )
    })

    it('al cambiar la duración se vuelven a pedir los horarios con la nueva', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirDoctor(user)
        getDisponibilidad.mockClear()

        await user.selectOptions(screen.getByLabelText('Duración'), '60')

        await waitFor(() =>
            expect(getDisponibilidad).toHaveBeenCalledWith(
                expect.objectContaining({ duracionMinutos: 60 }),
            ),
        )
    })

    it('al editar, la propia cita se excluye para que su hora siga eligible', async () => {
        renderModal({ appointment: citaExistente() })
        await waitFor(() =>
            expect(getDisponibilidad).toHaveBeenCalledWith(
                expect.objectContaining({ excluirCitaId: 55 }),
            ),
        )
    })

    it('avisa cuando el doctor no tiene horario configurado ese día', async () => {
        const user = userEvent.setup()
        getDisponibilidad.mockResolvedValue(disponibilidad({ jornada_por_defecto: true }))
        renderModal()
        await elegirDoctor(user)

        expect(
            screen.getByText(/no tiene horario de atención configurado ese día/),
        ).toBeInTheDocument()
    })

    it('si no se pueden consultar los horarios lo dice, y no ofrece ninguno', async () => {
        const user = userEvent.setup()
        getDisponibilidad.mockRejectedValue(new Error('No se pudieron cargar los horarios disponibles.'))
        renderModal()
        await user.selectOptions(screen.getByLabelText(/Doctor/), '7')

        expect(
            await screen.findByText('No se pudieron cargar los horarios disponibles.'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Horarios' })).not.toBeInTheDocument()
    })

    it('las notas se capturan en MAYÚSCULAS', async () => {
        const user = userEvent.setup()
        renderModal()
        await elegirPaciente(user)
        await elegirDoctor(user)

        await user.type(screen.getByLabelText(/Notas adicionales/), 'trae ultrasonido')
        await user.click(screen.getByRole('button', { name: 'Guardar cita' }))

        await waitFor(() => expect(createAppointment).toHaveBeenCalled())
        expect(createAppointment.mock.calls[0][0].notes).toBe('TRAE ULTRASONIDO')
    })

    it('al editar, el botón dice "Guardar cambios" y la cabecera lleva el estado', async () => {
        renderModal({ appointment: citaExistente({ status: AppointmentStatus.CONFIRMADA }) })
        expect(await screen.findByText('Editar Cita')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    })
})
