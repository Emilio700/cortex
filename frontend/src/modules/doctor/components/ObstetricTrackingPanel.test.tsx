/** Centro de seguimiento obstétrico: FPP, motivo e hito con aviso junto al campo. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('../../../shared/services/api', () => {
  const cliente = { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { apiClient: cliente, default: cliente }
})
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'doctor' } }),
}))

import ObstetricTrackingPanel from './ObstetricTrackingPanel'
import type { Pregnancy } from '../types/prenatal'

const embarazo = {
  id: 5,
  patient_id: 1,
  doctor_id: 1,
  status: 'active',
  dating_method: 'ultrasound',
  estimated_delivery_date: null,
  dating_status: 'pending',
  high_risk_status: 'unknown',
  outcome: 'ongoing',
} as unknown as Pregnancy

const montar = async () => {
  render(<ObstetricTrackingPanel pregnancy={embarazo} />)
  // El formulario de datación no se pinta hasta que termina la carga.
  await screen.findByRole('button', { name: 'Confirmar FPP' })
}

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: [] })
  post.mockReset().mockResolvedValue({ data: {} })
})

describe('ObstetricTrackingPanel · errores junto al campo', () => {
  it('aceptar la FPP sin fecha avisa junto al campo y no manda nada', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar FPP' }))

    expect(screen.getByText('Indica la fecha de la FPP aceptada.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('sin motivo no se manda: el historial tiene que decir por qué cambió la FPP', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText('FPP aceptada'), { target: { value: '2026-12-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar FPP' }))

    expect(screen.getByText('Escribe el motivo o la fuente de la FPP.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('los avisos se quitan al corregir cada campo', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar FPP' }))

    fireEvent.change(screen.getByLabelText('FPP aceptada'), { target: { value: '2026-12-20' } })
    fireEvent.change(screen.getByLabelText('Motivo / fuente'), {
      target: { value: 'Ultrasonido 12 SDG' },
    })

    expect(screen.queryByText('Indica la fecha de la FPP aceptada.')).not.toBeInTheDocument()
    expect(screen.queryByText('Escribe el motivo o la fuente de la FPP.')).not.toBeInTheDocument()
  })

  it('con FPP y motivo se manda la datación aceptada', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText('FPP aceptada'), { target: { value: '2026-12-20' } })
    fireEvent.change(screen.getByLabelText('Motivo / fuente'), {
      target: { value: 'Ultrasonido 12 SDG' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar FPP' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/clinical-tracking/pregnancies/5/dating-events')
    expect(post.mock.calls[0][1]).toMatchObject({
      accepted_delivery_date: '2026-12-20',
      status: 'accepted',
    })
  })

  it('un hito sin nombre avisa y no se manda; el aviso se quita al escribir', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar hito' }))

    expect(screen.getByText('Escribe el nombre del hito.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Próximo control / hito'), {
      target: { value: 'Control prenatal' },
    })
    expect(screen.queryByText('Escribe el nombre del hito.')).not.toBeInTheDocument()
  })

  it('un nombre de hito de una letra se avisa: el servidor pide mínimo 2 caracteres', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText('Próximo control / hito'), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar hito' }))

    expect(
      screen.getByText('El nombre del hito debe tener al menos 2 caracteres.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
