/**
 * Seguimiento de un estudio atrasado (plan 32, punto 3): solo se da por
 * guardado lo que el servidor confirmó.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { post }, default: { post } }))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))
vi.mock('../../../shared/utils/date', async () => {
  const real = await vi.importActual<typeof import('../../../shared/utils/date')>('../../../shared/utils/date')
  return { ...real, hoyLocalISO: () => '2026-10-09' }
})

import RegistrarSeguimientoModal from './RegistrarSeguimientoModal'
import SeguimientoDeLaFila from './SeguimientoDeLaFila'

const ORDEN = { id: 7, study_name: 'Urocultivo', patient_name: 'Ana López' }

describe('RegistrarSeguimientoModal', () => {
  beforeEach(() => post.mockReset())

  it('manda motivo, nota y fecha, y avisa solo con la respuesta del servidor', async () => {
    const user = userEvent.setup()
    const onGuardado = vi.fn()
    const onClose = vi.fn()
    post.mockResolvedValue({ data: { id: 1, revisar_el: '2026-10-16' } })
    render(<RegistrarSeguimientoModal visible orden={ORDEN} onClose={onClose} onGuardado={onGuardado} />)

    expect(screen.getByLabelText('Volver a revisar el')).toHaveValue('2026-10-16')
    await user.selectOptions(screen.getByLabelText('¿Por qué sigue sin resultado?'), 'en_proceso_laboratorio')
    await user.type(screen.getByLabelText(/Nota/), 'Lo entregan el lunes')
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/clinical-tracking/orders/7/seguimientos', {
      motivo: 'en_proceso_laboratorio',
      nota: 'Lo entregan el lunes',
      revisar_el: '2026-10-16',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('con «Otro» pide la nota antes de dejar guardar', async () => {
    const user = userEvent.setup()
    render(<RegistrarSeguimientoModal visible orden={ORDEN} onClose={vi.fn()} onGuardado={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('¿Por qué sigue sin resultado?'), 'otro')
    expect(screen.getByRole('button', { name: 'Guardar seguimiento' })).toBeDisabled()
    await user.type(screen.getByLabelText(/Nota/), 'Se mudó')
    expect(screen.getByRole('button', { name: 'Guardar seguimiento' })).toBeEnabled()
  })

  it('si el servidor no lo guarda, lo dice y no cierra', async () => {
    const user = userEvent.setup()
    const onGuardado = vi.fn()
    const onClose = vi.fn()
    post.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'Este estudio ya no espera resultado.' } } })
    render(<RegistrarSeguimientoModal visible orden={ORDEN} onClose={onClose} onGuardado={onGuardado} />)
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ya no espera resultado')
    expect(onGuardado).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
  })
})

describe('SeguimientoDeLaFila', () => {
  it('dice cuántos días lleva atrasado y el último seguimiento con su autor', () => {
    render(
      <SeguimientoDeLaFila
        orden={{
          atrasada: true,
          dias_sin_resultado: 35,
          ultimo_seguimiento: {
            id: 1, diagnostic_order_id: 7, motivo: 'reagendado', motivo_texto: 'Se reagendó', nota: null,
            revisar_el: '2026-10-01', registrado_por_user_id: 3, registrado_por_nombre: 'Jhoany',
            created_at: '2026-09-25T10:00:00',
          },
        }}
      />,
    )
    expect(screen.getByText('Atrasado · 35 días sin resultado')).toBeInTheDocument()
    expect(screen.getByText(/Se reagendó · revisar el .* · Jhoany/)).toBeInTheDocument()
  })

  it('sin atraso ni seguimiento no pinta nada', () => {
    const { container } = render(<SeguimientoDeLaFila orden={{ atrasada: false }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
