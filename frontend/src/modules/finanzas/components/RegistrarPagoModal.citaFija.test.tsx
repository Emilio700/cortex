/**
 * Cobrar desde la agenda (S-03): el modal de siempre, con la cita ya fija.
 *
 * Lo que tiene que sostenerse es lo mismo que desde Pagos: el pago va ligado a
 * la cita con su `client_request_id`, y una cita ya cobrada no se vuelve a
 * cobrar sin pasar por «Cobro adicional».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const get = vi.hoisted(() => vi.fn())
const createPayment = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))
vi.mock('../hooks/useFinanzas', () => ({
  useFinanzas: () => ({ createPayment, createConsultaExpress: vi.fn() }),
}))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import { RegistrarPagoModal } from './RegistrarPagoModal'

const cita = (id: number, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  patient_id: id * 10,
  status: 'en_sala',
  scheduled_at: '2026-09-29T10:00:00',
  patient: { first_name: nombre, last_name: 'PRUEBA' },
  estado_cobro: 'pendiente',
  ...extra,
})

const conCitas = (enSala: unknown[], atendidas: unknown[] = []) =>
  get.mockImplementation((url: string, config?: { params?: { status?: string } }) => {
    if (url === '/services') return Promise.resolve({ data: [] })
    return Promise.resolve({ data: config?.params?.status === 'en_sala' ? enSala : atendidas })
  })

const abrir = (citaFija: number | null) =>
  render(
    <RegistrarPagoModal
      visible
      onClose={vi.fn()}
      onRegistrado={vi.fn()}
      esDoctora={false}
      doctoras={[]}
      citaFija={citaFija}
    />,
  )

beforeEach(() => {
  get.mockReset()
  createPayment.mockReset()
})

describe('RegistrarPagoModal · cita fija desde la agenda', () => {
  it('muestra sólo esa cita, ya elegida, y sin la pestaña de cobro suelto', async () => {
    conCitas([cita(1, 'ANA'), cita(2, 'BETY')])
    abrir(2)

    const boton = await screen.findByRole('button', { name: /BETY PRUEBA/ })
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/ANA PRUEBA/)).not.toBeInTheDocument()
    expect(screen.queryByText('Cobro suelto (sin cita)')).not.toBeInTheDocument()
  })

  it('registra el pago ligado a la cita, con id de intento', async () => {
    conCitas([cita(2, 'BETY')])
    createPayment.mockResolvedValue({ id: 5, amount: '500.00', method: 'cash' })
    const user = userEvent.setup()
    abrir(2)

    await screen.findByRole('button', { name: /BETY PRUEBA/, pressed: true })
    await user.type(screen.getByLabelText(/Monto/), '500')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() => expect(createPayment).toHaveBeenCalled())
    const datos = createPayment.mock.calls[0][0]
    expect(datos.appointment_id).toBe(2)
    expect(datos.patient_id).toBe(20)
    expect(datos.client_request_id).toEqual(expect.any(String))
    expect(datos.cobro_adicional).toBeUndefined()
  })

  it('una cita ya cobrada no se elige sola: queda bloqueada como en Pagos', async () => {
    conCitas([], [cita(2, 'BETY', { status: 'atendida', estado_cobro: 'cobrada' })])
    const user = userEvent.setup()
    abrir(2)

    const boton = await screen.findByRole('button', { name: /BETY PRUEBA/ })
    expect(boton).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))

    expect(createPayment).not.toHaveBeenCalled()
    // Ahora también falta el monto y hay dos avisos a la vez: se busca el de la cita.
    expect(screen.getByText('Elige la cita que vas a cobrar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobro adicional…' })).toBeInTheDocument()
  })

  it('si la cita ya no está entre las de hoy en sala o atendidas, lo dice', async () => {
    conCitas([cita(1, 'ANA')])
    abrir(9)

    expect(await screen.findByText(/Esta cita no está entre las de hoy en sala o atendidas/)).toBeInTheDocument()
    expect(screen.queryByText(/ANA PRUEBA/)).not.toBeInTheDocument()
  })
})
