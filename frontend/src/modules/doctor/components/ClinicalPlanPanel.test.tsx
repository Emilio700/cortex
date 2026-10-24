/** Plan clínico: vacuna y medicamento con aviso junto al campo. */
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
// Las órdenes de estudio traen su propio estado y sus lecturas: aquí se mira
// sólo el bloque de vacunas y medicamentos.
vi.mock('./EstudiosDeLaConsulta', () => ({ default: () => null }))

import ClinicalPlanPanel from './ClinicalPlanPanel'

const montar = async () => {
  render(<ClinicalPlanPanel patientId={7} appointmentId={21} />)
  await screen.findByText('Vacunas y medicamentos')
  fireEvent.click(screen.getByRole('button', { name: /Vacunas y medicamentos/ }))
  await screen.findByLabelText('Vacuna')
}

beforeEach(() => {
  get.mockReset().mockResolvedValue({
    data: {
      active_pregnancy_id: null,
      immunizations: [],
      medication_exposures: [],
      diagnostic_orders: [],
    },
  })
  post.mockReset().mockResolvedValue({ data: {} })
})

describe('ClinicalPlanPanel · errores junto al campo', () => {
  it('sin nombre de vacuna avisa junto al campo y no llama al servidor', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar vacuna' }))

    expect(screen.getByText('Escribe la vacuna.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('el aviso de la vacuna se quita al escribir', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar vacuna' }))
    fireEvent.change(screen.getByLabelText('Vacuna'), { target: { value: 'Influenza' } })

    expect(screen.queryByText('Escribe la vacuna.')).not.toBeInTheDocument()
  })

  it('una vacuna de una letra se avisa: el servidor pide mínimo 2 caracteres', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText('Vacuna'), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar vacuna' }))

    expect(
      screen.getByText('El nombre de la vacuna debe tener al menos 2 caracteres.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('sin nombre de medicamento avisa y no se manda', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar seguimiento' }))

    expect(screen.getByText('Escribe el medicamento o suplemento.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('con nombre, la vacuna se registra', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText('Vacuna'), { target: { value: 'Influenza' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar vacuna' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/clinical-tracking/immunizations')
    expect(post.mock.calls[0][1]).toMatchObject({ vaccine_name: 'Influenza' })
  })
})
