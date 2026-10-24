/**
 * Agendar desde la consulta tiene que distinguir "esa hora ya no está libre"
 * de "falló el sistema".
 *
 * El hook del doctor era de sólo lectura; al darle la capacidad de agendar, el
 * riesgo no es que reviente, es que trate un 400 con explicación —el horario se
 * ocupó mientras la doctora capturaba— como un error genérico. Ese mensaje es
 * el único que le dice qué hacer, y perderlo la deja reintentando lo mismo.
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
    apiClient: { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    default: { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { useDoctorAppointments } from './useDoctorAppointments'

const CITA = {
    patient_id: 3,
    doctor_id: 7,
    scheduled_at: '2026-10-14T16:00:00',
    duration_minutes: 30,
}

describe('agendar desde el hook del doctor', () => {
    beforeEach(() => {
        post.mockReset()
    })

    it('devuelve la cita agendada', async () => {
        post.mockResolvedValue({ status: 201, data: { id: 42, ...CITA } })

        const { result } = renderHook(() => useDoctorAppointments())
        const agendada = await result.current.createAppointment(CITA)

        expect(agendada).toEqual({ estado: 'ok', dato: expect.objectContaining({ id: 42 }) })
    })

    it('un horario ocupado conserva la explicación del backend', async () => {
        post.mockRejectedValue({
            response: {
                status: 400,
                data: { detail: 'El doctor ya tiene otra cita a esa hora. Elige un horario libre.' },
            },
        })

        const { result } = renderHook(() => useDoctorAppointments())
        const agendada = await result.current.createAppointment(CITA)

        expect(agendada.estado).toBe('horario-ocupado')
        expect(agendada).toHaveProperty('mensaje', expect.stringContaining('horario libre'))
    })

    it('agendar en la agenda de otra doctora se reporta como falta de permiso', async () => {
        post.mockRejectedValue({
            response: {
                status: 403,
                data: { detail: 'Solo puedes agendar citas en tu propia agenda.' },
            },
        })

        const { result } = renderHook(() => useDoctorAppointments())
        const agendada = await result.current.createAppointment({ ...CITA, doctor_id: 99 })

        expect(agendada.estado).toBe('sin-permiso')
    })

    it('un 422 nombra todos los campos que faltan, no sólo el primero', async () => {
        // Corregir un campo por vuelta desespera a quien llena el formulario.
        post.mockRejectedValue({
            response: {
                status: 422,
                data: {
                    detail: [
                        { loc: ['body', 'scheduled_at'], msg: 'field required' },
                        { loc: ['body', 'room_id'], msg: 'field required' },
                    ],
                },
            },
        })

        const { result } = renderHook(() => useDoctorAppointments())
        const agendada = await result.current.createAppointment(CITA)

        expect(agendada.estado).toBe('error')
        expect(agendada).toHaveProperty(
            'mensaje',
            expect.stringContaining('"Fecha y hora" es obligatorio'),
        )
        expect(agendada).toHaveProperty('mensaje', expect.stringContaining('"Sala" es obligatorio'))
    })
})
