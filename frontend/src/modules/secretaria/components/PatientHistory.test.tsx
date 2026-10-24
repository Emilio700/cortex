/**
 * Historial de la paciente (plan 29, lote 6): «Última consulta» es la última
 * atendida, no la primera de la lista (que puede ser una cita futura), y un
 * fallo al leer no se ve como «sin historial».
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import { PatientHistory } from './PatientHistory'

const paciente = { id: 4, first_name: 'Ana', last_name: 'López', date_of_birth: '1990-01-01' }

beforeEach(() => {
  get.mockReset()
})

describe('PatientHistory', () => {
  it('la última consulta es la última atendida, no una cita futura', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('/history')
          ? {
              patient_id: 4,
              patient_name: 'Ana López',
              history: [
                { appointment_id: 3, scheduled_at: '2026-10-20T10:00:00', status: 'agendada', prescriptions: [] },
                {
                  appointment_id: 2,
                  scheduled_at: '2026-09-15T10:00:00',
                  status: 'atendida',
                  prescriptions: [],
                  triage: { weight_kg: 61 },
                },
              ],
            }
          : paciente,
      }),
    )
    render(<PatientHistory patientId={4} />)

    const tarjeta = (await screen.findAllByText('ÚLTIMA CONSULTA'))[0].closest('.flip-card-front') as HTMLElement
    expect(tarjeta).toHaveTextContent(/15 sept?.? 2026/)
    expect(tarjeta).toHaveTextContent('61 kg')
    expect(tarjeta).not.toHaveTextContent('20 oct')
  })

  it('sin permiso clínico no pinta lo clínico ni dice que no lo hay (plan 32, C1)', async () => {
    const usuario = userEvent.setup()
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('/history')
          ? {
              patient_id: 4,
              patient_name: 'Ana López',
              contenido_clinico: false,
              history: [
                { appointment_id: 2, scheduled_at: '2026-09-15T10:00:00', status: 'atendida', prescriptions: [], triage: null, soap_note: null },
              ],
            }
          : paciente,
      }),
    )
    render(<PatientHistory patientId={4} />)

    expect(await screen.findByText(/Historial de Ana López/)).toBeInTheDocument()
    expect(screen.queryByText('ÚLTIMA CONSULTA')).not.toBeInTheDocument()
    await usuario.click(screen.getByText(/15 de septiembre de 2026/))
    expect(await screen.findByText(/solo los ve el personal médico/)).toBeInTheDocument()
    expect(screen.queryByText('Sin datos clínicos registrados en esta cita.')).not.toBeInTheDocument()
  })

  it('si no se pudo leer lo dice y deja reintentar', async () => {
    const usuario = userEvent.setup()
    get.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue({ data: { history: [] } })
    render(<PatientHistory patientId={4} />)

    expect(await screen.findByText(/Esto no quiere decir que no tenga citas/)).toBeInTheDocument()
    expect(screen.queryByText('Sin historial clínico')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Sin historial clínico')).toBeInTheDocument()
  })
})
