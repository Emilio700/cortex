/**
 * Recuperar contraseña: el correo se valida junto al campo, no con el globo
 * del navegador.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ForgotPasswordPage from './ForgotPasswordPage'

const montar = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )

const enviar = () => fireEvent.click(screen.getByRole('button', { name: /Enviar Enlace/ }))

describe('Recuperar contraseña · errores junto al campo', () => {
  it('sin correo lo dice debajo del campo', () => {
    montar()
    enviar()
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument()
  })

  it('un correo mal escrito se señala junto al campo', () => {
    montar()
    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: 'ana@' } })
    enviar()
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
  })
})
