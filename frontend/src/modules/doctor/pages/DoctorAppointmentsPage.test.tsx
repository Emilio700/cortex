/**
 * Mis Consultas (plan 32, punto 4): paginación del servidor, filtros en la
 * URL, acción según el estado, motivo recortado y resumen del día sin ceros
 * falsos.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMyAppointments = vi.fn()
const navigate = vi.fn()
const obtenerResumen = vi.hoisted(() => vi.fn())

vi.mock('../utils/resumenDelDia', () => ({ obtenerResumenDelDia: obtenerResumen }))
vi.mock('../../../shared/utils/date', async () => {
  const real = await vi.importActual<typeof import('../../../shared/utils/date')>('../../../shared/utils/date')
  return { ...real, hoyLocalISO: () => '2026-10-09' }
})

const cita = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  patient_id: 100 + id,
  doctor_id: 1,
  status: 'atendida',
  scheduled_at: '2026-10-01T10:00:00',
  duration_minutes: 30,
  notes: 'Seguimiento previo',
  has_triage: true,
  patient: { id: 100 + id, first_name: 'Ana', last_name: 'López', phone: '669 123 4567' },
  ...extra,
})

let citasDeVuelta: Array<Record<string, unknown>> = [cita(41)]
let totalDeVuelta: number | null = 1
let errorDeVuelta: string | null = null

vi.mock('../hooks/useDoctorAppointments', () => ({
  useDoctorAppointments: () => ({
    loading: false,
    error: errorDeVuelta,
    appointments: citasDeVuelta,
    total: totalDeVuelta,
    fetchMyAppointments,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import DoctorAppointmentsPage from './DoctorAppointmentsPage'

const montar = (hash = '#/doctor/appointments') => {
  window.location.hash = hash
  return render(
    <MemoryRouter>
      <DoctorAppointmentsPage />
    </MemoryRouter>,
  )
}
const ultimaPeticion = () => fetchMyAppointments.mock.calls[fetchMyAppointments.mock.calls.length - 1]?.[0]

describe('DoctorAppointmentsPage', () => {
  beforeEach(() => {
    fetchMyAppointments.mockReset()
    navigate.mockReset()
    obtenerResumen.mockReset()
    obtenerResumen.mockResolvedValue({ fecha: '2026-10-09', total: 6, pendientes: 2, atendidas: 4 })
    citasDeVuelta = [cita(41)]
    totalDeVuelta = 1
    errorDeVuelta = null
  })

  it('abre en «Últimos 30 días y próximas», lo más reciente primero, 25 por página', async () => {
    montar()
    await waitFor(() => expect(fetchMyAppointments).toHaveBeenCalled())
    expect(ultimaPeticion()).toEqual(
      expect.objectContaining({ fecha_desde: '2026-09-09', fecha_hasta: undefined, orden: 'desc', skip: 0, limit: 25 }),
    )
    expect(screen.getByRole('button', { name: 'Últimos 30 días y próximas' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('el resumen del día viene del servidor', async () => {
    montar()
    const resumen = await screen.findByText('Pendientes')
    await waitFor(() => expect(resumen.parentElement).toHaveTextContent('2'))
  })

  it('si el resumen no llega, no inventa números', async () => {
    obtenerResumen.mockReset()
    obtenerResumen.mockRejectedValue({ message: 'Network Error', request: {} })
    montar()
    expect(await screen.findByText(/No se pudo contar el día/)).toBeInTheDocument()
  })

  it('una consulta atendida se abre con «Ver consulta»', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Ver consulta/ }))
    expect(navigate).toHaveBeenCalledWith('/doctor/consultation/41')
  })

  it('la de hoy por atender dice «Iniciar consulta»; la de otro día, «Ver detalles»', () => {
    citasDeVuelta = [
      cita(1, { status: 'confirmada', scheduled_at: '2026-10-09T09:00:00' }),
      cita(2, { status: 'agendada', scheduled_at: '2026-10-15T09:00:00' }),
      cita(3, { status: 'en_consulta', scheduled_at: '2026-10-09T08:00:00' }),
    ]
    totalDeVuelta = 3
    montar()
    expect(screen.getByRole('button', { name: /Iniciar consulta/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver detalles/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar consulta/ })).toBeInTheDocument()
  })

  it('el motivo largo sale recortado y «ver más» lo abre', () => {
    citasDeVuelta = [cita(41, { notes: 'Nota clínica larga. '.repeat(10) })]
    montar()
    const boton = screen.getByRole('button', { name: 'ver más' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(boton)
    expect(screen.getByRole('button', { name: 'ver menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('pagina con el total del servidor y lo deja en la URL', async () => {
    citasDeVuelta = Array.from({ length: 25 }, (_, i) => cita(41 + i))
    totalDeVuelta = 130
    montar()
    expect(screen.getByText('Mostrando 1 a 25 de 130 consultas')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(ultimaPeticion()).toEqual(expect.objectContaining({ skip: 25, limit: 25 })))
    expect(window.location.hash).toBe('#/doctor/appointments?pagina=2')
  })

  it('cambiar el tamaño de página o un filtro vuelve a la página 1', async () => {
    citasDeVuelta = Array.from({ length: 25 }, (_, i) => cita(41 + i))
    totalDeVuelta = 130
    montar('#/doctor/appointments?pagina=3')
    await waitFor(() => expect(ultimaPeticion()).toEqual(expect.objectContaining({ skip: 50 })))
    fireEvent.change(screen.getByLabelText('Consultas por página'), { target: { value: '50' } })
    await waitFor(() => expect(ultimaPeticion()).toEqual(expect.objectContaining({ skip: 0, limit: 50 })))
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'cancelada' } })
    await waitFor(() => expect(ultimaPeticion()).toEqual(expect.objectContaining({ status: 'cancelada', skip: 0 })))
  })

  it('la búsqueda la hace el servidor (expediente o teléfono)', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('Búsqueda rápida'), { target: { value: '6691234567' } })
    await waitFor(() => expect(ultimaPeticion()).toEqual(expect.objectContaining({ q: '6691234567', skip: 0 })))
  })

  it('los atajos cambian el periodo; «Hoy» va en el orden en que se atiende', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))
    await waitFor(() =>
      expect(ultimaPeticion()).toEqual(
        expect.objectContaining({ fecha_desde: '2026-10-09', fecha_hasta: '2026-10-09', orden: 'asc' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Todo mi historial' }))
    await waitFor(() =>
      expect(ultimaPeticion()).toEqual(expect.objectContaining({ fecha_desde: undefined, fecha_hasta: undefined })),
    )
  })

  it('vuelve al mismo lugar con los filtros de la URL', async () => {
    montar('#/doctor/appointments?periodo=todo&estado=atendida&pagina=2')
    await waitFor(() =>
      expect(ultimaPeticion()).toEqual(expect.objectContaining({ status: 'atendida', skip: 25, fecha_desde: undefined })),
    )
  })

  it('sin total conocido no inventa un conteo', () => {
    totalDeVuelta = null
    montar()
    expect(screen.queryByText(/Mostrando/)).toBeNull()
  })

  it('un error al cargar se dice, no se lee como «no hay consultas»', () => {
    errorDeVuelta = 'No se pudieron cargar las citas.'
    citasDeVuelta = []
    montar()
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las citas.')
    expect(screen.queryByText('No hay consultas en este periodo')).toBeNull()
  })

  it('el renglón muestra expediente y teléfono', () => {
    montar()
    const lista = screen.getByRole('list')
    expect(within(lista).getByText('Exp. 141')).toBeInTheDocument()
    expect(within(lista).getByText(/669 123 4567/)).toBeInTheDocument()
  })
})
