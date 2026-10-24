/**
 * La lista de triage es la de hoy.
 *
 * Antes pedía las citas sin fecha: el API devolvía las más recientes de
 * cualquier día y el paciente que llegaba hoy podía no aparecer, mientras la
 * pantalla decía «para hoy».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import TriagePage from './TriagePage'

const fetchAppointments = vi.fn()

vi.mock('../hooks/useAppointments', () => ({
  useAppointments: () => ({ loading: false, error: null, fetchAppointments }),
}))

const getTriageByAppointment = vi.fn()

vi.mock('../hooks/useTriage', () => ({
  useTriage: () => ({ getTriageByAppointment }),
}))

// El formulario simulado dice si se abrió y con qué signos, que es lo que
// importa: con la lectura fallida no debe abrirse la captura vacía.
vi.mock('../components/TriageForm', () => ({
  TriageForm: ({ visible, existingTriage }: { visible: boolean; existingTriage: unknown }) =>
    visible ? (
      <div data-testid="captura-signos">{existingTriage ? 'con signos' : 'vacía'}</div>
    ) : null,
}))

const fallo = (status?: number) => Object.assign(new Error('falló'), { status })

const cita = (id: number, hora: string, status: string, nombre: string) => ({
  id,
  scheduled_at: `2026-09-29T${hora}:00`,
  status,
  patient: { first_name: nombre, last_name: 'PRUEBA' },
  doctor: { full_name: 'DRA. X' },
})

describe('TriagePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 29, 10, 30))
    getTriageByAppointment.mockReset()
    fetchAppointments.mockReset().mockResolvedValue([
      cita(3, '12:00', 'en_sala', 'CARLA'),
      cita(1, '09:00', 'confirmada', 'ANA'),
      cita(2, '10:00', 'agendada', 'BETY'),
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pide sólo las citas del día local, de las 00:00 a las 23:59', async () => {
    render(<TriagePage />)
    await waitFor(() => expect(fetchAppointments).toHaveBeenCalled())

    const filtros = fetchAppointments.mock.calls[0][0]
    expect(filtros.start_date).toBe(new Date(2026, 8, 29, 0, 0, 0, 0).toISOString())
    expect(filtros.end_date).toBe(new Date(2026, 8, 29, 23, 59, 59, 999).toISOString())
  })

  it('muestra confirmadas y en sala, ordenadas por hora', async () => {
    render(<TriagePage />)

    await screen.findByText(/ANA/)
    const filas = screen.getAllByRole('row').slice(1)
    expect(filas).toHaveLength(2)
    expect(filas[0].textContent).toContain('09:00')
    expect(filas[0].textContent).toContain('ANA')
    expect(filas[1].textContent).toContain('12:00')
    expect(filas[1].textContent).toContain('CARLA')
    expect(screen.queryByText(/BETY/)).toBeNull()
  })

  it('vuelve a pedir la lista al regresar a la ventana', async () => {
    render(<TriagePage />)
    await waitFor(() => expect(fetchAppointments).toHaveBeenCalledTimes(1))

    fireEvent.focus(window)

    await waitFor(() => expect(fetchAppointments).toHaveBeenCalledTimes(2))
  })

  describe('al oprimir «Signos Vitales»', () => {
    const abrirSignosDeAna = async () => {
      render(<TriagePage />)
      await screen.findByText(/ANA/)
      fireEvent.click(screen.getAllByRole('button', { name: /Signos Vitales/ })[0])
    }

    it('sin signos (204) abre la captura vacía', async () => {
      getTriageByAppointment.mockResolvedValue(null)
      await abrirSignosDeAna()

      expect((await screen.findByTestId('captura-signos')).textContent).toBe('vacía')
      expect(getTriageByAppointment).toHaveBeenCalledWith(1)
    })

    it('con signos registrados abre la captura con ellos', async () => {
      getTriageByAppointment.mockResolvedValue({ id: 7, weight_kg: 60 })
      await abrirSignosDeAna()

      expect((await screen.findByTestId('captura-signos')).textContent).toBe('con signos')
    })

    it('sin acceso (403) no abre la captura ni ofrece reintentar', async () => {
      getTriageByAppointment.mockRejectedValue(fallo(403))
      await abrirSignosDeAna()

      await screen.findByText(/No tienes acceso a los signos vitales de este paciente/)
      expect(screen.queryByTestId('captura-signos')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    })

    it('con otro error no abre la captura vacía y permite reintentar', async () => {
      getTriageByAppointment.mockRejectedValueOnce(fallo(500)).mockResolvedValueOnce({ id: 7 })
      await abrirSignosDeAna()

      await screen.findByText(/No se pudieron cargar los signos vitales/)
      expect(screen.queryByTestId('captura-signos')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect((await screen.findByTestId('captura-signos')).textContent).toBe('con signos')
      expect(screen.queryByText(/No se pudieron cargar los signos vitales/)).toBeNull()
    })
  })
})
