/**
 * Aviso de posibles pacientes duplicadas al dar de alta (S-06).
 *
 * Decisión 3.5: sólo advertir, sin bloquear. Lo que importa: se muestran las
 * candidatas, se puede seguir con «Es otra persona», se puede elegir la
 * existente, y al editar no se advierte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PacienteForm } from './PacienteForm'
import type { Patient } from '../types'

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'secretaria' } }),
}))

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('../../../shared/services/api', () => {
  const cliente = { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { apiClient: cliente, default: cliente }
})

const conCandidata = () => ({
  data: {
    telefonos: [{ campo: 'cell_phone', normalizado: '6691112233', valido: true }],
    candidatos: [
      {
        patient_id: 12,
        full_name: 'MARÍA LÓPEZ PÉREZ',
        date_of_birth: '1990-05-20',
        telefono_enmascarado: '•••-•••-2233',
        motivos: ['telefono', 'nombre'],
        coincidencia: 'alta',
      },
    ],
  },
})

beforeEach(() => {
  get.mockResolvedValue({ data: [] })
  post.mockReset()
})

describe('PacienteForm · aviso de posibles duplicadas', () => {
  it('al capturar apellido y celular avisa de una posible duplicada', async () => {
    post.mockResolvedValue(conCandidata())
    const user = userEvent.setup()
    render(
      <PacienteForm visible onClose={vi.fn()} onSubmit={vi.fn()} />,
    )

    await user.type(screen.getByLabelText(/Apellidos/), 'lópez')
    await user.type(screen.getByLabelText(/Celular/), '6691112233')

    expect(await screen.findByText('Puede que esta paciente ya esté registrada')).toBeInTheDocument()
    expect(screen.getByText('MARÍA LÓPEZ PÉREZ')).toBeInTheDocument()
    expect(screen.getByText(/mismo teléfono, mismo nombre/)).toBeInTheDocument()
    // Consultó el endpoint de posibles duplicados.
    expect(post).toHaveBeenCalledWith(
      '/patients/possible-duplicates',
      expect.objectContaining({ last_name: 'LÓPEZ' }),
    )
  })

  it('«Es otra persona, continuar» quita el aviso y deja seguir', async () => {
    post.mockResolvedValue(conCandidata())
    const user = userEvent.setup()
    render(
      <PacienteForm visible onClose={vi.fn()} onSubmit={vi.fn()} />,
    )

    await user.type(screen.getByLabelText(/Apellidos/), 'lópez')
    await user.click(await screen.findByRole('button', { name: 'Es otra persona, continuar' }))

    expect(screen.queryByText('Puede que esta paciente ya esté registrada')).toBeNull()
  })

  it('con onElegirExistente ofrece elegir la paciente existente', async () => {
    post.mockResolvedValue(conCandidata())
    const onElegir = vi.fn()
    const user = userEvent.setup()
    render(
      <PacienteForm visible onClose={vi.fn()} onSubmit={vi.fn()} onElegirExistente={onElegir} />,
    )

    await user.type(screen.getByLabelText(/Apellidos/), 'lópez')
    await user.click(await screen.findByRole('button', { name: 'Es esta paciente' }))

    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ patient_id: 12 }))
  })

  it('avisa si el teléfono no tiene 10 dígitos, sin bloquear', async () => {
    post.mockResolvedValue({
      data: {
        telefonos: [{ campo: 'cell_phone', normalizado: null, valido: false }],
        candidatos: [],
      },
    })
    const user = userEvent.setup()
    render(
      <PacienteForm visible onClose={vi.fn()} onSubmit={vi.fn()} />,
    )

    await user.type(screen.getByLabelText(/Apellidos/), 'lópez')
    await user.type(screen.getByLabelText(/Celular/), '12345')

    expect(await screen.findByText(/El teléfono debe tener 10 dígitos/)).toBeInTheDocument()
  })

  it('al editar una paciente no se consulta ni se advierte', async () => {
    post.mockResolvedValue(conCandidata())
    const paciente = {
      id: 12,
      first_name: 'MARÍA',
      last_name: 'LÓPEZ',
      date_of_birth: '1990-05-20',
    } as Patient
    const user = userEvent.setup()
    render(
      <PacienteForm visible onClose={vi.fn()} onSubmit={vi.fn()} patient={paciente} />,
    )

    // Cambiar el apellido no dispara el aviso al editar.
    const apellido = screen.getByLabelText(/Apellidos/)
    await user.clear(apellido)
    await user.type(apellido, 'lópez pérez')

    // Se da tiempo al debounce; no debe consultar ni mostrar el aviso.
    await new Promise((r) => setTimeout(r, 600))
    expect(post).not.toHaveBeenCalled()
    expect(screen.queryByText('Puede que esta paciente ya esté registrada')).toBeNull()
  })
})
