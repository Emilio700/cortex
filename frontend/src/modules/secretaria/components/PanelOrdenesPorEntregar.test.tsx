/**
 * Recepción marca una orden como entregada (O-09).
 *
 * Lo que no puede pasar: decir «entregada ahora» cuando el servidor no lo
 * confirmó, o decirlo dos veces cuando otra persona ya la marcó.
 */
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: () => true, user: { role: 'secretaria' } }),
}))

import PanelOrdenesPorEntregar from './PanelOrdenesPorEntregar'

const unaOrden = (extra = {}) => ({
  data: {
    items: [
      {
        order_id: 57,
        order_group_id: null,
        patient_id: 12,
        patient_name: 'María López Pérez',
        study_name: 'Biometría hemática',
        requested_on: '2026-09-29',
        status: 'ordered',
        delivered: false,
        delivered_at: null,
        ...extra,
      },
    ],
    total: 1,
    skip: 0,
    limit: 25,
  },
})

beforeEach(() => {
  get.mockReset().mockResolvedValue(unaOrden())
  post.mockReset()
})

describe('PanelOrdenesPorEntregar (O-09)', () => {
  it('junta en una tarjeta las órdenes de la misma paciente y le imprime un solo papel', async () => {
    const dos = unaOrden()
    dos.data.items.push({ ...dos.data.items[0], order_id: 58, study_name: 'Glucosa' })
    dos.data.total = 2
    get.mockReset().mockImplementation(async (ruta: string) =>
      ruta.endsWith('/pdf') ? { data: new Blob(['%PDF']) } : dos,
    )
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<PanelOrdenesPorEntregar />)
    const vista = within(container)

    expect(await vista.findByText('María López Pérez')).toBeInTheDocument()
    expect(vista.getAllByText('María López Pérez')).toHaveLength(1)
    await user.click(vista.getByRole('button', { name: 'Imprimir orden de hoy' }))

    // Recepción no tiene perfil: se pide sin modo y decide el de la doctora.
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/patients/12/orders/pdf', {
        responseType: 'blob',
        params: { order_ids: '57,58' },
      }),
    )
    expect(screen.getByLabelText('Cómo se imprime')).toHaveValue('')
  })

  it('lista las órdenes del día por entregar, con estado en español', async () => {
    const { container } = render(<PanelOrdenesPorEntregar />)
    const vista = within(container)

    expect(await vista.findByText('María López Pérez')).toBeInTheDocument()
    expect(vista.getByText('Biometría hemática')).toBeInTheDocument()
    expect(vista.getByText('Pendiente de resultado')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(
      '/clinical-tracking/orders/to-deliver',
      expect.objectContaining({ params: expect.objectContaining({ limit: 25 }) }),
    )
  })

  it('marcar entregada llama al endpoint y avisa sólo tras la confirmación', async () => {
    post.mockResolvedValue({
      data: { order_id: 57, delivered: true, delivered_at: '2026-09-29T15:00:00', delivered_by_user_id: 8, ya_estaba_entregada: false },
    })
    const user = userEvent.setup()
    const { container } = render(<PanelOrdenesPorEntregar />)
    const vista = within(container)

    await user.click(await vista.findByRole('button', { name: 'Marcar entregada' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/clinical-tracking/orders/57/delivered'))
    expect(await vista.findByText(/Orden 57 marcada como entregada/)).toBeInTheDocument()
  })

  it('si ya estaba entregada, no lo anuncia como si se acabara de entregar', async () => {
    post.mockResolvedValue({
      data: { order_id: 57, delivered: true, delivered_at: '2026-09-29T14:00:00', delivered_by_user_id: 3, ya_estaba_entregada: true },
    })
    const user = userEvent.setup()
    const { container } = render(<PanelOrdenesPorEntregar />)
    const vista = within(container)

    await user.click(await vista.findByRole('button', { name: 'Marcar entregada' }))

    expect(await vista.findByText(/ya estaba marcada como entregada/)).toBeInTheDocument()
    expect(vista.queryByText(/marcada como entregada a la paciente/)).toBeNull()
  })

  it('si el servidor rechaza la entrega, muestra su motivo', async () => {
    post.mockRejectedValue({
      response: { status: 409, data: { detail: 'Esta orden está cancelada, así que no se entrega.' } },
    })
    const user = userEvent.setup()
    const { container } = render(<PanelOrdenesPorEntregar />)
    const vista = within(container)

    await user.click(await vista.findByRole('button', { name: 'Marcar entregada' }))

    expect(await vista.findByText('Esta orden está cancelada, así que no se entrega.')).toBeInTheDocument()
  })

  it('marca la prioridad de cada estudio que no es rutinario (D-10)', async () => {
    get.mockReset().mockResolvedValue(unaOrden({ priority: 'urgent' }))
    const { container } = render(<PanelOrdenesPorEntregar />)
    const vista = within(container)
    expect(await vista.findByText('Urgente')).toBeInTheDocument()
  })
})
