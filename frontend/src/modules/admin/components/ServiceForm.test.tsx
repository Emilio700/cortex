/**
 * Servicios: avisos junto al campo en vez del globo del navegador.
 *
 * Lo que se cuida: que un formulario incompleto no llegue al servidor y que
 * el precio/duración respeten las reglas del backend (precio >= 0, duración > 0).
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import ServiceForm from './ServiceForm'

const renderForm = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<ServiceForm visible onClose={vi.fn()} onSubmit={onSubmit} service={null} />)
  return onSubmit
}

describe('ServiceForm', () => {
  it('al enviar con faltantes avisa junto a los campos y no llama al API', () => {
    const onSubmit = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el precio.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rechaza precio negativo y duración no positiva sin llamar al API', () => {
    const onSubmit = renderForm()

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Consulta general' } })
    fireEvent.change(screen.getByLabelText(/Precio/), { target: { value: '-10' } })
    fireEvent.change(screen.getByLabelText(/Duración/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('El precio no puede ser negativo.')).toBeInTheDocument()
    expect(screen.getByText('La duración debe ser mayor a 0.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('el aviso se quita en cuanto se corrige ese campo', () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el precio.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Consulta general' } })
    expect(screen.queryByText('Escribe el nombre.')).toBeNull()
    expect(screen.getByText('Escribe el precio.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Precio/), { target: { value: '150' } })
    expect(screen.queryByText('Escribe el precio.')).toBeNull()
  })
})
