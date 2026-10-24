/** Reportes: un fallo no deja las cifras de otro periodo a la vista (plan 29). */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const getSummary = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useReports', () => ({ useReports: () => ({ getSummary }) }))
vi.mock('../../../shared/components/ToastProvider', () => ({ useToast: () => ({ showError: vi.fn() }) }))
vi.mock('@coreui/react-chartjs', () => ({ CChart: () => null }))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }))

import ReportsPage from './ReportsPage'

const RESUMEN = {
  start_date: '2026-10-01T00:00:00',
  end_date: '2026-10-04T23:59:59',
  appointments_total: 12,
  appointments_by_status: [],
  appointments_daily: [],
  top_services: [],
  patients_attended_count: 9,
  patients_attended_daily: [],
}

describe('ReportsPage', () => {
  it('si «Aplicar» falla no deja las cifras del periodo anterior; lo dice y deja reintentar', async () => {
    getSummary.mockResolvedValueOnce(RESUMEN).mockRejectedValueOnce(new Error('El servidor no respondió.'))
    render(<ReportsPage />)
    expect(await screen.findByText('12')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no respondió.')
    expect(screen.queryByText('12')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('si se cambian las fechas sin aplicar, avisa de qué periodo son las cifras', async () => {
    getSummary.mockResolvedValue(RESUMEN)
    render(<ReportsPage />)
    await screen.findByText('12')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    expect(screen.getByText(/Pulsa/)).toHaveTextContent(/Las cifras son del/)
  })
})

describe('ReportsPage · periodo y enlaces (plan 29, lote 5)', () => {
  it('«Servicios más solicitados» dice de qué periodo es y las citas llevan a la agenda', async () => {
    getSummary.mockResolvedValue(RESUMEN)
    render(<ReportsPage />)

    expect(await screen.findByText(/Cobros vigentes del/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /12\s*Citas en el periodo · ver agenda/ }))
    expect(navigate).toHaveBeenCalledWith('/secretaria/agenda')
  })
})
