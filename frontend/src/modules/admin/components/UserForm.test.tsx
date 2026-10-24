/**
 * Formulario de usuario: tratamiento y doctoras que apoya la secretaria
 * (plan 23, ajustes del 2026-09-28).
 *
 * Lo que se cuida: que la pantalla no diga que guardó lo que no guardó, y que
 * un fallo al cargar las asignaciones no termine borrándolas al guardar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import UserForm from './UserForm'
import { Role, type User } from '../../../shared/types'

const apiGet = vi.fn()
const apiPut = vi.fn()

vi.mock('../../../shared/services/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => apiGet(...args),
    put: (...args: unknown[]) => apiPut(...args),
    post: vi.fn(),
  },
}))

const JHOANY: User = {
  id: 20,
  email: 'jhoany@gems.com',
  full_name: 'JHOANY',
  role: Role.SECRETARIA,
  tenant_id: 1,
  is_active: true,
  created_at: '2026-09-01',
}

const MÉDICOS = [
  { id: 7, full_name: 'ADOLFO RUIZ', role: Role.DOCTOR, is_active: true },
  { id: 8, full_name: 'CINTIA CASTRO', role: Role.DOCTOR, is_active: true },
]

const apoyo = (doctor_ids: number[], puede_ver_corte: boolean) => ({
  data: { secretaria_id: 20, doctor_ids, puede_ver_corte, permissions_version: 2 },
})

beforeEach(() => {
  apiGet.mockReset().mockImplementation((url: string) =>
    url === '/users' ? Promise.resolve({ data: MÉDICOS }) : Promise.resolve(apoyo([], false)),
  )
  apiPut.mockReset().mockImplementation((_url: string, datos: any) =>
    Promise.resolve(apoyo(datos.doctor_ids, datos.puede_ver_corte)),
  )
})

describe('UserForm', () => {
  it('en el alta se captura el tratamiento', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserForm visible onClose={vi.fn()} onSubmit={onSubmit} user={null} />)

    await user.type(screen.getByLabelText(/Correo/), 'yara@gems.com')
    await user.type(screen.getByLabelText(/Nombre completo/), 'YARA')
    await user.type(screen.getByLabelText(/Contraseña/), 'Segura-12345')
    await user.selectOptions(screen.getByLabelText('Tratamiento'), 'Dra.')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ tratamiento: 'Dra.' })
    // En el alta no hay doctoras que apoya: la usuaria todavía no existe.
    expect(screen.queryByText('Médicos que apoya')).not.toBeInTheDocument()
  })

  it('al editar a una secretaria guarda sus doctoras y el permiso del corte', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<UserForm visible onClose={onClose} onSubmit={vi.fn().mockResolvedValue(undefined)} user={JHOANY} />)

    await user.click(await screen.findByLabelText('ADOLFO RUIZ'))
    await user.click(screen.getByLabelText('Puede ver el corte de caja de esas doctoras'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(apiPut).toHaveBeenCalled())
    expect(apiPut).toHaveBeenCalledWith('/users/20/doctoras-que-apoya', {
      doctor_ids: [7],
      puede_ver_corte: true,
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('si no se guardaron los médicos lo dice y no cierra', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onGuardado = vi.fn()
    apiPut.mockRejectedValue({ response: { data: { detail: 'Error del servidor.' } } })
    render(
      <UserForm
        visible
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onGuardado={onGuardado}
        user={JHOANY}
      />,
    )

    await user.click(await screen.findByLabelText('CINTIA CASTRO'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText(/Los datos de la cuenta se guardaron, pero los médicos que apoya y el permiso del corte NO/),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    // Sin esto la página decía "Usuario actualizado correctamente" encima del error.
    expect(onGuardado).not.toHaveBeenCalled()
  })

  it('si no cargaron sus asignaciones no se ofrece cambiarlas ni se sobrescriben', async () => {
    const user = userEvent.setup()
    apiGet.mockImplementation((url: string) =>
      url === '/users'
        ? Promise.resolve({ data: MÉDICOS })
        : Promise.reject({ response: { data: { detail: 'Sin conexión.' } } }),
    )
    render(<UserForm visible onClose={vi.fn()} onSubmit={vi.fn().mockResolvedValue(undefined)} user={JHOANY} />)

    expect(await screen.findByText(/Esta sección no se puede cambiar hasta que carguen/)).toBeInTheDocument()
    expect(screen.queryByLabelText('ADOLFO RUIZ')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(apiPut).not.toHaveBeenCalled()
  })

  it('sin cambios en las asignaciones no las vuelve a mandar', async () => {
    const user = userEvent.setup()
    apiGet.mockImplementation((url: string) =>
      url === '/users' ? Promise.resolve({ data: MÉDICOS }) : Promise.resolve(apoyo([7], true)),
    )
    const onClose = vi.fn()
    render(<UserForm visible onClose={onClose} onSubmit={vi.fn().mockResolvedValue(undefined)} user={JHOANY} />)

    expect(await screen.findByLabelText('ADOLFO RUIZ')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(apiPut).not.toHaveBeenCalled()
  })

  it('al crear con faltantes avisa junto a cada campo y no llama al API', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserForm visible onClose={vi.fn()} onSubmit={onSubmit} user={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el nombre completo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Correo/)).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rechaza un correo mal formado y una contraseña corta antes de llamar al API', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserForm visible onClose={vi.fn()} onSubmit={onSubmit} user={null} />)

    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'yara.gems.com' } })
    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'YARA' } })
    fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: 'corta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(screen.getByText('La nueva contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('el aviso se retira en cuanto se corrige ese campo', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<UserForm visible onClose={vi.fn()} onSubmit={onSubmit} user={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'yara@gems.com' } })
    expect(screen.queryByText('Escribe tu correo.')).toBeNull()
    expect(screen.getByLabelText(/Correo/)).not.toHaveAttribute('aria-invalid')

    fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: 'Segura-12345' } })
    expect(screen.queryByText('Escribe tu contraseña.')).toBeNull()

    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'YARA' } })
    expect(screen.queryByText('Escribe el nombre completo.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })
})
