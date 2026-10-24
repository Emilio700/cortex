/**
 * Salas: avisos junto al campo en vez del globo del navegador.
 *
 * Lo que se cuida: el nombre es obligatorio y el orden tiene que quedar entre
 * 1 y 99 (mismo tope que tenían los atributos nativos del campo).
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import SalaForm from './SalaForm'

const renderForm = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<SalaForm visible onClose={vi.fn()} onSubmit={onSubmit} />)
  return onSubmit
}

describe('SalaForm', () => {
  it('al enviar sin nombre avisa junto al campo y no llama al API', () => {
    const onSubmit = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rechaza un orden fuera de 1 a 99 sin llamar al API', () => {
    const onSubmit = renderForm()

    fireEvent.change(screen.getByLabelText('Orden'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Consultorio 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Escribe un número entre 1 y 99.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('el aviso se quita en cuanto se escribe el nombre y entonces sí guarda', async () => {
    const onSubmit = renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Consultorio 1' } })
    expect(screen.queryByText('Escribe el nombre.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Consultorio 1', display_order: 1 }))
  })
})
