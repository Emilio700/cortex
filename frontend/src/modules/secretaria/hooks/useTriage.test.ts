/**
 * El hook de triage de secretaría tiene que distinguir "todavía no hay signos
 * vitales" de "sí los hay".
 *
 * Cuando el backend pasó de contestar 404 a contestar 204 para la cita sin
 * triage, este hook devolvía `response.data` — que con un cuerpo vacío es la
 * cadena vacía, no `null`. Y `AppointmentModal` decide con `triage !== null`,
 * así que una cita SIN signos vitales se dibujaba con la insignia de "Triage
 * registrado" y el botón de pasar a sala habilitado; al oprimirlo, el backend
 * contestaba 400.
 *
 * Las pruebas del modal no lo veían porque mockean el hook completo. Ésta lo
 * ejercita de verdad, contra un doble del cliente HTTP.
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
    apiClient: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { useTriage } from './useTriage'

describe('useTriage de secretaría', () => {
    beforeEach(() => {
        get.mockReset()
    })

    it('la cita sin signos vitales (204) devuelve null, no una cadena vacía', async () => {
        // Axios entrega '' como cuerpo de un 204; devolverlo tal cual es lo que
        // hacía que la pantalla afirmara que el triage ya estaba registrado.
        get.mockResolvedValue({ status: 204, data: '' })

        const { result } = renderHook(() => useTriage())
        await expect(result.current.getTriageByAppointment(1)).resolves.toBeNull()
    })

    it('la cita con signos vitales devuelve el triage', async () => {
        get.mockResolvedValue({ status: 200, data: { id: 9, appointment_id: 1, weight_kg: 62 } })

        const { result } = renderHook(() => useTriage())
        const triage = await result.current.getTriageByAppointment(1)

        expect(triage).toEqual(expect.objectContaining({ id: 9, weight_kg: 62 }))
    })

    it('una cita inexistente (404) también devuelve null, sin reventar', async () => {
        get.mockRejectedValue({ response: { status: 404, data: { detail: 'No se encontró la cita.' } } })

        const { result } = renderHook(() => useTriage())
        await expect(result.current.getTriageByAppointment(999)).resolves.toBeNull()
    })

    it('un fallo del servidor sí se propaga, no se disfraza de "no hay triage"', async () => {
        get.mockRejectedValue({ response: { status: 500, data: { detail: 'Error interno' } } })

        const { result } = renderHook(() => useTriage())
        await expect(result.current.getTriageByAppointment(1)).rejects.toThrow('Error interno')
    })

    it('un 403 se propaga con su código para que la cita diga «sin acceso», no «sin signos»', async () => {
        get.mockRejectedValue({ response: { status: 403, data: { detail: 'Sin relación asistencial.' } } })

        const { result } = renderHook(() => useTriage())
        await expect(result.current.getTriageByAppointment(1)).rejects.toMatchObject({ status: 403 })
    })
})
