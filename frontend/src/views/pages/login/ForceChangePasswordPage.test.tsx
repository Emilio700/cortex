/**
 * Cambio obligatorio de contraseña: los avisos van debajo de cada campo
 * (`noValidate` + ErrorDeCampo), no en el globo del navegador ni apilados en
 * una sola alerta.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ForceChangePasswordPage from './ForceChangePasswordPage'

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}))

const montar = () =>
  render(
    <MemoryRouter>
      <ForceChangePasswordPage />
    </MemoryRouter>,
  )

const enviar = () => fireEvent.click(screen.getByRole('button', { name: /Cambiar Contraseña/ }))

describe('Cambio obligatorio de contraseña · errores junto al campo', () => {
  it('sin datos pide cada campo debajo de él', () => {
    montar()
    enviar()
    expect(screen.getByText('Escribe tu contraseña actual.')).toBeInTheDocument()
    expect(screen.getByText('Escribe la nueva contraseña.')).toBeInTheDocument()
    expect(screen.getByText('Repite la nueva contraseña.')).toBeInTheDocument()
  })

  it('una contraseña corta se señala en su campo', () => {
    montar()
    fireEvent.change(screen.getByPlaceholderText('Tu contraseña actual'), { target: { value: 'vieja-123' } })
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'corta' } })
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'corta' } })
    enviar()
    expect(screen.getByText('La nueva contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument()
  })

  it('las contraseñas distintas se señalan en confirmar', () => {
    montar()
    fireEvent.change(screen.getByPlaceholderText('Tu contraseña actual'), { target: { value: 'vieja-123' } })
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'nueva-1234' } })
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'nueva-9999' } })
    enviar()
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
  })
})
