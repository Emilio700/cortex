/**
 * Buscador de pacientes del encabezado (plan 28, Fase 4).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../services/api', () => ({ apiClient: { get } }))
const permisos = vi.hoisted(() => ({ actuales: ['patients.read', 'medical_history.read'] as string[] }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => permisos.actuales.includes(p) }),
}))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import BuscadorPacientes from './BuscadorPacientes'
import { pedir } from '../utils/pedidos'

const PACIENTES = [
  { id: 7, first_name: 'ANA', last_name: 'LÓPEZ', cell_phone: '6691112233', date_of_birth: '1990-05-20', expediente_legacy: 4521 },
  { id: 8, first_name: 'ANABEL', last_name: 'RUIZ', phone: null, date_of_birth: '1900-01-01' },
]

const montar = () =>
  render(
    <MemoryRouter>
      <BuscadorPacientes />
    </MemoryRouter>,
  )

const campo = () => screen.getByRole('combobox', { name: /Buscar paciente por nombre, teléfono o expediente/ })

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: PACIENTES })
  navigate.mockReset()
  permisos.actuales = ['patients.read', 'medical_history.read']
})

afterEach(() => vi.useRealTimers())

describe('BuscadorPacientes', () => {
  it('sin patients.read no se dibuja', () => {
    permisos.actuales = []
    montar()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('con menos de 2 caracteres no busca; después espera 300 ms y busca una sola vez', async () => {
    vi.useFakeTimers()
    montar()
    fireEvent.change(campo(), { target: { value: 'a' } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByText(/al menos 2/)).toBeInTheDocument()

    fireEvent.change(campo(), { target: { value: 'an' } })
    fireEvent.change(campo(), { target: { value: 'ana' } })
    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(get).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/patients', { params: { search: 'ana', limit: 8 } })
  })

  it('muestra nombre, edad, teléfono y expediente; oculta la fecha de relleno legacy', async () => {
    montar()
    await userEvent.type(campo(), 'ana')

    const opciones = await screen.findAllByRole('option')
    expect(opciones[0]).toHaveTextContent('ANA LÓPEZ')
    expect(opciones[0]).toHaveTextContent('Tel. 6691112233')
    expect(opciones[0]).toHaveTextContent('Exp. 4521')
    expect(opciones[0]).toHaveTextContent(/\d+ años/)
    expect(opciones[1]).not.toHaveTextContent('años')
  })

  it('con el teclado: flechas marcan la opción y Enter abre el expediente', async () => {
    montar()
    await userEvent.type(campo(), 'ana')
    await screen.findAllByRole('option')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(campo()).toHaveAttribute('aria-activedescendant', expect.stringContaining('opcion-1'))
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')

    expect(navigate).toHaveBeenCalledWith('/pacientes/8/expediente')
  })

  it('recepción abre el mismo expediente: un solo destino para todos (plan 32, punto 6)', async () => {
    permisos.actuales = ['patients.read']
    montar()
    await userEvent.type(campo(), 'ana')
    fireEvent.mouseDown((await screen.findAllByRole('option'))[0])

    expect(navigate).toHaveBeenCalledWith('/pacientes/7/expediente')
  })

  it('Esc cierra la lista', async () => {
    montar()
    await userEvent.type(campo(), 'ana')
    await screen.findAllByRole('option')

    await userEvent.keyboard('{Escape}')
    expect(campo()).toHaveAttribute('aria-expanded', 'false')
  })

  it('sin resultados lo dice; si falla, lo dice y deja reintentar (nunca «sin resultados»)', async () => {
    get.mockResolvedValueOnce({ data: [] })
    montar()
    await userEvent.type(campo(), 'zz')
    expect(await screen.findByText(/Ningún paciente coincide con «zz»/)).toBeInTheDocument()

    get.mockRejectedValueOnce({ response: { status: 500, data: {} } }).mockResolvedValueOnce({ data: PACIENTES })
    await userEvent.type(campo(), 'z')
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByText(/Ningún paciente/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findAllByRole('option')).toHaveLength(2)
  })

  it('Ctrl+K y el pedido del inicio lo enfocan', async () => {
    montar()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(campo()).toHaveFocus())

    campo().blur()
    let atendido = false
    act(() => {
      atendido = pedir('buscador:enfocar', true)
    })
    expect(atendido).toBe(true)
    await waitFor(() => expect(campo()).toHaveFocus())
  })
})
