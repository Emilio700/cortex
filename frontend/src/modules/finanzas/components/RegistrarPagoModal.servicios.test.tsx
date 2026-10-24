/**
 * Si el catálogo de servicios no se pudo leer, el modal lo dice en vez de
 * mostrarlo vacío como si no hubiera servicios (plan 29, $-1 / T-1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const get = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))
vi.mock('../hooks/useFinanzas', () => ({
  useFinanzas: () => ({ createPayment: vi.fn(), createConsultaExpress: vi.fn() }),
}))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import { RegistrarPagoModal } from './RegistrarPagoModal'

let fallaServicios = true

beforeEach(() => {
  fallaServicios = true
  get.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/services') {
      return fallaServicios
        ? Promise.reject(new Error('sin red'))
        : Promise.resolve({ data: [{ id: 1, name: 'Consulta', price: '800.00', is_active: true }] })
    }
    return Promise.resolve({ data: [] })
  })
})

describe('RegistrarPagoModal · catálogo de servicios', () => {
  it('si no se pudo leer lo dice, y «reintentar» lo vuelve a pedir', async () => {
    const user = userEvent.setup()
    render(<RegistrarPagoModal visible onClose={vi.fn()} onRegistrado={vi.fn()} esDoctora={false} doctoras={[]} />)

    expect(await screen.findByText(/No se pudo cargar el catálogo de servicios/)).toBeInTheDocument()

    fallaServicios = false
    await user.click(screen.getByRole('button', { name: 'reintentar' }))

    expect(await screen.findByRole('option', { name: /Consulta/ })).toBeInTheDocument()
    expect(screen.queryByText(/No se pudo cargar el catálogo de servicios/)).not.toBeInTheDocument()
  })
})
