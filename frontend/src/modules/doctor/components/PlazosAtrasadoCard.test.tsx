import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, put } }))

import PlazosAtrasadoCard from './PlazosAtrasadoCard'

describe('PlazosAtrasadoCard (plan 32, punto 3)', () => {
  beforeEach(() => {
    get.mockReset()
    put.mockReset()
  })

  it('muestra los plazos guardados y guarda los nuevos', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue({ data: { urgent: 7, preferential: 15, routine: 30 } })
    put.mockResolvedValue({ data: { urgent: 3, preferential: 15, routine: 30 } })
    render(<PlazosAtrasadoCard />)
    const urgente = await screen.findByLabelText('Urgente')
    expect(urgente).toHaveValue(7)
    await user.clear(urgente)
    await user.type(urgente, '3')
    await user.click(screen.getByRole('button', { name: 'Guardar plazos' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/doctor-profile/me/plazos-atrasado', { urgent: 3, preferential: 15, routine: 30 }),
    )
    expect(await screen.findByText('Plazos guardados.')).toBeInTheDocument()
  })

  it('un valor fuera de 1 a 365 no deja guardar', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue({ data: { urgent: 7, preferential: 15, routine: 30 } })
    render(<PlazosAtrasadoCard />)
    const rutinaria = await screen.findByLabelText('Rutinaria')
    await user.clear(rutinaria)
    await user.type(rutinaria, '0')
    expect(screen.getByRole('button', { name: 'Guardar plazos' })).toBeDisabled()
  })

  it('si no se pudo leer, lo dice en vez de enseñar los de fábrica como si fueran suyos', async () => {
    get.mockRejectedValueOnce({ message: 'Network Error', request: {} })
    render(<PlazosAtrasadoCard />)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Urgente')).toBeNull()
  })
})
