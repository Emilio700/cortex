/**
 * La agenda dice si una cita atendida ya se cobró (plan 23). Es lo primero
 * que mira la secretaria: si ahí dice "Cobrada", no pasa la tarjeta otra vez.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AgendaLista } from '../../secretaria/components/AgendaLista'
import { AppointmentStatus, type Appointment } from '../../secretaria/types'
import { InsigniaCobro } from './InsigniaCobro'

const cita = (id: number, extra: Record<string, unknown> = {}): Appointment => {
  const fecha = new Date(2026, 8, 28, 9 + id, 0, 0, 0)
  return {
    id,
    patient_id: id * 10,
    doctor_id: 7,
    tenant_id: 2,
    scheduled_at: fecha.toISOString(),
    duration_minutes: 30,
    status: AppointmentStatus.ATENDIDA,
    created_at: fecha.toISOString(),
    updated_at: fecha.toISOString(),
    has_triage: false,
    patient: { id: id * 10, first_name: 'ANA', last_name: `PACIENTE ${id}` },
    ...extra,
  } as Appointment
}

describe('InsigniaCobro', () => {
  it('en la vista de lista, cada cita atendida dice su estado de cobro', () => {
    render(
      <AgendaLista
        citas={[
          cita(1, {
            estado_cobro: 'cobrada',
            cobro_resumen: [
              { id: 9, amount: '800.00', method: 'card', received_by_name: 'DRA. CINTIA', paid_at: '2026-09-28T11:05:00' },
            ],
          }),
          cita(2, { estado_cobro: 'pendiente' }),
          cita(3, { estado_cobro: 'sin_cargo', cobro_sin_cargo_motivo: 'REVISIÓN INCLUIDA' }),
        ]}
        onCitaClick={() => undefined}
      />,
    )

    expect(screen.getByText('Cobrada')).toHaveAttribute(
      'title',
      expect.stringMatching(/Ya la cobró DRA\. CINTIA .*\$800\.00 con tarjeta/),
    )
    expect(screen.getByText('Pendiente de cobro')).toBeInTheDocument()
    expect(screen.getByText('Sin cargo')).toHaveAttribute('title', 'Sin cargo: REVISIÓN INCLUIDA')
  })

  it('sin estado de cobro del servidor no inventa ninguno', () => {
    const { container } = render(<InsigniaCobro cita={{ estado_cobro: null }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('en el calendario usa el texto corto', () => {
    render(<InsigniaCobro cita={{ estado_cobro: 'pendiente' }} compacta />)

    expect(screen.getByText('Por cobrar')).toBeInTheDocument()
  })
})
