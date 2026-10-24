/** Rastro de cada estudio (plan 32, punto 3): fecha y autor; lo viejo, «sin registro». */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import { LeyendaUltimaActualizacion, LeyendasDeResultado } from './RastroDeEstudio'

describe('RastroDeEstudio', () => {
  beforeEach(() => get.mockReset())

  it('la leyenda dice cuándo y quién, en hora del consultorio', () => {
    // 01:42 UTC del 4 de octubre son las 18:42 del 3 en Mazatlán.
    render(<LeyendaUltimaActualizacion orderId={5} cuando="2026-10-04T01:42:00" por="Jhoany" />)
    expect(screen.getByText(/Última actualización: 3 oct 2026, 18:42 · Jhoany/)).toBeInTheDocument()
  })

  it('sin autor guardado dice «sin registro»', () => {
    render(<LeyendaUltimaActualizacion orderId={5} cuando="2026-10-04T01:42:00" por={null} />)
    expect(screen.getByText(/· sin registro/)).toBeInTheDocument()
  })

  it('la línea de tiempo se pide solo al abrirla y muestra cada paso', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue({
      data: {
        order_id: 5,
        eventos: [
          { tipo: 'solicitud', titulo: 'Solicitado', cuando: '2026-10-01T16:00:00', autor: 'Dra. Cintia' },
          { tipo: 'impresion', titulo: 'Impreso', cuando: '2026-10-01T16:05:00', autor: 'Jhoany', detalle: 'GG-ORD-2026-1' },
          { tipo: 'revisado', titulo: 'Revisado', cuando: '2026-10-03T16:00:00', autor: null },
        ],
      },
    })
    render(<LeyendaUltimaActualizacion orderId={5} cuando="2026-10-03T16:00:00" por="Dra. Cintia" />)
    expect(get).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Ver historial' }))
    expect(get).toHaveBeenCalledWith('/clinical-tracking/orders/5/rastro')
    expect(await screen.findByText('Impreso')).toBeInTheDocument()
    expect(screen.getByText(/GG-ORD-2026-1/)).toBeInTheDocument()
    expect(screen.getAllByText(/sin registro/).length).toBeGreaterThan(0)
  })

  it('cada resultado dice subido, escrito, revisado y comunicado con su canal', () => {
    render(
      <LeyendasDeResultado
        resultado={{
          id: 1, review_status: 'communicated', is_critical: false, created_at: '2026-10-02T18:05:00',
          patient_document_id: 9, recorded_by_nombre: 'Jhoany',
          clinician_interpretation: 'Normal', interpretacion_escrita_at: '2026-10-03T01:00:00',
          interpretacion_escrita_por_nombre: 'Dra. Cintia',
          reviewed_at: '2026-10-03T01:00:00', reviewed_by_nombre: 'Dra. Cintia',
          communicated_at: '2026-10-03T02:00:00', communicated_by_nombre: 'Dra. Cintia', communication_channel: 'whatsapp',
        }}
      />,
    )
    expect(screen.getByText(/^Subido el 2 oct 2026, 11:05 por Jhoany$/)).toBeInTheDocument()
    expect(screen.getByText(/^Escrito el .* por Dra. Cintia$/)).toBeInTheDocument()
    expect(screen.getByText(/^Revisado el .* por Dra. Cintia$/)).toBeInTheDocument()
    expect(screen.getByText(/^Comunicado el .* por Dra. Cintia · WhatsApp$/)).toBeInTheDocument()
  })

  it('una interpretación vieja sin rastro no se atribuye a nadie', () => {
    render(
      <LeyendasDeResultado
        resultado={{ id: 1, review_status: 'reviewed', is_critical: false, created_at: '2026-01-02T18:05:00', clinician_interpretation: 'Normal' }}
      />,
    )
    expect(screen.getByText('Interpretación escrita: sin registro de cuándo ni quién')).toBeInTheDocument()
    expect(screen.getByText(/por sin registro/)).toBeInTheDocument()
  })
})
