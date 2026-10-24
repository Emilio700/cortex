/**
 * La ficha de recepción sin lo clínico (opción C, plan 32).
 *
 * Recepción captura nombre, contacto, fecha de nacimiento, alergias y FUR; los
 * antecedentes, la historia gineco-obstétrica y las notas de referencia de la
 * doctora no aparecen en su formulario ni salen en lo que guarda. El médico
 * sigue viendo el formulario completo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const sesion = vi.hoisted(() => ({ role: 'secretaria', permisos: [] as string[] }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: sesion.role }, can: (p: string) => sesion.permisos.includes(p) }),
}))
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../shared/services/api', () => {
  const cliente = { get, post: vi.fn().mockResolvedValue({ data: { telefonos: [], candidatos: [] } }), put: vi.fn() }
  return { apiClient: cliente, default: cliente }
})

import { PacienteForm } from './PacienteForm'
import type { Patient } from '../types'

const PACIENTE: Patient = {
  id: 9,
  tenant_id: 1,
  first_name: 'ANA',
  last_name: 'LÓPEZ',
  cell_phone: '6691112233',
  allergies: 'PENICILINA',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  antecedentes_visibles: false,
} as Patient

const onSubmit = vi.fn()

beforeEach(() => {
  get.mockResolvedValue({ data: [] })
  onSubmit.mockReset().mockResolvedValue(undefined)
  sesion.role = 'secretaria'
  sesion.permisos = []
})

describe('PacienteForm · recepción (opción C)', () => {
  it('el alta exprés pide alergias, opcional, y ya no la FUR de GEMS', () => {
    render(<PacienteForm visible onClose={vi.fn()} onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Alergias (opcional)')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Última menstruación/)).toBeNull()
  })

  it('al editar no muestra antecedentes ni notas de referencia, y dice quién los captura', () => {
    render(<PacienteForm visible onClose={vi.fn()} onSubmit={onSubmit} patient={PACIENTE} />)
    expect(screen.queryByLabelText('Antecedentes personales')).toBeNull()
    expect(screen.queryByLabelText('Implantes y dispositivos')).toBeNull()
    expect(screen.queryByLabelText('Notas de referencia')).toBeNull()
    expect(screen.getByText(/los captura el médico/)).toBeInTheDocument()
    // No dice «sin antecedentes»: no los ve, no es que no existan.
    expect(screen.queryByText(/sin antecedentes/i)).toBeNull()
  })

  it('lo que guarda no lleva ningún campo clínico', async () => {
    const user = userEvent.setup()
    render(<PacienteForm visible onClose={vi.fn()} onSubmit={onSubmit} patient={PACIENTE} />)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const [cuerpo] = onSubmit.mock.calls[0]
    for (const campo of ['personal_history', 'family_history', 'gynecological_history', 'gestas', 'notas_referencia']) {
      expect(cuerpo).not.toHaveProperty(campo)
    }
    expect(cuerpo.allergies).toBe('PENICILINA')
  })
})

describe('PacienteForm · el médico', () => {
  it('ve el formulario completo', () => {
    sesion.role = 'doctor'
    sesion.permisos = ['medical_history.read']
    render(
      <PacienteForm
        visible
        onClose={vi.fn()}
        onSubmit={onSubmit}
        patient={{ ...PACIENTE, antecedentes_visibles: true, personal_history: 'ASMA' }}
      />,
    )
    expect(screen.getByLabelText('Antecedentes personales')).toHaveValue('ASMA')
    expect(screen.getByLabelText('Lateralidad')).toBeInTheDocument()
    expect(screen.getByLabelText('Implantes y dispositivos')).toBeInTheDocument()
    expect(screen.getByLabelText('Anticoagulantes / antiagregantes')).toBeInTheDocument()
    expect(screen.queryByLabelText('Gestas')).toBeNull()
    expect(screen.getByLabelText('Notas de referencia')).toBeInTheDocument()
  })
})
