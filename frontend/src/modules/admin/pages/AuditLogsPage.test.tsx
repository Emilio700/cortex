/** Bitácora: un fallo no se ve como «0 eventos» (plan 29). */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import AuditLogsPage from './AuditLogsPage'

describe('AuditLogsPage', () => {
  it('si falla lo dice, no «0 eventos», y reintentar vuelve a pedir', async () => {
    get.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'Falló el servidor.' } } }).mockResolvedValue({
      data: { items: [{ id: 1, actor_name: 'Lupita', action: 'patient.viewed', entity_type: 'patient', patient_id: 4, outcome: 'denied', ip_anonymized: null, device_label: null, reason: null, created_at: '2026-10-04T10:00:00' }], total: 1 },
    })
    render(<AuditLogsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Falló el servidor.')
    expect(screen.queryByText('0 eventos')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Denegado')).toBeInTheDocument()
    expect(screen.getByText('Paciente n.º 4')).toBeInTheDocument()
    expect(screen.getByText('1 evento')).toBeInTheDocument()
  })

  it('las tres vistas son botones de alternar en un grupo, sin pestañas a medias (axe)', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    const { container } = render(<AuditLogsPage />)

    const grupo = screen.getByRole('group', { name: 'Qué bitácora ver' })
    const botones = within(grupo).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Cambios y eventos', 'Accesos a expedientes', 'Verificar folio'])
    expect(botones.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    // Lo que axe marcaba: aria-current en un botón, <li> fuera de lista y un tablist sin pestañas.
    expect(container.querySelector('[aria-current]')).toBeNull()
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    for (const li of Array.from(container.querySelectorAll('li'))) {
      expect(li.parentElement?.tagName).toMatch(/^(UL|OL)$/)
    }

    await userEvent.click(botones[2])
    expect(botones[2]).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByLabelText('Buscar folio')).toBeInTheDocument()
  })
})
