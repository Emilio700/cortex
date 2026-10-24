/**
 * Sucursales: avisos junto al campo en vez del globo del navegador.
 *
 * Lo que se cuida: el nombre de al menos 3 caracteres (regla del servidor) y
 * el correo con forma válida cuando se escribe.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import TenantForm from './TenantForm'

const renderForm = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<TenantForm visible onClose={vi.fn()} onSubmit={onSubmit} />)
  return onSubmit
}

describe('TenantForm', () => {
  it('al enviar sin nombre avisa junto al campo y no llama al API', () => {
    const onSubmit = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('un nombre de menos de 3 caracteres se avisa y el aviso se quita al corregir', () => {
    const onSubmit = renderForm()

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('El nombre debe tener al menos 3 caracteres.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'abc' } })
    expect(screen.queryByText('El nombre debe tener al menos 3 caracteres.')).toBeNull()
  })

  it('rechaza un correo mal formado aunque el nombre esté bien', () => {
    const onSubmit = renderForm()

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Sucursal Centro' } })
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'sin-arroba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
