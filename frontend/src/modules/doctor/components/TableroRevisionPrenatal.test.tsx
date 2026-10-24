import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TableroRevisionPrenatal, { type RevisionPendiente } from './TableroRevisionPrenatal'

const get = vi.fn()

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args) },
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const pendiente = (extra: Partial<RevisionPendiente> = {}): RevisionPendiente => ({
  pregnancy_id: 1,
  patient_id: 10,
  patient_full_name: 'María López',
  next_review_on: '2026-10-01',
  dias_de_atraso: 3,
  vencida: true,
  avisado_a_recepcion: false,
  ...extra,
})

beforeEach(() => {
  get.mockReset()
})

describe('Tablero de controles prenatales sin cita', () => {
  it('muestra al paciente que debía volver y no está agendada', async () => {
    get.mockResolvedValue({ data: [pendiente()] })

    render(<TableroRevisionPrenatal />)

    expect(await screen.findByText('María López')).toBeInTheDocument()
    expect(screen.getByText(/Venció hace 3 días/)).toBeInTheDocument()
  })

  it('dice si recepción ya fue avisada, que es lo primero que se pregunta', async () => {
    // Sin esto el médico no puede distinguir "nadie sabe" de "ya está en manos
    // de recepción", y termina llamando ella a pacientes que ya iban a ser
    // llamadas.
    get.mockResolvedValue({ data: [pendiente({ avisado_a_recepcion: true })] })

    render(<TableroRevisionPrenatal />)

    expect(await screen.findByText(/Recepción ya fue avisada/)).toBeInTheDocument()
  })

  it('no dibuja nada cuando no hay pendientes', async () => {
    // Una tarjeta que dice "todo bien" ocupa el mismo lugar todos los días y
    // enseña a ignorar ese lugar; el día que aparezca algo, ya nadie mira ahí.
    get.mockResolvedValue({ data: [] })

    const { container } = render(<TableroRevisionPrenatal />)

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('un error del servidor no tapa el resto del tablero del médico', async () => {
    // El tablero es apoyo, no la ruta crítica de la consulta.
    get.mockRejectedValue(new Error('500'))

    const { container } = render(<TableroRevisionPrenatal />)

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('distingue la revisión que todavía no llega de la que ya venció', async () => {
    get.mockResolvedValue({ data: [pendiente({ dias_de_atraso: -2, vencida: false })] })

    render(<TableroRevisionPrenatal />)

    expect(await screen.findByText(/Le toca en 2 días/)).toBeInTheDocument()
    expect(screen.getByText('Próxima')).toBeInTheDocument()
  })
})
