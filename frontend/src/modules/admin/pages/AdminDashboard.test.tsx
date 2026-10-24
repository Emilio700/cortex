/**
 * El corte de caja ganó desgloses por doctora y por quién recibió (plan 23).
 * El tablero de admin pide el mismo corte, sin doctora: tiene que seguir
 * mostrando lo de siempre, el total de la sucursal por método.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import AdminDashboard from './AdminDashboard'

const getCashCut = vi.fn()
const fetchUsers = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../hooks/usePayments', () => ({ usePayments: () => ({ getCashCut }) }))
vi.mock('../hooks/useServices', () => ({
  useServices: () => ({ fetchServices: () => Promise.resolve([{ id: 1 }, { id: 2 }]) }),
}))
vi.mock('../hooks/useAdminUsers', () => ({
  useAdminUsers: () => ({ fetchUsers }),
}))

beforeEach(() => {
  getCashCut.mockReset()
  fetchUsers.mockReset()
  fetchUsers.mockResolvedValue([{ id: 1 }])
})

describe('AdminDashboard · corte de caja de hoy', () => {
  it('con el corte nuevo sigue mostrando el total de la sucursal y el desglose por método', async () => {
    getCashCut.mockResolvedValue({
      start_date: '2026-09-28',
      end_date: '2026-09-28',
      total_amount: '2000.00',
      total_count: 3,
      by_method: [
        { method: 'cash', total_amount: '1200.00', count: 2 },
        { method: 'card', total_amount: '800.00', count: 1 },
      ],
      by_doctor: [{ doctor_id: 7, doctor_name: 'CINTIA', total_amount: '2000.00', count: 3 }],
      by_received_by: [{ user_id: 20, user_name: 'LUPITA', total_amount: '2000.00', count: 3 }],
    })
    render(<AdminDashboard />)

    expect(await screen.findByText('$2,000.00')).toBeInTheDocument()
    expect(screen.getByText('Cobrado hoy')).toBeInTheDocument()
    expect(screen.getByText('Efectivo')).toBeInTheDocument()
    expect(screen.getByText('$1,200.00')).toBeInTheDocument()
    // Pide el corte de la sucursal, no el de una doctora.
    expect(getCashCut).toHaveBeenCalledWith()
  })
})

describe('AdminDashboard · una carga fallida no se ve como cero (plan 28, Fase 1)', () => {
  it('sin corte ni usuarios muestra «—» y el error, y lo que sí llegó se ve', async () => {
    getCashCut.mockRejectedValue(new Error('El servidor no respondió'))
    fetchUsers.mockRejectedValue(new Error('Sin permiso para ver usuarios'))
    render(<AdminDashboard />)

    expect(await screen.findByText('No se pudo cargar todo el resumen.')).toBeInTheDocument()
    expect(screen.getByText('Corte de caja: El servidor no respondió')).toBeInTheDocument()
    expect(screen.getByText('Usuarios: Sin permiso para ver usuarios')).toBeInTheDocument()
    // Los servicios sí llegaron: 2.
    expect(screen.getByRole('button', { name: /2\s*Servicios activos/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sin dato:\s*Usuarios/ })).toHaveTextContent('—')
    expect(screen.getByRole('button', { name: /Sin dato:\s*Cobrado hoy/ })).toHaveTextContent('—')
    expect(screen.getByRole('button', { name: /Sin dato:\s*Cobros hoy/ })).toHaveTextContent('—')
    // Ninguna tarjeta inventa un cero ni el corte dice «no hay cobros».
    for (const tarjeta of screen.getAllByRole('button', { name: /Sin dato/ })) {
      expect(tarjeta).not.toHaveTextContent(/0/)
    }
    expect(screen.queryByText('No hay cobros registrados hoy.')).not.toBeInTheDocument()
    expect(screen.getByText(/No se pudo cargar el corte de caja/)).toBeInTheDocument()
  })

  it('«Reintentar» vuelve a pedir lo que falló y, si llega, quita el aviso', async () => {
    getCashCut.mockRejectedValueOnce(new Error('El servidor no respondió')).mockResolvedValue({
      start_date: '2026-09-28',
      end_date: '2026-09-28',
      total_amount: '0.00',
      total_count: 0,
      by_method: [],
      by_doctor: [],
      by_received_by: [],
    })
    render(<AdminDashboard />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    // Un cero que sí viene del servidor es un dato y se muestra.
    expect(await screen.findByText('No hay cobros registrados hoy.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('No se pudo cargar todo el resumen.')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^0\s*Cobros hoy/ })).toBeInTheDocument()
  })
})
