/**
 * Corte de caja por doctora y por quién recibió (plan 23).
 *
 * Sin el desglose por quién recibió, el corte de recepción no cuadra con la
 * caja el día que la doctora cobra en efectivo en su consultorio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import FinanzasDashboard from './FinanzasDashboard'
import { Role } from '../../../shared/types'

const getCashCut = vi.fn()
const apiGet = vi.fn()
const sesion = { user: { id: 1, role: 'admin' as Role } }

vi.mock('../hooks/useFinanzas', () => ({
  useFinanzas: () => ({ getCashCut, loading: false }),
}))

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get: (...args: unknown[]) => apiGet(...args) },
}))

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: sesion.user, permissions: [], can: () => true }),
}))

const CORTE = {
  start_date: '2026-09-28',
  end_date: '2026-09-28',
  total_amount: '2000.00',
  total_count: 3,
  by_method: [
    { method: 'cash', total_amount: '1200.00', count: 2 },
    { method: 'card', total_amount: '800.00', count: 1 },
  ],
  by_doctor: [
    { doctor_id: 7, doctor_name: 'CINTIA MORALES', total_amount: '1500.00', count: 2 },
    { doctor_id: null, doctor_name: 'Sin doctora asignada', total_amount: '500.00', count: 1 },
  ],
  by_received_by: [
    { user_id: 7, user_name: 'DRA. CINTIA', total_amount: '800.00', count: 1 },
    { user_id: 20, user_name: 'LUPITA', total_amount: '1200.00', count: 2 },
  ],
}

beforeEach(() => {
  sesion.user = { id: 1, role: 'admin' as Role }
  getCashCut.mockReset().mockResolvedValue(CORTE)
  apiGet.mockReset().mockResolvedValue({
    data: [{ id: 7, full_name: 'CINTIA MORALES' }, { id: 8, full_name: 'KARLA PÉREZ' }],
  })
})

describe('FinanzasDashboard', () => {
  it('muestra el corte por doctora y por quién recibió el dinero', async () => {
    render(<FinanzasDashboard />)

    expect(await screen.findByText('Por doctora (de quién es el ingreso)')).toBeInTheDocument()
    expect(screen.getByText('Sin doctora asignada')).toBeInTheDocument()
    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
    expect(screen.getByText('Por quién lo recibió (quién tiene el dinero)')).toBeInTheDocument()
    expect(screen.getByText('DRA. CINTIA')).toBeInTheDocument()
    expect(screen.getByText('LUPITA')).toBeInTheDocument()
  })

  it('arranca en "Todas" sin filtrar, y elegir doctora se pide al servidor', async () => {
    const user = userEvent.setup()
    render(<FinanzasDashboard />)
    await waitFor(() => expect(getCashCut).toHaveBeenCalled())
    expect(getCashCut.mock.calls[0][0]).toEqual({})

    await screen.findByRole('option', { name: 'KARLA PÉREZ' })
    await user.selectOptions(screen.getByLabelText('Doctora'), '8')

    await waitFor(() => expect(getCashCut).toHaveBeenLastCalledWith({ doctor_id: 8 }))
  })

  it('la doctora ve su corte sin selector ni desglose por doctora', async () => {
    sesion.user = { id: 7, role: Role.DOCTOR }
    render(<FinanzasDashboard />)

    expect(await screen.findByText('Mi corte de caja')).toBeInTheDocument()
    expect(screen.queryByLabelText('Doctora')).not.toBeInTheDocument()
    expect(screen.queryByText('Por doctora (de quién es el ingreso)')).not.toBeInTheDocument()
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('si el corte falla no deja a la vista los números de antes', async () => {
    const user = userEvent.setup()
    render(<FinanzasDashboard />)
    expect(await screen.findByText('$2,000.00', { selector: '.fs-5' })).toBeInTheDocument()

    getCashCut.mockRejectedValue(new Error('No se pudo cargar el corte.'))
    await user.type(screen.getByLabelText('Desde'), '2026-09-01')

    expect(await screen.findByText(/No se pudo cargar el corte./)).toBeInTheDocument()
    expect(screen.queryByText('$2,000.00', { selector: '.fs-5' })).not.toBeInTheDocument()
  })

  it('con un backend que no manda el desglose, lo dice en vez de "sin movimientos"', async () => {
    getCashCut.mockResolvedValue({ ...CORTE, by_doctor: undefined, by_received_by: undefined })
    render(<FinanzasDashboard />)

    expect(await screen.findAllByText('Este desglose todavía no está disponible.')).toHaveLength(2)
  })

  it('la secretaria elige sólo entre las doctoras que apoya, no el directorio', async () => {
    sesion.user = { id: 20, role: Role.SECRETARIA }
    getCashCut.mockResolvedValue({
      ...CORTE,
      alcance: 'asignadas',
      doctoras_del_alcance: [{ doctor_id: 7, doctor_name: 'CINTIA MORALES' }],
    })
    render(<FinanzasDashboard />)

    expect(await screen.findByRole('option', { name: 'Todas mis doctoras' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'CINTIA MORALES' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'KARLA PÉREZ' })).not.toBeInTheDocument()
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('la secretaria sin doctoras asignadas lee por qué no ve nada, no un día en ceros', async () => {
    sesion.user = { id: 20, role: Role.SECRETARIA }
    getCashCut.mockResolvedValue({
      ...CORTE,
      total_amount: '0',
      total_count: 0,
      by_method: [],
      by_doctor: [],
      by_received_by: [],
      alcance: 'asignadas',
      doctoras_del_alcance: [],
    })
    render(<FinanzasDashboard />)

    expect(
      await screen.findByText(/No tienes doctoras asignadas; pídele a administración que te asigne/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Total del día')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Doctora')).not.toBeInTheDocument()
  })
  it('la secretaria ve su caja completa aparte del corte de sus doctoras, sin dos cifras para ella', async () => {
    sesion.user = { id: 20, role: Role.SECRETARIA }
    getCashCut.mockResolvedValue({
      ...CORTE,
      alcance: 'asignadas',
      doctoras_del_alcance: [{ doctor_id: 7, doctor_name: 'CINTIA MORALES' }],
      mi_caja: {
        user_id: 20,
        user_name: 'LUPITA',
        total_amount: '3100.00',
        count: 4,
        by_method: [
          { method: 'cash', total_amount: '2300.00', count: 3 },
          { method: 'card', total_amount: '800.00', count: 1 },
        ],
      },
    })
    render(<FinanzasDashboard />)

    expect(await screen.findByText('Mi caja: lo que recibí')).toBeInTheDocument()
    expect(screen.getByText('Por doctora (las que apoyo)')).toBeInTheDocument()
    expect(screen.getByText('$3,100.00', { selector: '.fs-5' })).toBeInTheDocument()
    expect(screen.getByText('$2,300.00', { selector: '.fs-5' })).toBeInTheDocument()
    // Su fila del corte acotado ($1,200) diría otra cifra que su caja: no sale.
    expect(screen.queryByText('LUPITA')).not.toBeInTheDocument()
    expect(screen.getByText('DRA. CINTIA')).toBeInTheDocument()
    expect(screen.getByText(/Lo que recibiste tú está arriba, en «Mi caja»/)).toBeInTheDocument()
  })

  it('si sólo cobró ella, «Por quién lo recibió» no dice que no hubo movimientos', async () => {
    sesion.user = { id: 20, role: Role.SECRETARIA }
    getCashCut.mockResolvedValue({
      ...CORTE,
      by_received_by: [{ user_id: 20, user_name: 'LUPITA', total_amount: '2000.00', count: 3 }],
      alcance: 'asignadas',
      doctoras_del_alcance: [{ doctor_id: 7, doctor_name: 'CINTIA MORALES' }],
      mi_caja: { user_id: 20, user_name: 'LUPITA', total_amount: '2000.00', count: 3, by_method: [] },
    })
    render(<FinanzasDashboard />)

    expect(await screen.findByText('Nadie más recibió cobros de estas doctoras en este periodo.')).toBeInTheDocument()
  })

  it('sin doctoras asignadas igual ve su caja', async () => {
    sesion.user = { id: 20, role: Role.SECRETARIA }
    getCashCut.mockResolvedValue({
      ...CORTE,
      total_amount: '0',
      total_count: 0,
      by_method: [],
      by_doctor: [],
      by_received_by: [],
      alcance: 'asignadas',
      doctoras_del_alcance: [],
      mi_caja: { user_id: 20, user_name: 'LUPITA', total_amount: '600.00', count: 1, by_method: [{ method: 'cash', total_amount: '600.00', count: 1 }] },
    })
    render(<FinanzasDashboard />)

    expect(await screen.findByText('Mi caja: lo que recibí')).toBeInTheDocument()
    expect(screen.getByText(/No tienes doctoras asignadas/)).toBeInTheDocument()
    expect(screen.queryByText('Por doctora (las que apoyo)')).not.toBeInTheDocument()
  })
})

describe('FinanzasDashboard · si el corte no se pudo leer (plan 29, lote 6)', () => {
  it('lo dice y no pinta tablas de «No hay movimientos» ni totales en guion', async () => {
    getCashCut.mockRejectedValue(new Error('No tienes permiso para realizar esta acción.'))
    render(<FinanzasDashboard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se muestra el corte')
    expect(screen.queryByText('No hay movimientos en este periodo.')).not.toBeInTheDocument()
    expect(screen.queryByText('Transacciones')).not.toBeInTheDocument()
  })
})
