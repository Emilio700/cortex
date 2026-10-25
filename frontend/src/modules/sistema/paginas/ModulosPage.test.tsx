/**
 * Sistema → Módulos. Lo que no puede pasar: que diga «Guardado» sin que el
 * servidor lo haya confirmado, o que ofrezca un módulo que no existe.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const obtenerModulos = vi.fn()
const cambiarModulo = vi.fn()
vi.mock('../../../shared/services/modulos', () => ({
  obtenerModulos: () => obtenerModulos(),
  cambiarModulo: (id: string, activo: boolean) => cambiarModulo(id, activo),
}))
vi.mock('../../../shared/services/api', () => ({ apiClient: {} }))
const recargarModulos = vi.fn()
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ recargarModulos }) }))

import ModulosPage from './ModulosPage'

const TAREAS = {
  id: 'tareas',
  nombre: 'Tareas',
  descripcion: 'Pendientes del equipo.',
  servicio_requerido: null,
  servicio_configurado: true,
  activo: false,
}
const DICTADO = {
  id: 'dictado',
  nombre: 'Dictado',
  descripcion: 'Dicta la nota.',
  servicio_requerido: 'whisper',
  servicio_configurado: false,
  activo: false,
}

describe('Sistema → Módulos', () => {
  beforeEach(() => {
    obtenerModulos.mockReset()
    cambiarModulo.mockReset()
    recargarModulos.mockReset()
  })

  it('sin módulos construidos lo dice en vez de dejar la pantalla vacía', async () => {
    obtenerModulos.mockResolvedValue({ activos: [], modulos: [] })
    render(<ModulosPage />)
    expect(await screen.findByText('Aún no hay módulos opcionales instalados')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('dice «Guardado» solo cuando el servidor confirma, y avisa al menú', async () => {
    obtenerModulos.mockResolvedValue({ activos: [], modulos: [TAREAS] })
    let confirmar: (valor: unknown) => void = () => {}
    cambiarModulo.mockReturnValue(new Promise((r) => (confirmar = r)))
    render(<ModulosPage />)

    const interruptor = await screen.findByRole('checkbox', { name: 'Tareas' })
    await userEvent.click(interruptor)
    expect(cambiarModulo).toHaveBeenCalledWith('tareas', true)
    // Mientras el servidor no contesta: ni «Guardado» ni el interruptor encendido.
    expect(screen.queryByText(/Guardado/)).not.toBeInTheDocument()
    expect(interruptor).not.toBeChecked()

    confirmar({ ...TAREAS, activo: true })
    expect(await screen.findByText(/Guardado: encendido/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tareas' })).toBeChecked()
    expect(recargarModulos).toHaveBeenCalled()
  })

  it('si el guardado falla, el interruptor se queda como estaba y dice por qué', async () => {
    obtenerModulos.mockResolvedValue({ activos: [], modulos: [TAREAS] })
    cambiarModulo.mockRejectedValue({ response: { status: 500, data: {} } })
    render(<ModulosPage />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Tareas' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/Guardado/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tareas' })).not.toBeChecked()
    expect(recargarModulos).not.toHaveBeenCalled()
  })

  it('un módulo cuyo servicio no está configurado no se deja encender', async () => {
    obtenerModulos.mockResolvedValue({ activos: [], modulos: [DICTADO] })
    render(<ModulosPage />)
    const interruptor = await screen.findByRole('checkbox', { name: 'Dictado' })
    expect(interruptor).toBeDisabled()
    expect(screen.getByText(/Whisper.*no está configurado/)).toBeInTheDocument()
  })

  it('si no se pudieron cargar, lo dice y ofrece reintentar', async () => {
    obtenerModulos.mockRejectedValueOnce({ request: {} })
    obtenerModulos.mockResolvedValueOnce({ activos: [], modulos: [] })
    render(<ModulosPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Aún no hay módulos opcionales instalados')).toBeInTheDocument()
  })
})
