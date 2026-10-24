import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PrenatalCarePanel from './PrenatalCarePanel'
import { calcularFpp } from '../../../shared/utils/patientForm'
import { sumarDias } from '../utils/embarazo'

const get = vi.fn()
const post = vi.fn()

vi.mock('../../../shared/services/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'doctor' } }),
}))

// El reloj se congela a mediodia de una fecha fija.
//
// Antes la FUR se calculaba al cargar el modulo ("hoy menos 70 dias") y la
// edad gestacional se calculaba al renderizar: la prueba fallaba de forma
// intermitente segun la hora a la que se corriera, porque `hoyIso()` usa la
// fecha LOCAL mientras la aritmetica de dias va en UTC. Con el reloj fijo
// deja de depender de cuando se ejecute.
const HOY_FIJO = '2026-06-15'
const AHORA_FIJO = new Date(`${HOY_FIJO}T12:00:00`)

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(AHORA_FIJO)
})

afterAll(() => {
  vi.useRealTimers()
})

// FUR de hace 10 semanas exactas respecto al reloj congelado. Se calcula de
// la fecha fija y no de `hoyIso()`, porque las constantes del modulo se
// evaluan ANTES de que corra `beforeAll`.
const FUR = sumarDias(HOY_FIJO, -70)

const sinEmbarazo = () => get.mockResolvedValue({ data: { items: [], total: 0 } })

const abrirFormulario = async () => {
  render(<PrenatalCarePanel patientId={1} />)
  await screen.findByRole('button', { name: /Registrar embarazo/i })
  await userEvent.click(screen.getByRole('button', { name: /Registrar embarazo/i }))
}

const campoFur = () => screen.getByLabelText(/FUR/i) as HTMLInputElement
const campoFpp = () => screen.getByLabelText(/FPP/i) as HTMLInputElement

describe('PrenatalCarePanel', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('calcula la FPP y las semanas de gestación al capturar la FUR', async () => {
    sinEmbarazo()
    await abrirFormulario()

    fireEvent.change(campoFur(), { target: { value: FUR } })

    expect(campoFpp().value).toBe(calcularFpp(FUR))
    expect(screen.getByText(/Edad gestacional hoy: 10 semanas/)).toBeInTheDocument()
    expect(screen.getByText(/regla de Naegele/i)).toBeInTheDocument()
  })

  it('deja sobrescribir la FPP y avisa que la fecha del médico manda', async () => {
    sinEmbarazo()
    await abrirFormulario()

    fireEvent.change(campoFur(), { target: { value: FUR } })
    const ajustada = sumarDias(calcularFpp(FUR), 5)
    fireEvent.change(campoFpp(), { target: { value: ajustada } })

    expect(campoFpp().value).toBe(ajustada)
    expect(screen.getByText(/Fecha ajustada por ti/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Guardar embarazo/i }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toMatchObject({
      patient_id: 1,
      last_menstrual_period: FUR,
      estimated_delivery_date: ajustada,
      estimated_delivery_date_source: 'Fecha ajustada por el médico',
    })
  })

  it('no manda la FPP cuando es la calculada: la calcula el backend', async () => {
    sinEmbarazo()
    await abrirFormulario()

    fireEvent.change(campoFur(), { target: { value: FUR } })
    await userEvent.click(screen.getByRole('button', { name: /Guardar embarazo/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    const payload = post.mock.calls[0][1] as Record<string, unknown>
    expect(payload.last_menstrual_period).toBe(FUR)
    expect(payload).not.toHaveProperty('estimated_delivery_date')
  })

  it('con embarazo activo muestra las semanas y la próxima revisión sugerida', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 4,
            patient_id: 1,
            doctor_id: 1,
            status: 'active',
            last_menstrual_period: FUR,
            estimated_delivery_date: calcularFpp(FUR),
            dating_status: 'pending',
            high_risk_status: 'unknown',
            outcome: 'ongoing',
          },
        ],
        total: 1,
      },
    })
    render(<PrenatalCarePanel patientId={1} />)

    expect(await screen.findByText(/10 semanas \(10\.0 sem\)/)).toBeInTheDocument()
    expect(screen.getByText(/Próxima revisión sugerida/)).toBeInTheDocument()
    expect(screen.getByText(/Control mensual hasta la semana 28/)).toBeInTheDocument()
    expect(screen.getByText(/no se agenda ninguna cita automáticamente/)).toBeInTheDocument()
  })

  it('si no se pudo consultar, no dice «no hay embarazo» ni ofrece registrar uno (plan 29, C-2)', async () => {
    get.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValue({ data: { items: [], total: 0 } })
    render(<PrenatalCarePanel patientId={1} />)

    expect(await screen.findByText(/No se pudo saber si tiene un embarazo activo/)).toBeInTheDocument()
    expect(screen.queryByText('No hay un embarazo activo registrado para esta paciente.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar embarazo/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('No hay un embarazo activo registrado para esta paciente.')).toBeInTheDocument()
  })
})
