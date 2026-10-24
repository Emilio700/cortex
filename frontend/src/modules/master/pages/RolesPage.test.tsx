/**
 * Roles personalizados: el aviso del nombre va junto al campo (antes se
 * pintaba al pie del modal, lejos de donde se escribe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const createRole = vi.hoisted(() => vi.fn())
const updateRole = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useCustomRoles', () => ({
  useCustomRoles: () => ({
    systemRoles: [],
    customRoles: [],
    loading: false,
    saving: false,
    error: null,
    createRole,
    updateRole,
    deleteRole: vi.fn(),
  }),
}))
vi.mock('../hooks/useMasterUsers', () => ({
  useMasterUsers: () => ({ loading: false, users: [] }),
}))

import { MemoryRouter } from 'react-router-dom'
import RolesPage from './RolesPage'

beforeEach(() => {
  createRole.mockReset().mockResolvedValue(true)
  updateRole.mockReset().mockResolvedValue(true)
})

describe('RolesPage', () => {
  it('sin nombre avisa junto al campo y no llama al API', () => {
    render(<MemoryRouter><RolesPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo Rol' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Rol' }))

    expect(screen.getByText('El nombre del rol es obligatorio')).toBeInTheDocument()
    expect(createRole).not.toHaveBeenCalled()
  })

  it('el aviso se quita al escribir y entonces sí guarda', async () => {
    render(<MemoryRouter><RolesPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo Rol' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Rol' }))
    expect(screen.getByText('El nombre del rol es obligatorio')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre del Rol'), { target: { value: 'Contador' } })
    expect(screen.queryByText('El nombre del rol es obligatorio')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Crear Rol' }))
    await waitFor(() => expect(createRole).toHaveBeenCalled())
    expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: 'Contador', base_role: 'secretaria' }))
  })
})
