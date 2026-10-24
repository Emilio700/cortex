/**
 * La fecha de la próxima revisión tiene que poder ajustarse y quedar guardada.
 *
 * Y tiene que decir la verdad sobre su propio estado: mientras no se haya
 * guardado, la pantalla no puede dar a entender que sí; y guardarla no es
 * agendar la cita. La regla salió de un caso real en que un mensaje de éxito
 * que mentía hizo que un médico duplicara una receta.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const patch = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
    apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch, delete: vi.fn() },
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch, delete: vi.fn() },
}))

import ProximaRevisionEditable from './ProximaRevisionEditable'
import { resumirEmbarazo } from '../utils/embarazo'
import type { Pregnancy } from '../types/prenatal'

// FUR elegida para caer en control mensual; el valor exacto no importa, lo que
// importa es que la regla produzca una sugerencia.
const FUR = '2026-07-16'

// La sugerida es «hoy + intervalo»: con el reloj real, el resultado dependía
// del día y de la zona en que se corriera (en el workflow, en UTC, fallaba).
// Se congela a mediodía de Mazatlán (19:00 UTC) de una fecha fija; solo se
// finge `Date` para que userEvent siga funcionando con sus temporizadores.
beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-20T19:00:00Z'))
})

afterAll(() => {
    vi.useRealTimers()
})

const embarazo = (extra: Partial<Pregnancy> = {}): Pregnancy => ({
    id: 4,
    patient_id: 1,
    doctor_id: 1,
    status: 'active',
    last_menstrual_period: FUR,
    dating_status: 'pending',
    high_risk_status: 'unknown',
    outcome: 'ongoing',
    ...extra,
})

const resumenDe = (p: Pregnancy) => resumirEmbarazo(p)

const campo = () => screen.getByLabelText(/Próxima revisión/i) as HTMLInputElement

describe('ProximaRevisionEditable', () => {
    beforeEach(() => {
        patch.mockReset()
    })

    it('parte de la fecha sugerida y avisa de que todavía no está guardada', () => {
        const p = embarazo()
        const resumen = resumenDe(p)
        render(<ProximaRevisionEditable pregnancy={p} resumen={resumen} />)

        expect(campo().value).toBe(resumen!.proxima!.fecha)
        // El campo trae la sugerencia, pero el servidor no la tiene: la
        // pantalla lo dice en vez de dar por registrado lo que no lo está.
        expect(screen.getByText(/Todavía sin guardar/)).toBeInTheDocument()
    })

    it('guardar manda la fecha ajustada junto con la sugerida', async () => {
        const p = embarazo()
        const resumen = resumenDe(p)
        patch.mockResolvedValue({ data: { ...p, next_review_on: '2026-11-02' } })
        const onGuardada = vi.fn()
        render(<ProximaRevisionEditable pregnancy={p} resumen={resumen} onGuardada={onGuardada} />)

        await userEvent.clear(campo())
        await userEvent.type(campo(), '2026-11-02')
        await userEvent.click(screen.getByRole('button', { name: /Guardar fecha/i }))

        await waitFor(() => expect(patch).toHaveBeenCalled())
        expect(patch.mock.calls[0][0]).toBe('/prenatal/pregnancies/4')
        expect(patch.mock.calls[0][1]).toEqual({
            next_review_on: '2026-11-02',
            next_review_suggested_on: resumen!.proxima!.fecha,
        })
        expect(onGuardada).toHaveBeenCalled()
    })

    it('una fecha ya guardada manda sobre la sugerida y se anuncia como ajustada', () => {
        const p = embarazo({ next_review_on: '2026-11-02', next_review_suggested_on: '2026-10-14' })
        render(<ProximaRevisionEditable pregnancy={p} resumen={resumenDe(p)} />)

        expect(campo().value).toBe('2026-11-02')
        expect(screen.getByText(/ajustada respecto a la sugerida/i)).toBeInTheDocument()
    })

    it('si el guardado falla, la pantalla no dice que se guardó', async () => {
        const p = embarazo()
        patch.mockRejectedValue({ response: { status: 500, data: {} } })
        render(<ProximaRevisionEditable pregnancy={p} resumen={resumenDe(p)} />)

        await userEvent.clear(campo())
        await userEvent.type(campo(), '2026-11-02')
        await userEvent.click(screen.getByRole('button', { name: /Guardar fecha/i }))

        await waitFor(() =>
            expect(screen.getByText(/Ocurrió un error en el sistema/)).toBeInTheDocument(),
        )
        expect(screen.getByText(/Todavía sin guardar/)).toBeInTheDocument()
        expect(screen.queryByText(/^Guardada:/)).not.toBeInTheDocument()
    })

    it('dice explícitamente que guardar la fecha no agenda la cita', () => {
        const p = embarazo()
        render(<ProximaRevisionEditable pregnancy={p} resumen={resumenDe(p)} />)

        expect(
            screen.getByText(/no agenda la cita ni avisa al paciente/),
        ).toBeInTheDocument()
    })
})
