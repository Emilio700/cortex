/**
 * Restablecer contraseña: los avisos van debajo de cada campo, no en el
 * globo del navegador.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ResetPasswordPage from './ResetPasswordPage'

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/reset-password?token=abc123']}>
      <ResetPasswordPage />
    </MemoryRouter>,
  )

const enviar = () => fireEvent.click(screen.getByRole('button', { name: /Restablecer Contraseña/ }))

describe('Restablecer contraseña · errores junto al campo', () => {
  it('sin datos pide cada campo debajo de él', () => {
    montar()
    enviar()
    expect(screen.getByText('Escribe la nueva contraseña.')).toBeInTheDocument()
    expect(screen.getByText('Repite la nueva contraseña.')).toBeInTheDocument()
  })

  it('las contraseñas distintas se señalan en confirmar', () => {
    montar()
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'nueva-1234' } })
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'nueva-0000' } })
    enviar()
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
  })
})
