/**
 * Borrar un horario o un bloqueo se confirma antes (U-05).
 *
 * Lo que no puede pasar: que un clic por descuido en la papelera abra huecos
 * en la agenda sin aviso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const horario = vi.hoisted(() => ({
  workingHours: [{ id: 7, weekday: 0, start_time: '09:00:00', end_time: '14:00:00' }],
  blocks: [{ id: 3, start_at: '2026-10-01T09:00:00', end_at: '2026-10-01T13:00:00', reason: 'Congreso' }],
  loading: false,
  error: null as string | null,
  getWorkingHours: vi.fn(),
  createWorkingHours: vi.fn(),
  deleteWorkingHours: vi.fn(),
  getBlocks: vi.fn(),
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
}))

vi.mock('../hooks/useDoctorSchedule', () => ({ useDoctorSchedule: () => horario }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'doctor' } }),
}))

import DoctorScheduleCard from './DoctorScheduleCard'

beforeEach(() => {
  horario.deleteWorkingHours.mockReset()
  horario.deleteBlock.mockReset()
})

describe('DoctorScheduleCard · borrar se confirma', () => {
  it('eliminar un horario pide confirmación y sólo entonces borra', async () => {
    const user = userEvent.setup()
    render(<DoctorScheduleCard />)

    await user.click(screen.getByRole('button', { name: 'Eliminar horario' }))

    // Aún no se borra: primero se confirma.
    expect(horario.deleteWorkingHours).not.toHaveBeenCalled()
    expect(await screen.findByText(/Dejarás de recibir citas en ese horario/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(horario.deleteWorkingHours).toHaveBeenCalledWith(7))
  })

  it('cancelar la confirmación no borra el horario', async () => {
    const user = userEvent.setup()
    render(<DoctorScheduleCard />)

    await user.click(screen.getByRole('button', { name: 'Eliminar horario' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(horario.deleteWorkingHours).not.toHaveBeenCalled()
  })

  it('eliminar un bloqueo también se confirma', async () => {
    const user = userEvent.setup()
    render(<DoctorScheduleCard />)

    await user.click(screen.getByRole('button', { name: 'Eliminar bloqueo' }))
    expect(horario.deleteBlock).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(horario.deleteBlock).toHaveBeenCalledWith(3))
  })
})

describe('DoctorScheduleCard · cada campo con su etiqueta (plan 29, lote 6)', () => {
  it('el lector de pantalla encuentra los campos por su nombre', async () => {
    render(<DoctorScheduleCard />)
    expect(screen.getByLabelText('Día')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Desde')).toHaveLength(2)
    expect(screen.getAllByLabelText('Hasta')).toHaveLength(2)
    expect(screen.getByLabelText('Motivo (opcional)')).toBeInTheDocument()
  })
})
