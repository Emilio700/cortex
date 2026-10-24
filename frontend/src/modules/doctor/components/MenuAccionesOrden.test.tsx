/**
 * Menú «Más acciones» de una orden (plan 26, D-1).
 *
 * Lo que no puede pasar: volver a ofrecer los estados del laboratorio, cancelar
 * sin motivo, o dar por cambiado un estado que el servidor no confirmó.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
const permisos = vi.hoisted(() => ({ lista: ['clinical_tracking.update'] as string[] }))

vi.mock('../../../shared/services/api', () => ({ apiClient: { post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => permisos.lista.includes(p) }),
}))

import MenuAccionesOrden from './MenuAccionesOrden'

beforeEach(() => {
  post.mockReset()
  permisos.lista = ['clinical_tracking.update']
})

const abrirMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Más acciones' }))

describe('MenuAccionesOrden', () => {
  it('no ofrece aceptar, programar, muestra tomada ni en proceso aunque el servidor los permita', async () => {
    const user = userEvent.setup()
    render(
      <MenuAccionesOrden
        orderId={4}
        acciones={['accepted', 'scheduled', 'collected', 'in_process', 'cancelled', 'rejected']}
        onChanged={vi.fn()}
      />,
    )
    await abrirMenu(user)
    expect(screen.getByRole('button', { name: 'Cancelar orden' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar orden' })).toBeInTheDocument()
    for (const viejo of ['Aceptar', 'Programar', 'Muestra tomada', 'Marcar en proceso']) {
      expect(screen.queryByRole('button', { name: viejo })).toBeNull()
    }
  })

  it('sin permiso de actualizar y sin otras acciones no pinta nada', () => {
    permisos.lista = ['clinical_tracking.read']
    const { container } = render(
      <MenuAccionesOrden orderId={4} acciones={['cancelled']} onChanged={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('las acciones que pasa quien llama van en el mismo menú', async () => {
    const reimprimir = vi.fn()
    const user = userEvent.setup()
    render(
      <MenuAccionesOrden
        orderId={4}
        acciones={[]}
        onChanged={vi.fn()}
        extras={[{ etiqueta: 'Reimprimir solo este estudio', onClick: reimprimir }]}
      />,
    )
    await abrirMenu(user)
    await user.click(screen.getByRole('button', { name: 'Reimprimir solo este estudio' }))
    expect(reimprimir).toHaveBeenCalled()
  })

  it('cancelar exige motivo y solo avisa del cambio cuando el servidor lo confirma', async () => {
    post.mockResolvedValue({ data: {} })
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<MenuAccionesOrden orderId={4} acciones={['cancelled']} onChanged={onChanged} />)

    await abrirMenu(user)
    await user.click(screen.getByRole('button', { name: 'Cancelar orden' }))
    const confirmar = screen.getByRole('button', { name: 'Confirmar' })
    expect(confirmar).toBeDisabled()

    await user.type(screen.getByLabelText('Motivo de la cancelación'), 'El paciente ya lo trae')
    await user.click(confirmar)

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/clinical-tracking/orders/4/status', {
      status: 'cancelled',
      reason: 'El paciente ya lo trae',
    })
  })

  it('si el servidor rechaza el cambio, muestra su motivo y no avisa', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { detail: 'La orden ya fue revisada.' } } })
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<MenuAccionesOrden orderId={4} acciones={['rejected']} onChanged={onChanged} />)

    await abrirMenu(user)
    await user.click(screen.getByRole('button', { name: 'Rechazar orden' }))
    await user.type(screen.getByLabelText('Motivo del rechazo'), 'Duplicada')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La orden ya fue revisada.')
    expect(onChanged).not.toHaveBeenCalled()
  })
})
