/**
 * Agenda (revisión de flujos): un fallo de carga no puede parecer «no hay
 * citas». Se prueba el aviso persistente con «Reintentar» del calendario, el
 * del resumen del mes del panel lateral y el de la ocupación ajena en la vista
 * por salas.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AgendaPage from './AgendaPage'
import { Role } from '../../../shared/types'
import { hoyDelConsultorio } from '../../../shared/utils/date'

const fetchAppointments = vi.fn()
const listSalas = vi.fn()
const apiGet = vi.fn()
const navigate = vi.fn()
const showError = vi.fn()
const showSuccess = vi.fn()

const sesion = { role: Role.DOCTOR as Role }

vi.mock('../hooks/useAppointments', () => ({
  useAppointments: () => ({ fetchAppointments }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showError, showSuccess }),
}))

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: sesion.role, full_name: 'DOCTORA PRUEBA' }, can: () => false }),
}))

vi.mock('../../../shared/services/salas', () => ({
  listSalas: (...args: unknown[]) => listSalas(...args),
}))

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get: (...args: unknown[]) => apiGet(...args) },
}))

// El calendario real (FullCalendar) no aporta nada a estas pruebas y pesa: se
// sustituye por un doble que entrega el rango visible, como el de verdad. El
// rango empieza a mitad del mes del consultorio: así no mueve el día elegido
// del panel y su petición se distingue de la del resumen del mes.
const diaBase = hoyDelConsultorio()
const primerDiaMes = `${diaBase.getFullYear()}-${String(diaBase.getMonth() + 1).padStart(2, '0')}-01`

vi.mock('../components/AgendaCalendar', () => ({
  AgendaCalendar: ({ onDatesSet }: { onDatesSet: (inicio: Date, fin: Date) => void }) => {
    React.useEffect(() => {
      onDatesSet(
        new Date(diaBase.getFullYear(), diaBase.getMonth(), 15),
        new Date(diaBase.getFullYear(), diaBase.getMonth() + 1, 15),
      )
      // `onDatesSet` es estable (useCallback sin dependencias) en la página.
    }, [onDatesSet])
    return <div data-testid="calendario" />
  },
}))

/** La petición del panel lateral (resumen del mes) empieza el día 1 del mes. */
const esPeticionDelPanel = (filtros?: { fecha_desde?: string }) =>
  filtros?.fecha_desde === primerDiaMes

beforeEach(() => {
  sesion.role = Role.DOCTOR
  fetchAppointments.mockReset()
  listSalas.mockReset().mockResolvedValue([])
  apiGet.mockReset().mockResolvedValue({ data: [] })
  navigate.mockReset()
})

describe('AgendaPage · la carga del calendario', () => {
  it('si falla, lo dice con un aviso que se queda y «Reintentar» que vuelve a pedir', async () => {
    fetchAppointments.mockImplementation(async (filtros?: { fecha_desde?: string }) => {
      if (esPeticionDelPanel(filtros)) return [] // el resumen del mes sí cargó
      throw new Error('Sin conexión')
    })
    const user = userEvent.setup()
    render(<AgendaPage />)

    expect(await screen.findByText(/No se pudieron cargar las citas\./)).toBeInTheDocument()

    // Reintentar vuelve a pedir: con datos, el aviso se retira.
    fetchAppointments.mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() =>
      expect(screen.queryByText(/No se pudieron cargar las citas\./)).not.toBeInTheDocument(),
    )
  })
})

describe('AgendaPage · el resumen del mes del panel', () => {
  it('si el mes falla, el panel lo dice y no afirma que no hay citas', async () => {
    fetchAppointments.mockImplementation(async (filtros?: { fecha_desde?: string }) => {
      if (esPeticionDelPanel(filtros)) throw new Error('Sin conexión')
      return []
    })
    render(<AgendaPage />)

    expect(await screen.findByText('No se pudo cargar el resumen del mes.')).toBeInTheDocument()
    expect(screen.queryByText(/No hay ninguna cita agendada/)).not.toBeInTheDocument()
    expect(screen.getByText(/Sin cifras: no se pudieron leer las citas del mes/)).toBeInTheDocument()
  })
})

describe('AgendaPage · ocupación ajena en la vista por salas', () => {
  it('si no se pudo leer, lo dice y no pinta las salas como libres', async () => {
    fetchAppointments.mockResolvedValue([])
    listSalas.mockResolvedValue([
      { id: 1, tenant_id: 1, name: 'Sala 1', is_active: true, display_order: 1 },
    ])
    apiGet.mockImplementation((url: string) =>
      String(url).includes('ocupacion-salas')
        ? Promise.reject(new Error('Sin conexión'))
        : Promise.resolve({ data: [] }),
    )
    const user = userEvent.setup()
    render(<AgendaPage />)

    await user.click(screen.getByRole('button', { name: /Por salas/ }))

    expect(
      await screen.findByText(/No se pudo leer la ocupación de las demás doctoras/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Libre · /)).not.toBeInTheDocument()

    const llamadasOcupacion = () =>
      apiGet.mock.calls.filter(([url]) => String(url).includes('ocupacion-salas')).length
    const antes = llamadasOcupacion()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(llamadasOcupacion()).toBe(antes + 1))
  })
})

describe('AgendaPage · encabezado de la página', () => {
  it('el título es el h1 (paso axe: la página no tenía nivel uno)', async () => {
    fetchAppointments.mockResolvedValue([])
    render(<AgendaPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument()
  })
})
